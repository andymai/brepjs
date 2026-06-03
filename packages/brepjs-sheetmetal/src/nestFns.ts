import { type Result, ok, err, validationError, getEdges, curveStartPoint } from 'brepjs';
import type { FlatPattern, SheetMetalWarning } from './types.js';
import { multiPatternToDXF, type DxfOptions, type Transform2, type PlacedPattern } from './dxfFns.js';

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
}

/** Where a single pattern lands on a sheet. `rotationDeg` is `0` or `90`. */
export interface Placement {
  /** Index into the `patterns` array passed to {@link nest}. */
  patternIndex: number;
  /** Lower-left x of the part's (rotated) bounding box, in sheet coordinates. */
  x: number;
  /** Lower-left y of the part's (rotated) bounding box, in sheet coordinates. */
  y: number;
  rotationDeg: 0 | 90;
}

export interface NestSheet {
  placements: Placement[];
  /**
   * Σ placed part bounding-box areas ÷ usable-sheet area, in `(0, 1]`. "Usable"
   * = `(width − 2·margin) × (height − 2·margin)`. This is BOUNDING-BOX utilization:
   * the inter-part spacing gaps and intra-bbox waste (a non-rectangular part inside
   * its box) are NOT credited, so it is a conservative measure of true material use.
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
 * Sheet-placement transform for one placement: shift the pattern's bbox lower-left
 * to the origin, rotate by `rotationDeg` (0 or 90° CCW) about it — which swaps the
 * bbox extents — then translate the (rotated) bbox lower-left to `(x, y)` on the
 * sheet. A point at developed `(px, py)` therefore lands inside `[x, x+w]×[y, y+h]`,
 * matching the box the packer reserved.
 */
function placementTransform(box: Bbox, x: number, y: number, rotationDeg: 0 | 90): Transform2 {
  if (rotationDeg === 90) {
    // After shifting to origin: (lx, ly) in [0,w]×[0,h]. Rotate 90° CCW: (-ly, lx)
    // → [-h,0]×[0,w]; add h to bring x back to [0,h], then translate to (x, y).
    return ([px, py]) => {
      const lx = px - box.minX;
      const ly = py - box.minY;
      return [x + (box.height - ly), y + lx];
    };
  }
  return ([px, py]) => [x + (px - box.minX), y + (py - box.minY)];
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
