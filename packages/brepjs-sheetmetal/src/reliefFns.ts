import {
  type Result,
  type Vec3,
  type Solid,
  ok,
  err,
  validationError,
  box,
  cut,
  rotate,
  translate,
  getBounds,
  getSolids,
  isValid,
  curveStartPoint,
  curveEndPoint,
  vecAdd,
  vecSub,
  vecScale,
  vecCross,
  vecDot,
  vecNormalize,
} from 'brepjs';
import type {
  BendFeature,
  FlangeFeature,
  ReliefFeature,
  ReliefSpec,
  SheetMetalPart,
} from './types.js';
import { normalizeSolid } from './internal.js';
import { unfold } from './unfoldFns.js';
import { developedLength } from './allowanceFns.js';

const EPS = 1e-6;
const Z_AXIS: Vec3 = [0, 0, 1];

type Pt2 = [number, number];
type NotchRect = [number, number, number, number];

/**
 * Add a bend relief to a flange: a small slot cut into the PARENT flat at each end
 * of the bend line that does not reach the parent edge endpoint (a partial/offset
 * flange). Without it the parent material tears at the corner where the bend
 * terminates mid-edge. Each slot is `width` (≈ thickness) along the parent edge by
 * `depth` (≈ developed length + clearance) into the parent flat, cut from the 3D
 * solid and recorded so {@link unfold} replays the 2D notch.
 *
 * A relief is a recorded feature replayed by unfold — exactly the pattern
 * {@link autoMiterCorner} establishes for corner miters.
 */
export function addBendRelief(
  part: SheetMetalPart,
  flangeId: string,
  spec: ReliefSpec = { shape: 'rectangular' }
): Result<SheetMetalPart> {
  if (part.solid === undefined) {
    return err(validationError('NO_SOLID', 'addBendRelief: part has no folded solid to cut'));
  }
  const flange = part.flanges.find((f) => f.id === flangeId);
  const bend = part.bends.find((b) => b.id === flangeId);
  if (flange === undefined || bend === undefined) {
    return err(validationError('UNKNOWN_FLANGE', `addBendRelief: flange '${flangeId}' not found`));
  }

  const dims = reliefDims(spec, part.thickness, devOf(bend, part.thickness));
  if (!dims.ok) return dims;
  const { width, depth } = dims.value;

  const geo = bendReliefGeometry(part, flange, bend, width, depth);
  if (geo === undefined) {
    return err(
      validationError(
        'BEND_RELIEF_NOT_NEEDED',
        `addBendRelief: bend '${flangeId}' spans its full parent edge; no relief end to cut`
      )
    );
  }

  let solid = part.solid;
  for (const tool of geo.tools3d) {
    const result = cut(solid, tool);
    if (!result.ok) return result;
    solid = normalizeSolid(result.value);
  }
  if (!isValid(solid) || getSolids(solid).length > 1) {
    return err(
      validationError(
        'RELIEF_SEVERED_SOLID',
        `addBendRelief: slot (width ${width}, depth ${depth}) severs flange '${flangeId}' into multiple bodies; reduce width/depth`
      )
    );
  }

  const feature: ReliefFeature = {
    kind: 'bend',
    shape: spec.shape,
    flangeA: flangeId,
    width,
    depth,
    notches: geo.notches2d,
  };

  return ok({ ...part, solid, reliefs: [...(part.reliefs ?? []), feature] });
}

/**
 * Add a bend relief to every partial-span bend (a flange that does not span its
 * full parent edge). Full-span flanges are skipped — they have no mid-edge bend
 * terminus to relieve. Convenience over calling {@link addBendRelief} per flange.
 */
export function autoBendReliefs(
  part: SheetMetalPart,
  spec: ReliefSpec = { shape: 'rectangular' }
): Result<SheetMetalPart> {
  let current = part;
  for (const flange of part.flanges) {
    // Let addBendRelief own the needed/not-needed decision rather than recomputing
    // the relief geometry here just to peek (which also allocated throwaway tools).
    const next = addBendRelief(current, flange.id, spec);
    if (!next.ok) {
      if (next.error.code === 'BEND_RELIEF_NOT_NEEDED') continue;
      return next;
    }
    current = next.value;
  }
  return ok(current);
}

/**
 * Corner relief between two adjacent flanges: a notch cut at their shared corner so
 * the two upright flanges clear each other once folded — the alternative to a 45°
 * miter for the same corner {@link autoMiterCorner} handles. The notch is cut from
 * the solid and recorded as a {@link ReliefFeature}; the corner is also recorded in
 * `miters` (gap 0) so the collision check treats the interference as resolved.
 */
