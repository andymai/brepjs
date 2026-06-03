import { type Result, ok, err, validationError, getEdges, curveStartPoint } from 'brepjs';
import type { FlatPattern, SheetMetalWarning } from './types.js';
import { multiPatternToDXF, type DxfOptions, type Transform2, type PlacedPattern } from './dxfFns.js';
import {
  wireToPolygon,
  transformPolygon,
  polygonBounds,
  polygonsOverlapWithClearance,
  signedArea,
  type Polygon,
} from './polygonFns.js';

/** Stock sheet the parts are packed onto (the gross blank, before margin). */
export interface SheetSpec {
  width: number;
  height: number;
}

export interface NestOptions {
  sheet: SheetSpec;
  /** Clear border kept empty around the sheet edge (per side). Default `0`. */
  margin?: number | undefined;
  /** Minimum clear gap between any two placed parts (and the bbox padding used
   * for the non-overlap test). Default `0`. */
  spacing?: number | undefined;
  /** Try a 90° rotation per part and keep whichever orientation fits/packs better. */
  allowRotation?: boolean | undefined;
  /**
   * Packing strategy. Default `"bbox"`: each part is packed as its axis-aligned
   * bounding box (the original {@link nest} behavior — fast, parts never interlock).
   * `"nfp"` is true-shape / no-fit-polygon nesting: the actual outline polygons are
   * packed so concave (L-shaped) parts interlock for higher material utilization.
   * The NFP packer is a HEURISTIC (bottom-left-fill, largest-first) — not provably
   * optimal — but it never overlaps parts and never drops a part silently.
   */
  strategy?: 'bbox' | 'nfp' | undefined;
}

/**
 * Where a single pattern lands on a sheet. For the bbox strategy `rotationDeg` is
 * `0` or `90`; the true-shape (nfp) strategy may also emit `180` or `270`. `(x, y)`
 * is the lower-left of the part's transformed bounding box in sheet coordinates.
 */
export interface Placement {
  /** Index into the `patterns` array passed to {@link nest}. */
  patternIndex: number;
  /** Lower-left x of the part's (rotated) bounding box, in sheet coordinates. */
  x: number;
  /** Lower-left y of the part's (rotated) bounding box, in sheet coordinates. */
  y: number;
  rotationDeg: number;
}

export interface NestSheet {
  placements: Placement[];
  /**
   * Σ placed part areas ÷ usable-sheet area, in `(0, 1]`. "Usable" =
   * `(width − 2·margin) × (height − 2·margin)`. For the `"bbox"` strategy the part
   * area is its BOUNDING-BOX area (intra-bbox waste of a non-rectangular part is not
   * credited — a conservative measure). For the `"nfp"` true-shape strategy it is the
   * actual OUTLINE-POLYGON area, so an L-shaped part credits only its true material,
   * making the two strategies' utilizations directly comparable on the same parts.
   */
  utilization: number;
}

export interface NestResult {
  sheets: NestSheet[];
  /** Indices of patterns too large for the usable sheet even rotated. */
  unplaced: number[];
  warnings: SheetMetalWarning[];
}

/** Axis-aligned bounding box of one pattern outline, in developed-plane coords. */
export interface Bbox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

const EPS = 1e-9;

/**
 * Bounding-box nest: arrange developed flat patterns onto stock sheets to reduce
 * waste. This is BOUNDING-BOX nesting — each part is packed as its axis-aligned
 * outline bounding box, so parts never interlock and concave parts leave their
 * bounding-box waste unused. True-shape (no-fit-polygon) nesting is a follow-up.
 *
 * Algorithm: a shelf (level) packing heuristic. Parts are sorted largest-first by
 * bbox height then area, then placed left-to-right into horizontal shelves; a new
 * shelf opens below when the current row is full, and a NEW sheet opens when the
 * next shelf would overflow the usable height. With `allowRotation`, each part is
 * tried both at 0° and 90° and the orientation that fits the current shelf (or,
 * failing that, fits at all) is kept. A part larger than the usable sheet even
 * rotated is reported in `unplaced` with a warning — never dropped silently, never
 * retried in an infinite loop.
 */
