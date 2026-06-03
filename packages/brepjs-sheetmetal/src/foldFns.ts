import {
  type Result,
  type Vec3,
  ok,
  err,
  validationError,
  getEdges,
  curveStartPoint,
  curveEndPoint,
} from 'brepjs';
import type {
  BendRule,
  CutoutSpec,
  FlatInput,
  FlatPattern,
  FlatSide,
  FoldRegion,
  MaterialSpec,
  SheetMetalPart,
  SheetMetalWarning,
} from './types.js';
import { authorPart, type AuthorSpec, type FlangeSpec } from './authorFns.js';
import { addBendRelief } from './reliefFns.js';
import { addCutout } from './cutoutFns.js';
import { featureTree, ROOT_FLAT_ID } from './featureTreeFns.js';
import { developedLength } from './allowanceFns.js';
import { unfold, edgeBasis2, type Frame2 } from './unfoldFns.js';
import { validatePart } from './validateFns.js';

/** A folded part plus the warnings raised while folding (e.g. SEAM_CUT, MIN_RADIUS). */
export interface FoldResult {
  part: SheetMetalPart;
  warnings: SheetMetalWarning[];
}

/**
 * Fold a flat pattern up into a 3D part. Each {@link FoldRegion} folds about its
 * fold line off its parent region, exactly inverting {@link unfold}: folding by an
 * angle is the same rigid construction the forward authoring path performs, so this
 * reuses {@link authorPart}'s bend geometry wholesale rather than re-deriving it.
 *
 * The result carries a fully-populated {@link SheetMetalPart} (valid solid + the
 * BendFeature/FlangeFeature tree consistent with `authorPart`), so
 * `unfold(fold(input))` round-trips. SEAM_CUT-style and min-radius warnings ride
 * inside the Ok payload.
 */
export function fold(input: FlatInput): Result<SheetMetalPart> {
  const result = foldWithWarnings(input);
  if (!result.ok) return result;
  return ok(result.value.part);
}

/** {@link fold} that also surfaces the fold warnings alongside the part. */
export function foldWithWarnings(input: FlatInput): Result<FoldResult> {
  const spec: AuthorSpec = {
    thickness: input.thickness,
    base: { length: input.baseLength, width: input.width },
    flanges: input.regions.map(regionToFlange),
    ...(input.material !== undefined ? { material: input.material } : {}),
  };

  const authored = authorPart(spec);
  if (!authored.ok) return authored;
  let part = authored.value;

  // Re-apply any bend reliefs recorded on the regions, so fold reproduces a
  // relief'd part's solid + recorded feature (reliefs are cut after the solid is
  // built, exactly as the explicit `addBendRelief` API does).
  for (const region of input.regions) {
    if (region.bendRelief === undefined) continue;
    const relieved = addBendRelief(part, region.id, region.bendRelief);
    if (!relieved.ok) return relieved;
    part = relieved.value;
  }

  // Re-apply recorded cutouts (in region-local coords) so a cutout'd part folds
  // back into the same solid + recorded feature, exactly as `addCutout` produces.
  for (const spec of input.baseCutouts ?? []) {
    const cutResult = addCutout(part, { ...spec, region: ROOT_FLAT_ID });
    if (!cutResult.ok) return cutResult;
    part = cutResult.value;
  }
  for (const region of input.regions) {
    for (const spec of region.cutouts ?? []) {
      const cutResult = addCutout(part, { ...spec, region: region.id });
      if (!cutResult.ok) return cutResult;
      part = cutResult.value;
    }
  }

  // SEAM_CUT comes from the feature-tree walk; INVALID_SOLID / COLLISION / MIN_RADIUS
  // come from the canonical validator, so fold inherits the same checks (and message
  // text) as the rest of the package instead of re-deriving min-radius here.
  const warnings: SheetMetalWarning[] = [];
  const tree = featureTree(part);
  if (tree.ok) warnings.push(...tree.value.warnings);
  warnings.push(...validatePart(part));

  return ok({ part, warnings });
}

function regionToFlange(region: FoldRegion): FlangeSpec {
  return {
    id: region.id,
    length: region.length,
    angleDeg: region.angleDeg,
    rule: region.rule,
    direction: region.direction,
    ...(region.side !== undefined ? { side: region.side } : {}),
    ...(region.parent !== undefined ? { parent: region.parent } : {}),
    ...(region.offset !== undefined ? { offset: region.offset } : {}),
    ...(region.width !== undefined ? { width: region.width } : {}),
    ...(region.miter !== undefined ? { miter: region.miter } : {}),
  };
}