export function cornerRelief(
  part: SheetMetalPart,
  flangeIdA: string,
  flangeIdB: string,
  spec: ReliefSpec = { shape: 'rectangular' }
): Result<SheetMetalPart> {
  if (part.solid === undefined) {
    return err(validationError('NO_SOLID', 'cornerRelief: part has no folded solid'));
  }
  const bendA = part.bends.find((b) => b.id === flangeIdA);
  const bendB = part.bends.find((b) => b.id === flangeIdB);
  if (bendA === undefined || bendB === undefined) {
    return err(
      validationError('UNKNOWN_FLANGE', `cornerRelief: flange '${flangeIdA}' or '${flangeIdB}' not found`)
    );
  }
  const axisA = vecNormalize(bendA.axisDir);
  const axisB = vecNormalize(bendB.axisDir);
  if (Math.hypot(...vecCross(axisA, axisB)) < EPS) {
    return err(
      validationError('PARALLEL_FLANGES', 'cornerRelief: flange bend axes are parallel; no corner to relieve')
    );
  }

  const devClearance = Math.max(devOf(bendA, part.thickness), devOf(bendB, part.thickness));
  const dims = reliefDims(spec, part.thickness, devClearance);
  if (!dims.ok) return dims;
  const { depth } = dims.value;

  // The corner notch is a square; its side is the user's `width` when given, else
  // the depth clearance. Both recorded dims are the actual side so a consumer
  // reading width/depth reconstructs the real cut (not a stale clearance value).
  const side = spec.width ?? depth;

  const flangeA = part.flanges.find((f) => f.id === flangeIdA);
  const flangeB = part.flanges.find((f) => f.id === flangeIdB);
  const geo = cornerReliefGeometry(part, axisA, axisB, bendA, bendB, side, flangeA, flangeB);
  const tool = squareTool(part.solid, geo.cornerXY, side);
  const result = cut(part.solid, tool);
  if (!result.ok) return result;

  const solid = normalizeSolid(result.value);
  if (!isValid(solid) || getSolids(solid).length > 1) {
    return err(
      validationError(
        'RELIEF_SEVERED_SOLID',
        `cornerRelief: notch (side ${side}) severs the part into multiple bodies; reduce width/depth`
      )
    );
  }

  const feature: ReliefFeature = {
    kind: 'corner',
    shape: spec.shape,
    flangeA: flangeIdA,
    flangeB: flangeIdB,
    width: side,
    depth: side,
    notches: [geo.notch2d],
  };

  return ok({
    ...part,
    solid,
    reliefs: [...(part.reliefs ?? []), feature],
    miters: [...(part.miters ?? []), { flangeA: flangeIdA, flangeB: flangeIdB, gap: 0 }],
  });
}

/**
 * Developed strip width of a bend, via the canonical {@link developedLength} so the
 * default relief depth tracks the same neutral-axis arc length the unfold uses.
 * Falls back to the inner radius if the rule is degenerate (the depth is only a
 * heuristic clearance, so a positive fallback keeps a valid default tool).
 */
function devOf(bend: BendFeature, thickness: number): number {
  const dev = developedLength(bend.angleDeg, thickness, bend.rule);
  return dev.ok ? dev.value : bend.rule.innerRadius;
}

/** Resolve relief width/depth from the spec, defaulting to thickness / (dev + T). */
function reliefDims(
  spec: ReliefSpec,
  thickness: number,
  dev: number
): Result<{ width: number; depth: number }> {
  const width = spec.width ?? thickness;
  const depth = spec.depth ?? dev + thickness;
  if (!Number.isFinite(width) || width <= 0) {
    return err(validationError('INVALID_RELIEF_WIDTH', `relief width must be positive, got ${width}`));
  }
  if (!Number.isFinite(depth) || depth <= 0) {
    return err(validationError('INVALID_RELIEF_DEPTH', `relief depth must be positive, got ${depth}`));
  }
  return ok({ width, depth });
}

interface BendReliefGeometry {
  tools3d: Solid[];
  notches2d: NotchRect[];
}

/**
 * Build the 3D cut tools and 2D developed-plane notch rectangles for a bend relief.
 * In 3D each slot straddles a bend-line end on the parent edge and cuts inward
 * (toward the parent interior) by `depth`, full thickness. In 2D the slot sits at
 * the corresponding bend-line endpoint and cuts into the parent rectangle the same
 * way. Returns `undefined` when the flange spans its full parent edge (no mid-edge
 * end to relieve).
 */