export function nest(patterns: FlatPattern[], options: NestOptions): Result<NestResult> {
  const { sheet } = options;
  const margin = options.margin ?? 0;
  const spacing = options.spacing ?? 0;
  const allowRotation = options.allowRotation ?? false;

  if (!Number.isFinite(sheet.width) || sheet.width <= 0 || !Number.isFinite(sheet.height) || sheet.height <= 0) {
    return err(validationError('INVALID_SHEET', `sheet width/height must be positive, got ${sheet.width}×${sheet.height}`));
  }
  if (!Number.isFinite(margin) || margin < 0 || !Number.isFinite(spacing) || spacing < 0) {
    return err(validationError('INVALID_NEST_OPTS', `margin and spacing must be non-negative finite numbers, got margin=${margin} spacing=${spacing}`));
  }

  const usableW = sheet.width - 2 * margin;
  const usableH = sheet.height - 2 * margin;
  if (usableW <= EPS || usableH <= EPS) {
    return err(validationError('INVALID_SHEET', `margin ${margin} leaves no usable area on a ${sheet.width}×${sheet.height} sheet`));
  }

  if (options.strategy === 'nfp') {
    return nestNfp(patterns, margin, spacing, allowRotation, usableW, usableH);
  }

  const boxes: Bbox[] = [];
  for (const pattern of patterns) {
    const b = patternBbox(pattern);
    if (!b.ok) return b;
    boxes.push(b.value);
  }

  const usableArea = usableW * usableH;
  const warnings: SheetMetalWarning[] = [];
  const unplaced: number[] = [];

  // Largest-first by height then area — the standard shelf-packing sort that keeps
  // tall parts from fragmenting later shelves.
  const order = boxes.map((_, i) => i).sort((a, b) => {
    const ba = boxes[a];
    const bb = boxes[b];
    if (ba === undefined || bb === undefined) return 0;
    if (Math.abs(bb.height - ba.height) > EPS) return bb.height - ba.height;
    return bb.width * bb.height - ba.width * ba.height;
  });

  const placeable: number[] = [];
  for (const idx of order) {
    const box = boxes[idx];
    if (box === undefined) continue;
    const fits = fitsUsable(box, usableW, usableH, false);
    const fitsRot = allowRotation && fitsUsable(box, usableW, usableH, true);
    if (!fits && !fitsRot) {
      unplaced.push(idx);
      warnings.push({
        code: 'PART_TOO_LARGE',
        message: `pattern ${idx} (${box.width.toFixed(2)}×${box.height.toFixed(2)}) does not fit the usable sheet ${usableW.toFixed(2)}×${usableH.toFixed(2)} even rotated; left unplaced`,
        featureId: `pattern-${idx}`,
      });
      continue;
    }
    placeable.push(idx);
  }

  const { sheets, dropped } = packShelves(placeable, boxes, usableW, usableH, margin, spacing, allowRotation, usableArea);
  for (const idx of dropped) {
    // Should be unreachable (pre-filtered parts fit an empty sheet); guards against
    // a future regression silently dropping a part.
    unplaced.push(idx);
    warnings.push({
      code: 'PART_TOO_LARGE',
      message: `pattern ${idx} could not be placed on a fresh sheet; left unplaced`,
      featureId: `pattern-${idx}`,
    });
  }

  unplaced.sort((a, b) => a - b);
  return ok({ sheets, unplaced, warnings });
}

/** A part outline normalised to the developed-plane origin, with its candidate
 * orientations precomputed. Each orientation's polygon is anchored so its own
 * bounding box lower-left sits at `(0, 0)`. */
interface NfpPart {
  index: number;
  /** Outline area (orientation-invariant) — used for the largest-first sort. */
  area: number;
  /** Candidate orientations to try, largest-first packing keeps the lowest-left fit. */
  orientations: NfpOrientation[];
}