/** How to resolve the bend rule for a bend line read out of a 2D flat pattern. */
export interface PatternToFlatInputOptions {
  thickness: number;
  /**
   * Rule for bend line `i` (0-based, in {@link FlatPattern.bendLines} order). A flat
   * pattern is pure geometry and cannot encode K-factor/inner-radius, so the rule is
   * a required *input*; only the regions/sides/offsets/spans/lengths/angles are
   * recovered from the 2D geometry.
   */
  ruleFor: (bendIndex: number) => BendRule;
  material?: MaterialSpec | undefined;
}

/**
 * Reconstruct a {@link FlatInput} region-tree from the *2D flat-pattern geometry*
 * alone — `pattern.outline` (a closed 2D wire) and `pattern.bendLines` (each a 2D
 * segment + fold angle/direction). Nothing is read from a feature tree or a 3D
 * solid: the regions, sides, offsets, spans and flat lengths are all recovered by
 * reading real 2D coordinates back out of the wire/edges via the public brepjs
 * geometry readers (`getEdges`, `curveStartPoint`, `curveEndPoint`).
 *
 * This is the non-circular round-trip bridge: feeding `unfold(part).pattern` through
 * here and into {@link fold} exercises unfold's 2D placement, this parser, and the
 * forward fold geometry — a bug in any of them breaks the round-trip.
 *
 * Algorithm (rectilinear families — PR1 develops only axis-aligned rectangles):
 * every bend line is an axis-aligned segment lying on the shared edge between a
 * parent region and a child's developed strip. The developed strip width is
 * `developedLength(angle, thickness, ruleFor(i))` (the supplied rule). BFS outward
 * from the base region (the one anchored at the origin): a bend line on a known
 * region's edge spawns a child region whose far edge is the next outward bend line
 * (a grandchild) or the outline boundary; `length = far-extent − dev`, `span` =
 * bend-line length, `offset`/`side` are the bend line's position on the parent edge.
 */
export function patternToFlatInput(
  pattern: FlatPattern,
  opts: PatternToFlatInputOptions
): Result<FlatInput> {
  const { thickness, ruleFor, material } = opts;
  if (!Number.isFinite(thickness) || thickness <= 0) {
    return err(validationError('INVALID_THICKNESS', `thickness must be positive, got ${thickness}`));
  }

  const segsResult = parseBendLines(pattern, thickness, ruleFor);
  if (!segsResult.ok) return segsResult;
  const bends = segsResult.value;

  const outline = parseOutlineExtents(pattern);
  if (!outline.ok) return outline;
  const { xs, ys, contains } = outline.value;

  const base = baseRect(xs, ys, contains, bends);
  if (!base.ok) return base;
  const baseRectVal = base.value;

  const buildResult = buildRegions(baseRectVal, bends, contains);
  if (!buildResult.ok) return buildResult;

  return ok({
    thickness,
    baseLength: baseRectVal.x1 - baseRectVal.x0,
    width: baseRectVal.y1 - baseRectVal.y0,
    ...(material !== undefined ? { material } : {}),
    regions: buildResult.value,
  });
}

/**
 * Convert an authored {@link SheetMetalPart} into the {@link FlatInput} that folds
 * back into it, going strictly through the 2D flat pattern: `unfold(part)` produces
 * the developed wire + bend lines, and {@link patternToFlatInput} recovers the
 * region tree from that 2D geometry. Only the bend *rule* is read off the part (by
 * matching bend id), which a flat pattern legitimately cannot encode; every
 * geometric attribute is parsed from the wire/edges. This makes the round-trip
 * oracle non-circular — a bug in unfold's 2D placement or in the parser breaks it.
 *
 * Seam bends (closed profiles) are left unfolded by `unfold`, so the recovered part
 * is the open spanning-tree shape, not the re-closed box.
 */