function bendReliefGeometry(
  part: SheetMetalPart,
  flange: FlangeFeature,
  bend: BendFeature,
  width: number,
  depth: number
): BendReliefGeometry | undefined {
  if (part.solid === undefined) return undefined;

  const axis = vecNormalize(bend.axisDir);
  const span = flange.span;
  const offset = flange.offset ?? flange.baseEdge.offset ?? 0;
  const edgeLen = parentEdgeLength(part, flange);

  const atStart = offset > EPS;
  const atEnd = offset + span < edgeLen - EPS;
  if (!atStart && !atEnd) return undefined;

  const b = getBounds(part.solid);
  const center: Vec3 = [(b.xMin + b.xMax) / 2, (b.yMin + b.yMax) / 2, 0];
  const inward = inwardRun(bend.axisOrigin, axis, center);
  const edgeBase: Vec3 = [bend.axisOrigin[0], bend.axisOrigin[1], 0];

  const tools3d: Solid[] = [];
  const ends: number[] = [];
  if (atStart) ends.push(0);
  if (atEnd) ends.push(span);
  for (const s of ends) {
    const at = vecAdd(edgeBase, vecScale(axis, s));
    tools3d.push(slotTool3d(at, axis, inward, width, depth, part.thickness));
  }

  const notches2d = bendNotches2d(part, flange, width, depth, atStart, atEnd);
  return { tools3d, notches2d };
}

/**
 * Developed-plane notch rectangles for a bend relief, located at the bend-line ends
 * and cutting into the PARENT rectangle (opposite the develop-out direction). The
 * unfold is the source of truth for 2D placement, so we read the developed bend
 * line straight from it and offset inward.
 */
function bendNotches2d(
  part: SheetMetalPart,
  flange: FlangeFeature,
  width: number,
  depth: number,
  atStart: boolean,
  atEnd: boolean
): NotchRect[] {
  const placed = developedBendLine(part, flange);
  if (placed === undefined) return [];
  const { bendA, bendB, inward } = placed;
  const len = Math.max(dist2(bendA, bendB), EPS);
  const along: Pt2 = [(bendB[0] - bendA[0]) / len, (bendB[1] - bendA[1]) / len];
  const half = width / 2;
  const make = (p: Pt2): NotchRect => {
    const c0: Pt2 = [p[0] - along[0] * half, p[1] - along[1] * half];
    const c1: Pt2 = [
      p[0] + along[0] * half + inward[0] * depth,
      p[1] + along[1] * half + inward[1] * depth,
    ];
    return [Math.min(c0[0], c1[0]), Math.min(c0[1], c1[1]), Math.max(c0[0], c1[0]), Math.max(c0[1], c1[1])];
  };
  const notches: NotchRect[] = [];
  if (atStart) notches.push(make(bendA));
  if (atEnd) notches.push(make(bendB));
  return notches;
}

interface DevelopedBendLine {
  bendA: Pt2;
  bendB: Pt2;
  inward: Pt2;
}

/**
 * Locate a flange's bend line in the developed plane by re-running the unfold and
 * matching by flange id — the unfold owns 2D placement, so the notch always
 * coincides with the real developed geometry. Matching by id (not by geometric
 * signature) keeps placement correct when several flanges share the same
 * span/angle/direction, as in {@link autoBendReliefs}.
 */
function developedBendLine(part: SheetMetalPart, flange: FlangeFeature): DevelopedBendLine | undefined {
  const unfolded = unfold({ ...part, reliefs: undefined });
  if (!unfolded.ok) return undefined;
  const bl = unfolded.value.pattern.bendLines.find((b) => b.id === flange.id);
  if (bl === undefined) return undefined;
  const a = toPt2(curveStartPoint(bl.line));
  const b = toPt2(curveEndPoint(bl.line));
  return { bendA: a, bendB: b, inward: bl.inward };
}

interface CornerReliefGeometry {
  cornerXY: Pt2;
  notch2d: NotchRect;
}

/**
 * Corner relief geometry: the shared-corner point of the two flanges' bend lines in
 * world XY, plus a square developed-plane notch CENTRED on the reflex corner of the
 * two flanges (`(baseLength, width)` for the classic +X/+Y L). Centring the square
 * on the corner bites the base and both flange roots equally, so the developed
 * outline stays a single closed loop (a notch landing its far corner exactly on the
 * reflex vertex would pinch the boundary).
 */
function cornerReliefGeometry(
  part: SheetMetalPart,
  axisA: Vec3,
  axisB: Vec3,
  bendA: BendFeature,
  bendB: BendFeature,
  side: number,
  flangeA: FlangeFeature | undefined,
  flangeB: FlangeFeature | undefined
): CornerReliefGeometry {
  const corner = cornerPoint(bendA.axisOrigin, axisA, bendB.axisOrigin, axisB);
  const [cx, cy] = developedCorner(part, flangeA, flangeB);
  const h = side / 2;
  const notch2d: NotchRect = [cx - h, cy - h, cx + h, cy + h];
  return { cornerXY: [corner[0], corner[1]], notch2d };
}

/**
 * Developed-plane base corner shared by two perpendicular base flanges, picked from
 * their sides: an `xmax` flange's corner x is `baseLength`, an `xmin`'s is `0`; a
 * `ymax`'s corner y is `width`, a `ymin`'s is `0`. Defaults to the +X/+Y corner.
 */