interface NfpOrientation {
  rotationDeg: number;
  /** Polygon anchored with its bounding-box lower-left at the origin. */
  poly: Polygon;
  /** Width/height of the (rotated) bounding box. */
  w: number;
  h: number;
}

/** One concrete placement on the current sheet: the orientation polygon translated
 * to its sheet position, kept (with its cached bounds) for the overlap test against
 * later parts. */
interface PlacedPoly {
  poly: Polygon;
  bounds: [number, number, number, number];
}

const NFP_ROTATIONS = [0, 90, 180, 270];

/**
 * True-shape (no-fit-polygon) nest. Packs the actual outline polygons so concave
 * parts interlock. This is a HEURISTIC bottom-left-fill packer (not provably
 * optimal): parts are placed largest-first; each part slides to the lowest-then-
 * leftmost feasible position on the current sheet where its outline polygon does not
 * overlap (within `spacing`) any already-placed polygon and stays inside the usable
 * area. Feasible positions are found by a discretised raster scan (a finite grid
 * stepped by a fraction of the smallest part extent), so the search always
 * terminates and a part can slide into a neighbour's concave notch.
 *
 * Each part is tried at 0/90/180/270° (90/270 only when `allowRotation`; 0/180
 * otherwise — 180° keeps the footprint but enables interlocking); the orientation
 * giving the lowest-leftmost feasible placement wins. A part that fits no position on
 * the current sheet opens a new sheet; one that fits no empty sheet in any orientation
 * goes to `unplaced` with a PART_TOO_LARGE warning — never dropped, never an infinite
 * loop.
 */
function nestNfp(
  patterns: FlatPattern[],
  margin: number,
  spacing: number,
  allowRotation: boolean,
  usableW: number,
  usableH: number
): Result<NestResult> {
  const parts: NfpPart[] = [];
  for (let i = 0; i < patterns.length; i += 1) {
    const pattern = patterns[i];
    if (pattern === undefined) continue;
    const built = buildNfpPart(i, pattern, allowRotation);
    if (!built.ok) return built;
    parts.push(built.value);
  }

  const usableArea = usableW * usableH;
  const warnings: SheetMetalWarning[] = [];
  const unplaced: number[] = [];

  // Largest-first by outline area — large concave parts placed first leave pockets
  // the smaller parts can interlock into.
  parts.sort((a, b) => b.area - a.area);

  // Bottom-left-fill raster step: a fraction of the smallest part extent. Finer steps
  // find tighter interlocks at more cost; this fixed ratio keeps the packer
  // deterministic and bounded (the scan grid is finite, so it always terminates).
  const step = rasterStep(parts, usableW, usableH);

  // Pre-filter parts that fit no empty usable sheet in any tried orientation.
  const placeable: NfpPart[] = [];
  for (const part of parts) {
    const fits = part.orientations.some((o) => o.w <= usableW + EPS && o.h <= usableH + EPS);
    if (!fits) {
      unplaced.push(part.index);
      const o0 = part.orientations[0];
      const dims = o0 === undefined ? '?' : `${o0.w.toFixed(2)}×${o0.h.toFixed(2)}`;
      warnings.push({
        code: 'PART_TOO_LARGE',
        message: `pattern ${part.index} (${dims}) does not fit the usable sheet ${usableW.toFixed(2)}×${usableH.toFixed(2)} even rotated; left unplaced`,
        featureId: `pattern-${part.index}`,
      });
      continue;
    }
    placeable.push(part);
  }

  const sheets: NestSheet[] = [];
  let current: PlacedPoly[] = [];
  let placements: Placement[] = [];
  let currentArea = 0;

  const flush = (): void => {
    if (placements.length === 0) return;
    sheets.push({ placements, utilization: currentArea / usableArea });
  };

  for (const part of placeable) {
    const placed = placeOnSheet(part, current, spacing, margin, usableW, usableH, step);
    if (placed === undefined) {
      // Current sheet full for this part — close it and start fresh. Every placeable
      // part fits an empty usable sheet, so this retry must succeed; if it somehow
      // does not, route the part to unplaced (self-enforcing safety net, no loop).
      flush();
      current = [];
      placements = [];
      currentArea = 0;
      const retry = placeOnSheet(part, current, spacing, margin, usableW, usableH, step);
      if (retry === undefined) {
        unplaced.push(part.index);
        warnings.push({
          code: 'PART_TOO_LARGE',
          message: `pattern ${part.index} could not be placed on a fresh sheet; left unplaced`,
          featureId: `pattern-${part.index}`,
        });
        continue;
      }
      current.push({ poly: retry.poly, bounds: polygonBounds(retry.poly) });
      placements.push(retry.placement);
      currentArea += part.area;
      continue;
    }
    current.push({ poly: placed.poly, bounds: polygonBounds(placed.poly) });
    placements.push(placed.placement);
    currentArea += part.area;
  }

  flush();
  unplaced.sort((a, b) => a - b);
  return ok({ sheets, unplaced, warnings });
}