export function partToFlatInput(part: SheetMetalPart): Result<FlatInput> {
  const unfolded = unfold(part);
  if (!unfolded.ok) return unfolded;
  const pattern = unfolded.value.pattern;

  // The rule is allowed as an input (a flat pattern cannot encode K-factor). Match
  // each bend line back to its authored bend by id, in unfold's bend-line order
  // (which is the spanning-tree order featureTree/layoutTree emit), falling back to
  // a default rule if a bend can't be matched.
  const ruleByIndex = bendRulesInOrder(part);
  const fallback: BendRule = part.material?.defaultRule ?? { innerRadius: part.thickness, kFactor: 0.44 };

  const recovered = patternToFlatInput(pattern, {
    thickness: part.thickness,
    ruleFor: (i) => ruleByIndex[i] ?? fallback,
    ...(part.material !== undefined ? { material: part.material } : {}),
  });
  if (!recovered.ok) return recovered;

  return attachCutouts(part, recovered.value);
}

/**
 * Re-attach a part's recorded cutouts onto a recovered {@link FlatInput}. Cutouts
 * ride as interior loops, so {@link patternToFlatInput} (which reads only the outer
 * outline) cannot recover them; we carry the region-local specs across instead.
 * The recovered region for the i-th feature-tree bend is `b${i}` (the parser's id
 * scheme), and the unfold emits bend lines in that same BFS order, so a flange's
 * recovered region id is its position in `featureTree(part).bends`. A cutout whose
 * region can't be mapped is failed loudly rather than dropped: silently shedding it
 * would change the refolded volume with no diagnostic, a correctness violation.
 */
function attachCutouts(part: SheetMetalPart, input: FlatInput): Result<FlatInput> {
  if (part.cutouts === undefined || part.cutouts.length === 0) return ok(input);

  const recoveredIdByFlange = new Map<string, string>();
  const tree = featureTree(part);
  if (tree.ok) {
    tree.value.bends.forEach((tb, i) => recoveredIdByFlange.set(tb.child, `b${i}`));
  }

  const baseCutouts: CutoutSpec[] = [];
  const byRegion = new Map<string, CutoutSpec[]>();
  for (const c of part.cutouts) {
    if (c.region === ROOT_FLAT_ID) {
      baseCutouts.push(c.spec);
      continue;
    }
    const recoveredId = recoveredIdByFlange.get(c.region);
    if (recoveredId === undefined) {
      return err(
        validationError(
          'CUTOUT_REGION_UNMAPPED',
          `partToFlatInput: cutout on region '${c.region}' has no recovered flat region; round-trip would drop it`
        )
      );
    }
    const list = byRegion.get(recoveredId) ?? [];
    list.push(c.spec);
    byRegion.set(recoveredId, list);
  }

  const regions = input.regions.map((r) => {
    const specs = byRegion.get(r.id);
    return specs === undefined ? r : { ...r, cutouts: specs };
  });

  return ok({
    ...input,
    regions,
    ...(baseCutouts.length > 0 ? { baseCutouts } : {}),
  });
}

/**
 * Bend rules in {@link FlatPattern.bendLines} order. `unfold` emits bend lines in
 * the layout walk's order, which is the feature tree's BFS (spanning-tree) order;
 * the same walk drives the rules here so index `i` lines up with bend line `i`.
 */
function bendRulesInOrder(part: SheetMetalPart): BendRule[] {
  const tree = featureTree(part);
  if (!tree.ok) return part.flanges.map((f) => f.rule);
  const ruleById = new Map<string, BendRule>();
  for (const f of part.flanges) ruleById.set(f.id, f.rule);
  for (const b of part.bends) if (!ruleById.has(b.id)) ruleById.set(b.id, b.rule);
  const rules: BendRule[] = [];
  for (const tb of tree.value.bends) {
    rules.push(ruleById.get(tb.child) ?? tb.bend.rule);
  }
  return rules;
}

const EPS = 1e-6;

type Pt2 = [number, number];

/** A bend line parsed from the 2D pattern: an axis-aligned segment + fold metadata. */
interface BendSeg {
  index: number;
  /** Orientation of the segment line. */
  axis: 'h' | 'v';
  /** Fixed coordinate of the line (x for vertical, y for horizontal). */
  fixed: number;
  /** Segment span on the free axis: `[lo, hi]`. */
  lo: number;
  hi: number;
  span: number;
  angleDeg: number;
  direction: 'up' | 'down';
  /** The supplied rule (a flat pattern cannot encode K-factor, so it's an input). */
  rule: BendRule;
  /** Developed strip width for this bend (from the supplied rule). */
  dev: number;
}