function developedCorner(
  part: SheetMetalPart,
  flangeA: FlangeFeature | undefined,
  flangeB: FlangeFeature | undefined
): Pt2 {
  let cx = part.baseLength;
  let cy = part.width;
  for (const f of [flangeA, flangeB]) {
    const side = f?.baseEdge.side;
    if (side === 'xmin') cx = 0;
    else if (side === 'xmax') cx = part.baseLength;
    else if (side === 'ymin') cy = 0;
    else if (side === 'ymax') cy = part.width;
  }
  return [cx, cy];
}

/** Point on bend A's line closest to bend B's line (their shared corner). */
function cornerPoint(originA: Vec3, dirA: Vec3, originB: Vec3, dirB: Vec3): Vec3 {
  const w0 = vecSub(originA, originB);
  const a = vecDot(dirA, dirA);
  const b = vecDot(dirA, dirB);
  const c = vecDot(dirB, dirB);
  const d = vecDot(dirA, w0);
  const e = vecDot(dirB, w0);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-9) return originA;
  const sc = (b * e - c * d) / denom;
  return vecAdd(originA, vecScale(dirA, sc));
}

/** In-plane perpendicular to `axis` pointing toward the part center (into the parent). */
function inwardRun(axisOrigin: Vec3, axis: Vec3, center: Vec3): Vec3 {
  const perp = vecNormalize(vecCross(axis, Z_AXIS));
  const toCenter: Vec3 = [center[0] - axisOrigin[0], center[1] - axisOrigin[1], 0];
  const dot = perp[0] * toCenter[0] + perp[1] * toCenter[1];
  return dot >= 0 ? perp : [-perp[0], -perp[1], -perp[2]];
}

/** Parent-edge length the flange folds off (base edge for root flanges). */
function parentEdgeLength(part: SheetMetalPart, flange: FlangeFeature): number {
  const side = flange.baseEdge.side ?? 'xmax';
  const onWidthEdge = side === 'xmax' || side === 'xmin';
  const parentId = flange.baseEdge.parentId;
  if (parentId === undefined || parentId === 'root' || parentId === 'face-0') {
    return onWidthEdge ? part.width : part.baseLength;
  }
  const parent = part.flanges.find((f) => f.id === parentId);
  if (parent === undefined) return onWidthEdge ? part.width : part.baseLength;
  return onWidthEdge ? parent.length : parent.span;
}

/**
 * A box tool for a bend-relief slot: a `width × depth × (thickness + margins)` block
 * whose `width` axis runs along the parent edge and `depth` axis points inward,
 * placed so it straddles the edge point `at` and cuts through the parent surface.
 */
function slotTool3d(
  at: Vec3,
  along: Vec3,
  inward: Vec3,
  width: number,
  depth: number,
  thickness: number
): Solid {
  const margin = thickness + 2;
  // Canonical: width along +X, depth along +Y, height along +Z (cuts through Z).
  // Rotating by `deg` sends +X→along and +Y→(along rotated +90° = [-along.y, along.x]).
  // If that rotated +Y opposes `inward`, build the block extending in −Y so it cuts
  // into the parent rather than out into the flange.
  const rotPerp: Vec3 = [-along[1], along[0], 0];
  const y0 = vecDot(rotPerp, inward) >= 0 ? 0 : -depth;
  let tool: Solid = box(width, depth, thickness + 2 * margin);
  tool = translate(tool, [-width / 2, y0, -margin]);
  tool = orientXY(tool, along);
  return translate(tool, [at[0], at[1], 0]);
}

/**
 * Square corner-relief tool: a `side × side × (height + margins)` block CENTRED on
 * the corner point in XY and spanning the full part height, so it removes material
 * from the base corner and both flange roots. Corner reliefs sit at axis-aligned
 * base corners for the supported perpendicular flange shapes, so the tool stays
 * axis-aligned.
 */
function squareTool(solid: Solid, cornerXY: Pt2, side: number): Solid {
  const b = getBounds(solid);
  const margin = 2;
  const h = side / 2;
  const tool = box(side, side, b.zMax - b.zMin + 2 * margin);
  return translate(tool, [cornerXY[0] - h, cornerXY[1] - h, b.zMin - margin]);
}

/** Rotate a shape about +Z so its local +X axis points along `xT` (in the XY plane). */
function orientXY(shape: Solid, xT: Vec3): Solid {
  const deg = (Math.atan2(xT[1], xT[0]) * 180) / Math.PI;
  if (Math.abs(deg) < 1e-9) return shape;
  return rotate(shape, deg, { at: [0, 0, 0], axis: Z_AXIS });
}

function toPt2(v: Vec3): Pt2 {
  return [v[0], v[1]];
}

function dist2(a: Pt2, b: Pt2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