/** Build the orientation set for one pattern outline (origin-anchored polygons). */
function buildNfpPart(index: number, pattern: FlatPattern, allowRotation: boolean): Result<NfpPart> {
  const polyResult = wireToPolygon(pattern.outline);
  if (!polyResult.ok) return polyResult;
  let base = polyResult.value;
  // Normalise to CCW so the area sign and point-in-polygon orientation are consistent.
  if (signedArea(base) < 0) base = base.slice().reverse();
  const area = Math.abs(signedArea(base));
  if (area <= EPS) {
    return err(validationError('EMPTY_OUTLINE', `pattern ${index} outline has degenerate area`));
  }

  const rotations = allowRotation ? NFP_ROTATIONS : [0, 180];
  const orientations: NfpOrientation[] = [];
  const seen = new Set<string>();
  for (const rot of rotations) {
    const rotated = transformPolygon(base, 0, 0, rot);
    const [minX, minY, maxX, maxY] = polygonBounds(rotated);
    const anchored = transformPolygon(rotated, -minX, -minY, 0);
    const w = maxX - minX;
    const h = maxY - minY;
    // Skip an orientation whose anchored polygon is identical to an earlier one (e.g.
    // 180° of a centrally-symmetric part). Keyed on the rounded vertex loop, NOT the
    // bounding box — a concave part can share its bbox across rotations while its
    // SHAPE (and thus its interlocking behaviour) differs.
    const key = anchored.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(';');
    if (seen.has(key)) continue;
    seen.add(key);
    orientations.push({ rotationDeg: rot, poly: anchored, w, h });
  }
  return ok({ index, area, orientations });
}

/**
 * Bottom-left-fill raster step. The scan grid steps by a fraction of the smallest
 * part extent, so a part can slide INTO a neighbour's concave notch (a fit a sparse
 * bbox-corner candidate set would miss). Clamped to keep the per-sheet scan bounded.
 */
function rasterStep(parts: NfpPart[], usableW: number, usableH: number): number {
  let minExtent = Infinity;
  for (const part of parts) {
    for (const o of part.orientations) {
      minExtent = Math.min(minExtent, o.w, o.h);
    }
  }
  if (!Number.isFinite(minExtent) || minExtent <= EPS) return Math.max(usableW, usableH) / 100;
  // ~1/8 of the smallest extent gives tight interlocks at a bounded scan count; never
  // finer than 1/400 of the larger sheet dimension (caps the worst-case grid size).
  const floor = Math.max(usableW, usableH) / 400;
  return Math.max(minExtent / 8, floor);
}

/**
 * Find the lowest-then-leftmost feasible placement of `part` on the current sheet
 * across all its orientations, by a discretised bottom-left raster scan. Returns the
 * translated polygon (for later overlap tests) and the {@link Placement}, or
 * undefined if nothing fits. The scan is over a finite grid so it always terminates.
 */