function parseBendLines(
  pattern: FlatPattern,
  thickness: number,
  ruleFor: (i: number) => BendRule
): Result<BendSeg[]> {
  const out: BendSeg[] = [];
  for (let i = 0; i < pattern.bendLines.length; i += 1) {
    const bl = pattern.bendLines[i];
    if (bl === undefined) continue;
    const a = curveStartPoint(bl.line);
    const b = curveEndPoint(bl.line);
    const seg = axisAlignedSeg(a, b);
    if (seg === undefined) {
      return err(
        validationError('NON_AXIS_BEND', `bend line ${i} is not axis-aligned: (${a[0]},${a[1]})→(${b[0]},${b[1]})`)
      );
    }
    const rule = ruleFor(i);
    const devResult = developedLength(bl.angleDeg, thickness, rule);
    if (!devResult.ok) return devResult;
    out.push({
      index: i,
      axis: seg.axis,
      fixed: seg.fixed,
      lo: seg.lo,
      hi: seg.hi,
      span: seg.hi - seg.lo,
      angleDeg: bl.angleDeg,
      direction: bl.direction,
      rule,
      dev: devResult.value,
    });
  }
  return ok(out);
}

function axisAlignedSeg(a: Vec3, b: Vec3): { axis: 'h' | 'v'; fixed: number; lo: number; hi: number } | undefined {
  if (Math.abs(a[0] - b[0]) < EPS) {
    return { axis: 'v', fixed: (a[0] + b[0]) / 2, lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]) };
  }
  if (Math.abs(a[1] - b[1]) < EPS) {
    return { axis: 'h', fixed: (a[1] + b[1]) / 2, lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]) };
  }
  return undefined;
}

interface OutlineExtents {
  /** Sorted unique x-coordinates of every outline vertex. */
  xs: number[];
  /** Sorted unique y-coordinates of every outline vertex. */
  ys: number[];
  /** True if the point lies strictly inside the filled (developed) region. */
  contains: (x: number, y: number) => boolean;
}

/**
 * Read the outline wire's vertices back out via `getEdges` + curve endpoint readers
 * and build a point-in-region test over the axis-aligned arrangement they induce.
 * The developed pattern is a simply-connected rectilinear polygon, so a winding-free
 * cell test (is this cell's centre inside the polygon) suffices.
 */
function parseOutlineExtents(pattern: FlatPattern): Result<OutlineExtents> {
  const edges = getEdges(pattern.outline);
  if (edges.length < 3) {
    return err(validationError('OUTLINE_TOO_SMALL', `outline has ${edges.length} edges, need ≥ 3`));
  }
  const segs: { a: Pt2; b: Pt2 }[] = [];
  const xsRaw: number[] = [];
  const ysRaw: number[] = [];
  for (const e of edges) {
    const s = curveStartPoint(e);
    const t = curveEndPoint(e);
    segs.push({ a: [s[0], s[1]], b: [t[0], t[1]] });
    xsRaw.push(s[0], t[0]);
    ysRaw.push(s[1], t[1]);
  }
  const poly = orderedLoop(segs);
  if (poly === undefined) {
    return err(validationError('OUTLINE_NOT_CLOSED', 'outline edges do not form a single closed loop'));
  }
  const xs = uniqueSorted(xsRaw);
  const ys = uniqueSorted(ysRaw);
  const contains = (x: number, y: number): boolean => pointInPolygon(poly, x, y);
  return ok({ xs, ys, contains });
}

/** Chain segments into one ordered vertex loop, or undefined if they don't close. */
function orderedLoop(segs: { a: Pt2; b: Pt2 }[]): Pt2[] | undefined {
  if (segs.length === 0) return undefined;
  const key = (p: Pt2): string => `${round(p[0])}|${round(p[1])}`;
  const from = new Map<string, Pt2>();
  // Two segments sharing a start-vertex key means the loop isn't a simple chain
  // (floating-point drift can also collapse two near vertices into one bucket);
  // bail rather than silently overwrite and trace a wrong polygon.
  for (const s of segs) {
    const k = key(s.a);
    if (from.has(k)) return undefined;
    from.set(k, s.b);
  }
  const start = segs[0]?.a;
  if (start === undefined) return undefined;
  const loop: Pt2[] = [start];
  let cur = from.get(key(start));
  let guard = 0;
  while (cur !== undefined && key(cur) !== key(start) && guard < segs.length + 2) {
    loop.push(cur);
    cur = from.get(key(cur));
    guard += 1;
  }
  if (cur === undefined || key(cur) !== key(start)) return undefined;
  return loop;
}