function placeOnSheet(
  part: NfpPart,
  placed: PlacedPoly[],
  spacing: number,
  margin: number,
  usableW: number,
  usableH: number,
  step: number
): { poly: Polygon; placement: Placement } | undefined {
  let best: { poly: Polygon; placement: Placement; key: [number, number] } | undefined;
  for (const o of part.orientations) {
    if (o.w > usableW + EPS || o.h > usableH + EPS) continue;
    const fit = scanOrientation(part.index, o, placed, spacing, margin, usableW, usableH, step);
    if (fit === undefined) continue;
    // Lower y wins; ties broken by lower x — the bottom-left-fill objective.
    if (
      best === undefined ||
      fit.key[1] < best.key[1] - EPS ||
      (Math.abs(fit.key[1] - best.key[1]) <= EPS && fit.key[0] < best.key[0] - EPS)
    ) {
      best = fit;
    }
  }
  if (best === undefined) return undefined;
  return { poly: best.poly, placement: best.placement };
}

/** Lowest-then-leftmost feasible raster position of one orientation, or undefined. */
function scanOrientation(
  index: number,
  o: NfpOrientation,
  placed: PlacedPoly[],
  spacing: number,
  margin: number,
  usableW: number,
  usableH: number,
  step: number
): { poly: Polygon; placement: Placement; key: [number, number] } | undefined {
  const maxX = margin + usableW - o.w;
  const maxY = margin + usableH - o.h;
  // Scan bottom-to-top, left-to-right; the first feasible cell is the bottom-left fit.
  for (let y = margin; y <= maxY + EPS; y += step) {
    for (let x = margin; x <= maxX + EPS; x += step) {
      const candidate = transformPolygon(o.poly, x, y, 0);
      if (overlapsAny(candidate, placed, spacing)) continue;
      return { poly: candidate, placement: { patternIndex: index, x, y, rotationDeg: o.rotationDeg }, key: [x, y] };
    }
  }
  return undefined;
}

function overlapsAny(candidate: Polygon, placed: PlacedPoly[], spacing: number): boolean {
  // Broad-phase bbox reject first (cheap), then the exact polygon overlap test.
  const [cMinX, cMinY, cMaxX, cMaxY] = polygonBounds(candidate);
  for (const pp of placed) {
    const [pMinX, pMinY, pMaxX, pMaxY] = pp.bounds;
    if (cMinX > pMaxX + spacing + EPS || pMinX > cMaxX + spacing + EPS) continue;
    if (cMinY > pMaxY + spacing + EPS || pMinY > cMaxY + spacing + EPS) continue;
    if (polygonsOverlapWithClearance(candidate, pp.poly, spacing)) return true;
  }
  return false;
}

/** Does a part fit the usable sheet in the given orientation? */
function fitsUsable(box: Bbox, usableW: number, usableH: number, rotated: boolean): boolean {
  const w = rotated ? box.height : box.width;
  const h = rotated ? box.width : box.height;
  return w <= usableW + EPS && h <= usableH + EPS;
}

interface ShelfState {
  placements: Placement[];
  /** Bottom y (sheet coords) of the current open shelf. */
  shelfY: number;
  /** Height of the current open shelf (the tallest part placed in it). */
  shelfH: number;
  /** Next free x (sheet coords) on the current shelf. */
  cursorX: number;
  placedArea: number;
}

function packShelves(
  placeable: number[],
  boxes: Bbox[],
  usableW: number,
  usableH: number,
  margin: number,
  spacing: number,
  allowRotation: boolean,
  usableArea: number
): { sheets: NestSheet[]; dropped: number[] } {
  const sheets: NestSheet[] = [];
  const dropped: number[] = [];
  let state = newSheet(margin);

  const commit = (): void => {
    sheets.push({ placements: state.placements, utilization: state.placedArea / usableArea });
  };

  for (const idx of placeable) {
    const box = boxes[idx];
    if (box === undefined) continue;

    if (!tryPlace(state, box, idx, usableW, usableH, margin, spacing, allowRotation)) {
      // Current sheet is full for this part — close it and open a fresh one. Every
      // part in `placeable` fits an empty usable sheet, so this second attempt should
      // always succeed; record it as dropped (caller routes to `unplaced`) as a
      // self-enforcing safety net rather than relying on that reasoning alone.
      commit();
      state = newSheet(margin);
      if (!tryPlace(state, box, idx, usableW, usableH, margin, spacing, allowRotation)) {
        dropped.push(idx);
      }
    }
  }

  if (state.placements.length > 0) commit();
  return { sheets, dropped };
}

function newSheet(margin: number): ShelfState {
  return { placements: [], shelfY: margin, shelfH: 0, cursorX: margin, placedArea: 0 };
}

/**
 * Try to place `box` on the current sheet, mutating `state` on success. Tries the
 * current shelf first (with rotation if allowed), then opens a new shelf below.
 * Returns false when the part fits neither the current nor a new shelf on this
 * sheet (the caller then opens a new sheet).
 */
function tryPlace(
  state: ShelfState,
  box: Bbox,
  idx: number,
  usableW: number,
  usableH: number,
  margin: number,
  spacing: number,
  allowRotation: boolean
): boolean {
  const right = margin + usableW;
  const top = margin + usableH;

  // Candidate orientations: 0° always, 90° when allowed (and the box is not square).
  const orientations: { rot: 0 | 90; w: number; h: number }[] = [{ rot: 0, w: box.width, h: box.height }];
  if (allowRotation && Math.abs(box.width - box.height) > EPS) {
    orientations.push({ rot: 90, w: box.height, h: box.width });
  }

  const firstOnShelf = state.cursorX <= margin + EPS;

  // 1) Fit on the current open shelf. Prefer the orientation that keeps the shelf
  //    shortest (least new vertical waste) among those that fit horizontally and
  //    within the shelf's established height once started.
  let best: { rot: 0 | 90; w: number; h: number } | undefined;
  for (const o of orientations) {
    const xStart = firstOnShelf ? state.cursorX : state.cursorX + spacing;
    if (xStart + o.w > right + EPS) continue;
    // A started shelf has a fixed bottom; the part must fit under the usable top
    // from the shelf bottom (it may grow shelfH up to the top).
    if (state.shelfY + o.h > top + EPS) continue;
    if (best === undefined || o.h < best.h - EPS) best = o;
  }
  if (best !== undefined) {
    const xStart = firstOnShelf ? state.cursorX : state.cursorX + spacing;
    state.placements.push({ patternIndex: idx, x: xStart, y: state.shelfY, rotationDeg: best.rot });
    state.cursorX = xStart + best.w;
    state.shelfH = Math.max(state.shelfH, best.h);
    state.placedArea += best.w * best.h;
    return true;
  }

  // 2) Open a new shelf below the current one (if anything is on the current shelf).
  if (state.placements.length === 0) return false;
  const nextShelfY = state.shelfY + state.shelfH + spacing;
  let bestNew: { rot: 0 | 90; w: number; h: number } | undefined;
  for (const o of orientations) {
    if (margin + o.w > right + EPS) continue;
    if (nextShelfY + o.h > top + EPS) continue;
    if (bestNew === undefined || o.h < bestNew.h - EPS) bestNew = o;
  }
  if (bestNew === undefined) return false;
  state.shelfY = nextShelfY;
  state.shelfH = bestNew.h;
  state.cursorX = margin + bestNew.w;
  state.placements.push({ patternIndex: idx, x: margin, y: nextShelfY, rotationDeg: bestNew.rot });
  state.placedArea += bestNew.w * bestNew.h;
  return true;
}

/**
 * Axis-aligned bounding box of a pattern's OUTER outline wire, read from the wire
 * vertices (each edge start point) — the same 2D-coordinate read the DXF/SVG writers
 * use. Only the outer outline is packed; holes ride inside it.
 */