function round(n: number): number {
  return Math.round(n / EPS) * EPS;
}

/** Standard ray-cast point-in-polygon for the (axis-aligned) outline loop. */
function pointInPolygon(poly: Pt2[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const pi = poly[i];
    const pj = poly[j];
    if (pi === undefined || pj === undefined) continue;
    const intersect =
      pi[1] > y !== pj[1] > y &&
      x < ((pj[0] - pi[0]) * (y - pi[1])) / (pj[1] - pi[1]) + pi[0];
    if (intersect) inside = !inside;
  }
  return inside;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Base region: the rectangle anchored at the origin, `[0, baseLength] × [0, width]`
 * (the unfold layout fixes the base frame there). Each base edge is bounded by the
 * bend line lying on it (a tray folds off all four edges) or, when no flange folds
 * off that edge, by the outline boundary. The extents are therefore the nearest
 * base-bounding bend line — a bend line perpendicular to the run that crosses the
 * origin row/column — clamped to the outline reach.
 */
function baseRect(
  xs: number[],
  ys: number[],
  contains: (x: number, y: number) => boolean,
  bends: BendSeg[]
): Result<Rect> {
  if (xs.length < 2 || ys.length < 2) {
    return err(validationError('BASE_NOT_FOUND', 'cannot locate base region at origin'));
  }
  // Probe halfway between the origin and the first positive x grid line — a
  // scale-invariant point inside the base's undivided +X span (the base is one
  // rectangle in X, so the first gridline > 0 is its right edge). Avoids assuming
  // any absolute unit and stays correct when xmin/ymin flanges add negative coords.
  const xFirstPositive = xs.find((v) => v > EPS);
  if (xFirstPositive === undefined) {
    return err(validationError('BASE_NOT_FOUND', 'no positive x extent to locate the base region'));
  }
  const xProbeBase = xFirstPositive / 2;
  const yProbe = firstFilledCellMid(ys.filter((v) => v > -EPS), (mid) => contains(xProbeBase, mid));
  if (yProbe === undefined) {
    return err(validationError('BASE_NOT_FOUND', 'origin cell is not inside the developed region'));
  }
  const x0 = 0;
  const y0 = 0;
  // +X base edge: nearest vertical bend line right of origin crossing the base row,
  // else the outline reach.
  const xBendBound = nearestBend(bends, 'v', yProbe, x0, 1);
  const x1 = xBendBound ?? marchOutline(x0, 1, (c) => contains(c, yProbe));
  const xProbe = (x0 + x1) / 2;
  const yBendBound = nearestBend(bends, 'h', xProbe, y0, 1);
  const y1 = yBendBound ?? marchOutline(y0, 1, (c) => contains(xProbe, c));
  if (x1 <= x0 + EPS || y1 <= y0 + EPS) {
    return err(validationError('BASE_NOT_FOUND', 'base region has zero extent'));
  }
  return ok({ x0, y0, x1, y1 });
}

/**
 * Nearest bend line of the given orientation, on the `dir` side of `from` along its
 * perpendicular axis, whose span covers the base `cross` coordinate — i.e. a bend
 * line lying on the base's far edge in that direction. Returns its fixed coordinate.
 */
function nearestBend(
  bends: BendSeg[],
  axis: 'h' | 'v',
  cross: number,
  from: number,
  dir: 1 | -1
): number | undefined {
  let best: number | undefined;
  for (const b of bends) {
    if (b.axis !== axis) continue;
    if (cross < b.lo - EPS || cross > b.hi + EPS) continue;
    const beyond = dir > 0 ? b.fixed > from + EPS : b.fixed < from - EPS;
    if (!beyond) continue;
    if (best === undefined || Math.abs(b.fixed - from) < Math.abs(best - from)) best = b.fixed;
  }
  return best;
}

/** First arrangement cell whose midpoint passes `probe`; locates an interior coord. */
function firstFilledCellMid(coords: number[], probe: (mid: number) => boolean): number | undefined {
  for (let j = 0; j + 1 < coords.length; j += 1) {
    const lo = coords[j];
    const hi = coords[j + 1];
    if (lo === undefined || hi === undefined) continue;
    const mid = (lo + hi) / 2;
    if (probe(mid)) return mid;
  }
  return undefined;
}

/** March from `c0` in `dir` until the probe leaves the region; bisect to the boundary. */
function marchOutline(c0: number, dir: 1 | -1, probe: (c: number) => boolean): number {
  let inside = c0 + dir * EPS * 4;
  let step = 1;
  let guard = 0;
  while (probe(inside + dir * step) && guard < 100000) {
    inside += dir * step;
    step *= 2;
    guard += 1;
  }
  let lo = inside;
  let hi = inside + dir * step;
  for (let i = 0; i < 60; i += 1) {
    const m = (lo + hi) / 2;
    if (probe(m)) lo = m;
    else hi = m;
  }
  return lo;
}

/**
 * BFS outward from the base, attributing each bend line to the region whose local
 * edge it lies on (the parent) and spawning the child region beyond it. Each region
 * carries its 2D frame; a bend line collinear with one of the parent's four local
 * edges, within that edge's span, folds a child whose far edge is the nearest
 * outward grandchild bend line or the outline boundary. `side`/`offset` are reported
 * in the parent's local frame so the re-fold reproduces the authored attachment.
 */
function buildRegions(
  base: Rect,
  bends: BendSeg[],
  contains: (x: number, y: number) => boolean
): Result<FoldRegion[]> {
  const regions: FoldRegion[] = [];
  const used = new Set<number>();
  const baseFrame: Frame2 = {
    origin: [base.x0, base.y0],
    u: [1, 0],
    v: [0, 1],
    uLen: base.x1 - base.x0,
    vLen: base.y1 - base.y0,
  };
  const queue: { frame: Frame2; id: string | undefined }[] = [{ frame: baseFrame, id: undefined }];
  const idForBend = (b: BendSeg): string => `b${b.index}`;

  let guard = 0;
  while (queue.length > 0 && guard < bends.length + 4) {
    guard += 1;
    const node = queue.shift();
    if (node === undefined) break;
    for (const b of bends) {
      if (used.has(b.index)) continue;
      const attached = bendOnFrameEdge(b, node.frame);
      if (attached === undefined) continue;
      used.add(b.index);

      const far = farExtent(b, attached.outSign, bends, contains);
      const length = far - b.dev;
      if (length <= EPS) {
        return err(
          validationError('BAD_FLANGE_LENGTH', `recovered flange length for bend ${b.index} is non-positive (${length})`)
        );
      }

      const id = idForBend(b);
      const region: FoldRegion = {
        id,
        length,
        angleDeg: b.angleDeg,
        direction: b.direction,
        rule: b.rule,
        side: attached.side,
        offset: attached.offset,
        width: b.span,
        ...(node.id !== undefined ? { parent: node.id } : {}),
      };
      regions.push(region);
      queue.push({ frame: childFrame(attached, b, length), id });
    }
  }

  if (used.size !== bends.length) {
    return err(
      validationError('UNATTACHED_BEND', `${bends.length - used.size} bend line(s) could not be attached to a region`)
    );
  }

  return ok(regions);
}

interface BendAttachment {
  side: FlatSide;
  offset: number;
  /** Edge basis of the parent's local edge `side` (mirrors unfold `edgeBasis2`). */
  along: Pt2;
  out: Pt2;
  edgeOrigin: Pt2;
  /** Sign of `out` on the bend's perpendicular axis, so `farExtent` marches outward. */
  outSign: 1 | -1;
}

/**
 * If bend `b` lies on one of `frame`'s four local edges (within that edge's span),
 * return the parent-local `side`, the `offset` along that edge, and the edge basis.
 * The bend line is collinear with the edge `edgeOrigin + along·t`, `t ∈ [0, edgeLen]`;
 * the offset is the projection of the bend's near endpoint onto `along`.
 */
function bendOnFrameEdge(b: BendSeg, frame: Frame2): BendAttachment | undefined {
  const segMid = bendMidpoint(b);
  const segDir: Pt2 = b.axis === 'v' ? [0, 1] : [1, 0];
  for (const side of ['xmax', 'xmin', 'ymax', 'ymin'] as const) {
    const basis = edgeBasis2(frame, side);
    // Edge must be parallel to the bend (along ∥ segDir) and the bend must sit on it.
    if (Math.abs(cross2(basis.along, segDir)) > EPS) continue;
    const rel: Pt2 = [segMid[0] - basis.edgeOrigin[0], segMid[1] - basis.edgeOrigin[1]];
    const perp = Math.abs(dot2(rel, basis.out));
    if (perp > EPS) continue;
    const t = dot2(rel, basis.along);
    const edgeLen = edgeLengthOf(frame, side);
    const half = b.span / 2;
    if (t < half - EPS || t > edgeLen - half + EPS) continue;
    const offset = t - half;
    // Outward sign on the bend's perpendicular axis (X for a vertical bend line,
    // Y for a horizontal one), so `farExtent` marches the right way.
    const outComp = b.axis === 'v' ? basis.out[0] : basis.out[1];
    const outSign: 1 | -1 = outComp >= 0 ? 1 : -1;
    return { side, offset: Math.max(0, offset), along: basis.along, out: basis.out, edgeOrigin: basis.edgeOrigin, outSign };
  }
  return undefined;
}

/**
 * Child region frame, mirroring unfold's `placeChild`: origin past the developed
 * strip (`edgeOrigin + along·offset + out·dev`), u along the bend axis (span), v
 * outward (length). This keeps recovered frames identical to the layout's so a
 * grandchild attaches to the right local edge.
 */
function childFrame(attached: BendAttachment, b: BendSeg, length: number): Frame2 {
  const stripFar: Pt2 = [
    attached.edgeOrigin[0] + attached.along[0] * attached.offset + attached.out[0] * b.dev,
    attached.edgeOrigin[1] + attached.along[1] * attached.offset + attached.out[1] * b.dev,
  ];
  return { origin: stripFar, u: attached.along, v: attached.out, uLen: b.span, vLen: length };
}

function edgeLengthOf(f: Frame2, side: FlatSide): number {
  return side === 'xmax' || side === 'xmin' ? f.vLen : f.uLen;
}

function bendMidpoint(b: BendSeg): Pt2 {
  const mid = (b.lo + b.hi) / 2;
  return b.axis === 'v' ? [b.fixed, mid] : [mid, b.fixed];
}

function cross2(a: Pt2, b: Pt2): number {
  return a[0] * b[1] - a[1] * b[0];
}
function dot2(a: Pt2, b: Pt2): number {
  return a[0] * b[0] + a[1] * b[1];
}

/**
 * Far perpendicular extent (strip + flat) of a child region from its bend line: the
 * nearest grandchild bend line beyond `b` (parallel, overlapping the span, same
 * outward side) or, failing that, the outline boundary, measured as a distance from
 * the bend line outward. Because bend lines are axis-aligned, the outward direction
 * is along the bend's perpendicular axis with `outSign` (from the edge basis).
 */
function farExtent(
  b: BendSeg,
  outSign: 1 | -1,
  bends: BendSeg[],
  contains: (x: number, y: number) => boolean
): number {
  let nearest: number | undefined;
  for (const g of bends) {
    if (g.index === b.index) continue;
    if (g.axis !== b.axis) continue;
    const overlaps = g.lo < b.hi - EPS && b.lo < g.hi - EPS;
    if (!overlaps) continue;
    const beyond = outSign > 0 ? g.fixed > b.fixed + EPS : g.fixed < b.fixed - EPS;
    if (!beyond) continue;
    if (nearest === undefined || Math.abs(g.fixed - b.fixed) < Math.abs(nearest - b.fixed)) {
      nearest = g.fixed;
    }
  }
  const boundary = nearest ?? outlineFar(b, outSign, contains);
  return Math.abs(boundary - b.fixed);
}

/**
 * March perpendicular outward from the bend line until the region stops being filled
 * (the outline boundary), probing at the span midpoint, then bisect to the boundary.
 */
function outlineFar(
  b: BendSeg,
  outSign: 1 | -1,
  contains: (x: number, y: number) => boolean
): number {
  const mid = (b.lo + b.hi) / 2;
  const probe = (perp: number): boolean =>
    b.axis === 'v' ? contains(perp, mid) : contains(mid, perp);
  return marchOutline(b.fixed, outSign, probe);
}

function uniqueSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last === undefined || Math.abs(v - last) > EPS) out.push(v);
  }
  return out;
}