export function patternBbox(pattern: FlatPattern): Result<Bbox> {
  const edges = getEdges(pattern.outline);
  if (edges.length === 0) {
    return err(validationError('EMPTY_OUTLINE', 'pattern outline has no edges to bound'));
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const edge of edges) {
    const p = curveStartPoint(edge);
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const width = maxX - minX;
  const height = maxY - minY;
  if (!Number.isFinite(minX) || width <= EPS || height <= EPS) {
    return err(validationError('EMPTY_OUTLINE', 'pattern outline bounding box is degenerate'));
  }
  return ok({ minX, minY, width, height });
}

/**
 * Sheet-placement transform for one placement: shift the pattern's developed-plane
 * bbox lower-left to the origin, rotate `rotationDeg` (CCW) about it, then translate
 * the rotated shape so its rotated bounding box's lower-left lands at `(x, y)` on the
 * sheet. A point at developed `(px, py)` therefore lands inside the box the packer
 * reserved. The 0° and 90° branches are kept as closed-form integer-stable maps so
 * the bbox-strategy DXF output is byte-identical to the pre-NFP writer; finer angles
 * (180/270 and any nfp-emitted value) take the general rotation path.
 */
function placementTransform(box: Bbox, x: number, y: number, rotationDeg: number): Transform2 {
  if (rotationDeg === 0) {
    return ([px, py]) => [x + (px - box.minX), y + (py - box.minY)];
  }
  if (rotationDeg === 90) {
    // After shifting to origin: (lx, ly) in [0,w]×[0,h]. Rotate 90° CCW: (-ly, lx)
    // → [-h,0]×[0,w]; add h to bring x back to [0,h], then translate to (x, y).
    return ([px, py]) => {
      const lx = px - box.minX;
      const ly = py - box.minY;
      return [x + (box.height - ly), y + lx];
    };
  }
  // General CCW rotation about the bbox lower-left, then re-anchor the rotated bbox's
  // lower-left to (x, y) so the placement matches the box the packer reserved.
  const rad = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const corners: [number, number][] = [
    [0, 0],
    [box.width, 0],
    [box.width, box.height],
    [0, box.height],
  ];
  let minRx = Infinity;
  let minRy = Infinity;
  for (const [cx, cy] of corners) {
    const rx = cx * c - cy * s;
    const ry = cx * s + cy * c;
    if (rx < minRx) minRx = rx;
    if (ry < minRy) minRy = ry;
  }
  return ([px, py]) => {
    const lx = px - box.minX;
    const ly = py - box.minY;
    const rx = lx * c - ly * s;
    const ry = lx * s + ly * c;
    return [x + (rx - minRx), y + (ry - minRy)];
  };
}

/**
 * Emit one fabrication-ready DXF for a single nested sheet: every pattern placed on
 * `result.sheets[sheetIndex]` is translated and rotated onto the sheet (via the same
 * bounding boxes the packer used) and written through {@link multiPatternToDXF}.
 * `patterns` must be the SAME array passed to {@link nest} (placements index into it).
 */
export function nestToDXF(
  result: NestResult,
  patterns: FlatPattern[],
  sheetIndex: number,
  options?: DxfOptions
): Result<string> {
  const sheet = result.sheets[sheetIndex];
  if (sheet === undefined) {
    return err(validationError('INVALID_SHEET_INDEX', `no nested sheet at index ${sheetIndex} (have ${result.sheets.length})`));
  }
  const placed: PlacedPattern[] = [];
  for (const p of sheet.placements) {
    const pattern = patterns[p.patternIndex];
    if (pattern === undefined) {
      return err(validationError('INVALID_PATTERN_INDEX', `placement references missing pattern ${p.patternIndex}`));
    }
    const box = patternBbox(pattern);
    if (!box.ok) return box;
    placed.push({ pattern, transform: placementTransform(box.value, p.x, p.y, p.rotationDeg) });
  }
  return multiPatternToDXF(placed, options ?? {});
}
