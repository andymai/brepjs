/**
 * 2D curve operations for the occt-wasm adapter.
 *
 * occt-wasm doesn't expose Geom2d via Embind, so these methods sit on top
 * of the pure-TS `geometry2d` module (`ow2d`). Curve handles are opaque
 * `Curve2dObj` instances passed through `c2dWrap` / `c2d` identity casts.
 *
 * @module
 */

import type { KernelShape, KernelType } from '@/kernel/types.js';
import type { Curve2dHandle, BBox2dHandle } from '@/kernel/kernel2dTypes.js';
import * as ow2d from '@/kernel/geometry2d.js';
import type { Bezier2d, BSpline2d, Curve2dObj, Ellipse2d } from '@/kernel/geometry2d.js';
import {
  asBSpline2d,
  bezierSegments2d,
  fitBSpline2d,
  interpolateBSpline2d,
  subBSpline2d,
} from '@/kernel/bspline2dFit.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import { handle, unwrap } from './helpers.js';
import { makeEllipseArc, makeEllipseEdge } from './constructionOps.js';
import { curveParameters, curvePointAtParam } from './curveOps.js';
import { uvFromPoint } from './surfaceOps.js';

// ─── Curve handle wrappers — identity casts at the kernel boundary ──────────

function c2d(h: Curve2dHandle): Curve2dObj {
  return h;
}

function c2dWrap(obj: Curve2dObj): Curve2dHandle {
  return obj;
}

// ─── Constructors for plain-object 2D primitives ────────────────────────────

export function createPoint2d(x: number, y: number): KernelType {
  return { x, y };
}

export function createDirection2d(x: number, y: number): KernelType {
  const l = Math.sqrt(x * x + y * y);
  if (l < 1e-15) {
    throw new Error('occt-wasm: createDirection2d called with zero-length vector');
  }
  return { x: x / l, y: y / l };
}

export function createVector2d(x: number, y: number): KernelType {
  return { x, y };
}

export function createAxis2d(px: number, py: number, dx: number, dy: number): KernelType {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type bridge
  return { px, py, dx, dy, delete() {} } as any;
}

export function wrapCurve2dHandle(h: KernelType): Curve2dHandle {
  return h;
}

// ─── Curve constructors ─────────────────────────────────────────────────────

export function makeLine2d(x1: number, y1: number, x2: number, y2: number): Curve2dHandle {
  return c2dWrap(ow2d.makeLine2d(x1, y1, x2, y2));
}

export function makeCircle2d(
  cx: number,
  cy: number,
  radius: number,
  sense?: boolean
): Curve2dHandle {
  return c2dWrap(ow2d.makeCircle2d(cx, cy, radius, sense));
}

export function makeArc2dThreePoints(
  x1: number,
  y1: number,
  xm: number,
  ym: number,
  x2: number,
  y2: number
): Curve2dHandle {
  // Circumscribed circle through 3 points.
  const d = 2 * (x1 * (ym - y2) + xm * (y2 - y1) + x2 * (y1 - ym));
  if (Math.abs(d) < 1e-12) {
    return c2dWrap(ow2d.makeLine2d(x1, y1, x2, y2));
  }
  const cx =
    ((x1 * x1 + y1 * y1) * (ym - y2) +
      (xm * xm + ym * ym) * (y2 - y1) +
      (x2 * x2 + y2 * y2) * (y1 - ym)) /
    d;
  const cy =
    ((x1 * x1 + y1 * y1) * (x2 - xm) +
      (xm * xm + ym * ym) * (x1 - x2) +
      (x2 * x2 + y2 * y2) * (xm - x1)) /
    d;
  const radius = Math.sqrt((x1 - cx) ** 2 + (y1 - cy) ** 2);

  const a1 = Math.atan2(y1 - cy, x1 - cx);
  const am = Math.atan2(ym - cy, xm - cx);
  const a2 = Math.atan2(y2 - cy, x2 - cx);

  let da1m = am - a1;
  if (da1m < 0) da1m += 2 * Math.PI;
  let da12 = a2 - a1;
  if (da12 < 0) da12 += 2 * Math.PI;
  const sense = da1m < da12;

  const circle = ow2d.makeCircle2d(cx, cy, radius, sense);
  if (!sense) {
    const tStart = -a1;
    let tEnd = -a2;
    if (tEnd < tStart - 1e-9) tEnd += 2 * Math.PI;
    return c2dWrap({ __bk2d: 'trimmed', basis: circle, tStart, tEnd });
  }
  let tEnd = a2;
  if (tEnd < a1 - 1e-9) tEnd += 2 * Math.PI;
  return c2dWrap({ __bk2d: 'trimmed', basis: circle, tStart: a1, tEnd });
}

export function makeArc2dTangent(
  startX: number,
  startY: number,
  tangentX: number,
  tangentY: number,
  endX: number,
  endY: number
): Curve2dHandle {
  const len = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
  const ntx = len > 0 ? tangentX / len : 0;
  const nty = len > 0 ? tangentY / len : 0;

  const dx = startX - endX;
  const dy = startY - endY;
  const denom = 2 * (dy * ntx - dx * nty);

  if (Math.abs(denom) < 1e-12) {
    return c2dWrap(ow2d.makeLine2d(startX, startY, endX, endY));
  }

  const chord2 = dx * dx + dy * dy;
  const t = -chord2 / denom;
  const cx = startX - t * nty;
  const cy = startY + t * ntx;
  const radius = Math.abs(t);

  const a1 = Math.atan2(startY - cy, startX - cx);
  const a2 = Math.atan2(endY - cy, endX - cx);

  const ccwTanX = -(startY - cy) / radius;
  const ccwTanY = (startX - cx) / radius;
  const sense = ccwTanX * ntx + ccwTanY * nty > 0;

  const circle = ow2d.makeCircle2d(cx, cy, radius, sense);
  if (!sense) {
    const tStart = -a1;
    let tEnd = -a2;
    if (tEnd < tStart - 1e-9) tEnd += 2 * Math.PI;
    return c2dWrap({ __bk2d: 'trimmed', basis: circle, tStart, tEnd });
  }
  let tEnd = a2;
  if (tEnd < a1 - 1e-9) tEnd += 2 * Math.PI;
  return c2dWrap({ __bk2d: 'trimmed', basis: circle, tStart: a1, tEnd });
}

export function makeEllipse2d(
  cx: number,
  cy: number,
  majorRadius: number,
  minorRadius: number,
  xDirX?: number,
  xDirY?: number,
  sense?: boolean
): Curve2dHandle {
  return c2dWrap(
    ow2d.makeEllipse2d(cx, cy, majorRadius, minorRadius, xDirX ?? 1, xDirY ?? 0, sense ?? true)
  );
}

export function makeEllipseArc2d(
  cx: number,
  cy: number,
  majorRadius: number,
  minorRadius: number,
  startAngle: number,
  endAngle: number,
  xDirX?: number,
  xDirY?: number,
  sense?: boolean
): Curve2dHandle {
  const full = ow2d.makeEllipse2d(
    cx,
    cy,
    majorRadius,
    minorRadius,
    xDirX ?? 1,
    xDirY ?? 0,
    sense ?? true
  );
  // Evaluation negates the parameter for sense=false, so the trim range
  // flips sign with it (same mapping as the circle-arc makers above).
  if (!(sense ?? true)) {
    const tStart = -startAngle;
    let tEnd = -endAngle;
    if (tEnd < tStart - 1e-9) tEnd += 2 * Math.PI;
    return c2dWrap({ __bk2d: 'trimmed', basis: full, tStart, tEnd });
  }
  let tEnd = endAngle;
  if (tEnd < startAngle - 1e-9) tEnd += 2 * Math.PI;
  return c2dWrap({ __bk2d: 'trimmed', basis: full, tStart: startAngle, tEnd });
}

export function makeBezier2d(points: [number, number][]): Curve2dHandle {
  return c2dWrap(ow2d.makeBezier2d(points));
}

export function makeBSpline2d(
  points: [number, number][],
  options?: {
    degMin?: number;
    degMax?: number;
    continuity?: 'C0' | 'C1' | 'C2' | 'C3';
    tolerance?: number;
    smoothing?: [number, number, number] | null;
  }
): Curve2dHandle {
  // Interpolates every point (chord-length parameters), which meets any
  // Geom2dAPI_PointsToBSpline tolerance. Repeated points would make the
  // collocation system singular, so consecutive duplicates are dropped.
  const pts: [number, number][] = [];
  for (const p of points) {
    const prev = pts[pts.length - 1];
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 1e-12) pts.push([p[0], p[1]]);
  }
  if (pts.length < 2) throw new Error('occt-wasm: makeBSpline2d needs at least 2 distinct points');
  return c2dWrap(interpolateBSpline2d(pts, options?.degMax ?? 3));
}

// ─── Curve evaluation / metadata ────────────────────────────────────────────

export function evaluateCurve2d(curve: Curve2dHandle, param: number): [number, number] {
  return ow2d.evaluateCurve2d(c2d(curve), param);
}

export function evaluateCurve2dD1(
  curve: Curve2dHandle,
  param: number
): { point: [number, number]; tangent: [number, number] } {
  return {
    point: ow2d.evaluateCurve2d(c2d(curve), param),
    tangent: ow2d.tangentCurve2d(c2d(curve), param),
  };
}

export function getCurve2dBounds(curve: Curve2dHandle): { first: number; last: number } {
  return ow2d.curveBounds(c2d(curve));
}

export function getCurve2dType(curve: Curve2dHandle): string {
  let cu = c2d(curve);
  while (cu.__bk2d === 'trimmed') {
    cu = cu.basis;
  }
  return ow2d.curveTypeName(cu);
}

// ─── Curve transforms ───────────────────────────────────────────────────────

export function trimCurve2d(curve: Curve2dHandle, start: number, end: number): Curve2dHandle {
  // The basis is a copy (as Geom2d_TrimmedCurve copies it): the handle object is the
  // curve itself, so sharing it would let an in-place reverse move this trim.
  return c2dWrap({
    __bk2d: 'trimmed' as const,
    basis: structuredClone(c2d(curve)),
    tStart: start,
    tEnd: end,
  });
}

export function reverseCurve2d(curve: Curve2dHandle): void {
  // Reverse is in place (Geom2d_Curve::Reverse), so the handle object takes the
  // reversed fields. Trimmed curves get a fresh basis, never a mutated shared one.
  const c = c2d(curve);
  Object.assign(c, ow2d.reverseCurve2d(c));
}

export function copyCurve2d(curve: Curve2dHandle): Curve2dHandle {
  return c2dWrap(JSON.parse(JSON.stringify(c2d(curve))));
}

export function offsetCurve2d(curve: Curve2dHandle, offset: number): Curve2dHandle {
  return c2dWrap(ow2d.offsetCurve2d(c2d(curve), offset));
}

export function translateCurve2d(curve: Curve2dHandle, dx: number, dy: number): Curve2dHandle {
  return c2dWrap(ow2d.translateCurve2d(c2d(curve), dx, dy));
}

export function rotateCurve2d(
  curve: Curve2dHandle,
  angle: number,
  cx: number,
  cy: number
): Curve2dHandle {
  return c2dWrap(ow2d.rotateCurve2d(c2d(curve), angle, cx, cy));
}

export function scaleCurve2d(
  curve: Curve2dHandle,
  factor: number,
  cx: number,
  cy: number
): Curve2dHandle {
  // geometry2d.scaleCurve2d already scales line endpoints and recomputes length;
  // do not re-patch len here (it would double-apply).
  return c2dWrap(ow2d.scaleCurve2d(c2d(curve), factor, cx, cy));
}

export function mirrorCurve2dAtPoint(curve: Curve2dHandle, cx: number, cy: number): Curve2dHandle {
  return c2dWrap(ow2d.mirrorAtPoint(c2d(curve), cx, cy));
}

export function mirrorCurve2dAcrossAxis(
  curve: Curve2dHandle,
  originX: number,
  originY: number,
  dirX: number,
  dirY: number
): Curve2dHandle {
  return c2dWrap(ow2d.mirrorAcrossAxis(c2d(curve), originX, originY, dirX, dirY));
}

/**
 * Directional affinity matching OCCT `gp_GTrsf2d::SetAffinity`: scales the
 * component perpendicular to the axis `(dx, dy)` through `(ox, oy)` by `ratio`,
 * leaving the parallel component fixed.
 */
export function affinityCurve2d(
  curve: Curve2dHandle,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  ratio: number
): Curve2dHandle {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-15) return curve;
  const px = -dy / len,
    py = dx / len; // perpendicular to axis
  const k = ratio - 1;
  const a = 1 + k * px * px,
    b = k * px * py,
    d = k * py * px,
    e = 1 + k * py * py;
  const tx = ox - a * ox - b * oy;
  const ty = oy - d * ox - e * oy;
  return c2dWrap(ow2d.affineCurve2d(c2d(curve), { a, b, c: d, d: e, tx, ty }));
}

export function affinityTransform2d(
  curve: Curve2dHandle,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  ratio: number
): Curve2dHandle {
  return affinityCurve2d(curve, ox, oy, dx, dy, ratio);
}

// ─── 2D general transforms (GTrsf) ──────────────────────────────────────────

export function createIdentityGTrsf2d(): KernelType {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type
  return { type: 'identity2d', delete() {} } as any;
}

export function createAffinityGTrsf2d(
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  ratio: number
): KernelType {
  return {
    type: 'affinity2d',
    axOriginX: originX,
    axOriginY: originY,
    axDirX: dirX,
    axDirY: dirY,
    ratio,
    delete() {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type
  } as any;
}

export function createTranslationGTrsf2d(dx: number, dy: number): KernelType {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type
  return { type: 'translate2d', dx, dy, delete() {} } as any;
}

export function createMirrorGTrsf2d(
  cx: number,
  cy: number,
  mode: 'point' | 'axis',
  originX?: number,
  originY?: number,
  dirX?: number,
  dirY?: number
): KernelType {
  return {
    type: 'mirror2d',
    cx,
    cy,
    mode,
    originX,
    originY,
    dirX,
    dirY,
    delete() {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type
  } as any;
}

export function createRotationGTrsf2d(angle: number, cx: number, cy: number): KernelType {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type
  return { type: 'rotate2d', angle, cx, cy, delete() {} } as any;
}

export function createScaleGTrsf2d(factor: number, cx: number, cy: number): KernelType {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type
  return { type: 'scale2d', sx: factor, sy: factor, cx, cy, delete() {} } as any;
}

export function setGTrsf2dTranslationPart(gtrsf: KernelType, dx: number, dy: number): void {
  const t = gtrsf;
  t['dx'] = (Number(t['dx']) || 0) + dx;
  t['dy'] = (Number(t['dy']) || 0) + dy;
}

export function multiplyGTrsf2d(base: KernelType, other: KernelType): void {
  const b = base;
  const o = other;
  b['dx'] = (Number(b['dx']) || 0) + (Number(o['dx']) || 0);
  b['dy'] = (Number(b['dy']) || 0) + (Number(o['dy']) || 0);
  if (o['type'] === 'scale2d') {
    b['type'] = 'scale2d';
    b['sx'] = o['sx'];
    b['sy'] = o['sy'];
  }
}

export function transformCurve2dGeneral(curve: Curve2dHandle, gtrsf: KernelType): Curve2dHandle {
  const t = gtrsf;
  if (t['type'] === 'translate2d') {
    return translateCurve2d(curve, Number(t['dx']) || 0, Number(t['dy']) || 0);
  }
  if (t['type'] === 'rotate2d') {
    return rotateCurve2d(
      curve,
      Number(t['angle']) || 0,
      Number(t['cx']) || 0,
      Number(t['cy']) || 0
    );
  }
  if (t['type'] === 'scale2d') {
    return scaleCurve2d(curve, Number(t['sx']) || 1, Number(t['cx']) || 0, Number(t['cy']) || 0);
  }
  if (t['type'] === 'mirror2d') {
    if (t['mode'] === 'axis') {
      return mirrorCurve2dAcrossAxis(
        curve,
        Number(t['originX']) || 0,
        Number(t['originY']) || 0,
        Number(t['dirX']) || 0,
        Number(t['dirY']) || 0
      );
    }
    return mirrorCurve2dAtPoint(curve, Number(t['cx']) || 0, Number(t['cy']) || 0);
  }
  if (t['type'] === 'affinity2d') {
    return affinityCurve2d(
      curve,
      Number(t['axOriginX']) || 0,
      Number(t['axOriginY']) || 0,
      Number(t['axDirX']) || 0,
      Number(t['axDirY']) || 0,
      Number(t['ratio']) || 1
    );
  }
  if (Number(t['dx']) || Number(t['dy'])) {
    return translateCurve2d(curve, Number(t['dx']) || 0, Number(t['dy']) || 0);
  }
  return curve;
}

// ─── Intersection / projection / split ──────────────────────────────────────

export function intersectCurves2d(
  c1: Curve2dHandle,
  c2: Curve2dHandle,
  tolerance: number
): { points: [number, number][]; segments: Curve2dHandle[] } {
  const result = ow2d.intersectCurves2dFn(c2d(c1), c2d(c2), tolerance);
  return { points: result.points, segments: result.segments.map((s) => c2dWrap(s)) };
}

// brepjs-patterns-disable: max-function-lines
export function projectPointOnCurve2d(
  curve: Curve2dHandle,
  x: number,
  y: number
): { param: number; distance: number } | null {
  const c = c2d(curve);
  const bounds = ow2d.curveBounds(c);

  const projectOnBasis = (
    basis: Curve2dObj,
    bFirst: number,
    bLast: number
  ): { param: number; distance: number } | null => {
    if (basis.__bk2d === 'line') {
      const rawT = (x - basis.ox) * basis.dx + (y - basis.oy) * basis.dy;
      const t = Math.max(bFirst, Math.min(bLast, rawT));
      const [px, py] = ow2d.evaluateCurve2d(basis, t);
      return { param: t, distance: Math.sqrt((px - x) ** 2 + (py - y) ** 2) };
    }
    // For circles and general curves: dense sampling, then refine onto the curve.
    const N = 200;
    let bestT = bFirst;
    let bestDist = Infinity;
    for (let i = 0; i <= N; i++) {
      const t = bFirst + ((bLast - bFirst) * i) / N;
      const [px, py] = ow2d.evaluateCurve2d(basis, t);
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestT = t;
      }
    }
    const t = ow2d.refineFootPoint(basis, x, y, bestT, bFirst, bLast);
    const [px, py] = ow2d.evaluateCurve2d(basis, t);
    return { param: t, distance: Math.sqrt((px - x) ** 2 + (py - y) ** 2) };
  };

  if (c.__bk2d === 'trimmed') {
    const tStart = c.tStart;
    const tEnd = c.tEnd;
    const basisResult = projectOnBasis(c.basis, tStart, tEnd);
    if (!basisResult) return null;
    const range = tEnd - tStart;
    const trimmedT = range > 1e-15 ? (basisResult.param - tStart) / range : 0;
    return { param: Math.max(0, Math.min(1, trimmedT)), distance: basisResult.distance };
  }

  return projectOnBasis(c, bounds.first, bounds.last);
}

export function distanceBetweenCurves2d(
  c1: Curve2dHandle,
  c2: Curve2dHandle,
  p1Start: number,
  p1End: number,
  p2Start: number,
  p2End: number
): number {
  return ow2d.distanceBetweenCurves2d(c2d(c1), c2d(c2), p1Start, p1End, p2Start, p2End);
}

/**
 * The exact B-spline of a Bezier or B-spline basis over its trim range, traversed
 * from `from` to `to`; null for an empty range.
 */
function trimmedPoleCurve(basis: Bezier2d | BSpline2d, from: number, to: number): BSpline2d | null {
  if (from === to) return null;
  const sub = subBSpline2d(asBSpline2d(basis), Math.min(from, to), Math.max(from, to));
  if (from < to) return sub;
  const reversed = ow2d.reverseCurve2d(sub);
  return reversed.__bk2d === 'bspline' ? reversed : null;
}

/**
 * Degree <= 3 B-spline within `tolerance` of the curve (Geom2dConvert_ApproxCurve
 * with MaxDegree 3, as brepjs calls it); exact where the curve already is one.
 */
export function approximateCurve2dAsBSpline(
  curve: Curve2dHandle,
  tolerance: number,
  maxSegments: number
): Curve2dHandle {
  const cu = ow2d.flattenTrimmed(c2d(curve));
  const basis = cu.__bk2d === 'trimmed' ? cu.basis : cu;
  const poleCurve = basis.__bk2d === 'bspline' || basis.__bk2d === 'bezier' ? basis : null;
  if (poleCurve && asBSpline2d(poleCurve).degree <= 3) {
    if (cu.__bk2d !== 'trimmed') return copyCurve2d(asBSpline2d(poleCurve));
    const exact = trimmedPoleCurve(poleCurve, cu.tStart, cu.tEnd);
    if (exact) return c2dWrap(exact);
  }
  if (cu.__bk2d === 'line') {
    return c2dWrap(
      asBSpline2d(
        ow2d.makeBezier2d([ow2d.evaluateCurve2d(cu, 0), ow2d.evaluateCurve2d(cu, cu.len)])
      )
    );
  }
  const bounds = ow2d.curveBounds(cu);
  return c2dWrap(
    fitBSpline2d((t) => ow2d.evaluateCurve2d(cu, t), bounds.first, bounds.last, tolerance, {
      maxSegments: Math.max(8, maxSegments),
      breaks: ow2d.curveKnotParams(cu),
    })
  );
}

export function decomposeBSpline2dToBeziers(curve: Curve2dHandle): Curve2dHandle[] {
  const cu = ow2d.flattenTrimmed(c2d(curve));
  const basis = cu.__bk2d === 'trimmed' ? cu.basis : cu;
  if (basis.__bk2d !== 'bspline') return [curve];
  const piece = cu.__bk2d === 'trimmed' ? trimmedPoleCurve(basis, cu.tStart, cu.tEnd) : basis;
  if (!piece) return [curve];
  return bezierSegments2d(piece).map((poles) => c2dWrap(ow2d.makeBezier2d(poles)));
}

// ─── 2D bounding boxes ──────────────────────────────────────────────────────

export function createBoundingBox2d(): BBox2dHandle {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type bridge
  return ow2d.createBBox2d() as any;
}

export function addCurveToBBox2d(
  bbox: BBox2dHandle,
  curve: Curve2dHandle,
  tolerance: number
): void {
  ow2d.addCurveToBBox(bbox, c2d(curve), tolerance);
}

export function getBBox2dBounds(bbox: BBox2dHandle): {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
} {
  return { xMin: bbox.xMin, yMin: bbox.yMin, xMax: bbox.xMax, yMax: bbox.yMax };
}

export function mergeBBox2d(target: BBox2dHandle, other: BBox2dHandle): void {
  (target as { xMin: number }).xMin = Math.min(target.xMin, other.xMin);
  (target as { yMin: number }).yMin = Math.min(target.yMin, other.yMin);
  (target as { xMax: number }).xMax = Math.max(target.xMax, other.xMax);
  (target as { yMax: number }).yMax = Math.max(target.yMax, other.yMax);
}

export function isBBox2dOut(a: BBox2dHandle, b: BBox2dHandle): boolean {
  return a.xMax < b.xMin || a.xMin > b.xMax || a.yMax < b.yMin || a.yMin > b.yMax;
}

export function isBBox2dOutPoint(bbox: BBox2dHandle, x: number, y: number): boolean {
  return x < bbox.xMin || x > bbox.xMax || y < bbox.yMin || y > bbox.yMax;
}

// ─── Curve introspection ───────────────────────────────────────────────────

export function getCurve2dCircleData(
  curve: Curve2dHandle
): { cx: number; cy: number; radius: number; isDirect: boolean } | null {
  let c = c2d(curve);
  while (c.__bk2d === 'trimmed') c = c.basis;
  if (c.__bk2d === 'circle') return { cx: c.cx, cy: c.cy, radius: c.radius, isDirect: c.sense };
  return null;
}

export function getCurve2dEllipseData(
  curve: Curve2dHandle
): { majorRadius: number; minorRadius: number; xAxisAngle: number; isDirect: boolean } | null {
  let c = c2d(curve);
  while (c.__bk2d === 'trimmed') c = c.basis;
  if (c.__bk2d === 'ellipse')
    return {
      majorRadius: c.majorRadius,
      minorRadius: c.minorRadius,
      xAxisAngle: c.xDirAngle,
      isDirect: c.sense,
    };
  return null;
}

export function getCurve2dBezierPoles(curve: Curve2dHandle): [number, number][] | null {
  let c = c2d(curve);
  while (c.__bk2d === 'trimmed') c = c.basis;
  if (c.__bk2d === 'bezier') return c.poles;
  return null;
}

export function getCurve2dBezierDegree(curve: Curve2dHandle): number | null {
  let c = c2d(curve);
  while (c.__bk2d === 'trimmed') c = c.basis;
  if (c.__bk2d === 'bezier') {
    return c.poles.length - 1;
  }
  return null;
}

export function serializeCurve2d(curve: Curve2dHandle): string {
  return ow2d.serializeCurve2d(c2d(curve));
}

export function deserializeCurve2d(data: string): Curve2dHandle {
  return c2dWrap(ow2d.deserializeCurve2d(data));
}

export function splitCurve2d(curve: Curve2dHandle, params: number[]): Curve2dHandle[] {
  const bounds = ow2d.curveBounds(c2d(curve));
  const sorted = [bounds.first, ...params.sort((a, b) => a - b), bounds.last];
  const result: Curve2dHandle[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i] ?? bounds.first;
    const end = sorted[i + 1] ?? bounds.last;
    result.push(trimCurve2d(curve, start, end));
  }
  return result;
}

// ─── Lifting 2D curves to 3D edges ──────────────────────────────────────────

type Vec3 = [number, number, number];

interface PlaneFrame {
  readonly point: (u: number, v: number) => Vec3;
  readonly dir: (u: number, v: number) => Vec3;
  readonly normal: Vec3;
}

function planeFrame(origin: Vec3, z: Vec3, x: Vec3): PlaneFrame {
  const [ox, oy, oz] = origin;
  const [zx, zy, zz] = z;
  const [xx, xy, xz] = x;
  const yx = zy * xz - zz * xy,
    yy = zz * xx - zx * xz,
    yz = zx * xy - zy * xx;
  return {
    point: (u, v) => [ox + u * xx + v * yx, oy + u * xy + v * yy, oz + u * xz + v * yz],
    dir: (u, v) => [u * xx + v * yx, u * xy + v * yy, u * xz + v * yz],
    normal: z,
  };
}

/** Lift an ellipse (or an arc of it over `range`) as an exact OCCT ellipse edge. */
function liftEllipse(
  k: OcctKernelWasm,
  frame: PlaneFrame,
  basis: Ellipse2d,
  range: [number, number] | null
): KernelShape {
  // OCCT arcs run counter-clockwise about their normal from start to end, so a
  // decreasing range becomes the opposite-sense ellipse over the negated range.
  let e = basis;
  let r = range;
  if (r && r[1] < r[0]) {
    e = { ...e, sense: !e.sense };
    r = [-r[0], -r[1]];
  }
  let major = e.majorRadius;
  let minor = e.minorRadius;
  let angle = e.xDirAngle;
  let shift = 0;
  if (major < minor) {
    // gp_Elips needs major >= minor: swap the axes and turn the frame a quarter.
    [major, minor] = [minor, major];
    angle += Math.PI / 2;
    shift = e.sense ? -Math.PI / 2 : Math.PI / 2;
  }
  const n = frame.normal;
  const normal: Vec3 = e.sense ? n : [-n[0], -n[1], -n[2]];
  const center = frame.point(e.cx, e.cy);
  const xDir = frame.dir(Math.cos(angle), Math.sin(angle));
  if (!r || r[1] - r[0] >= 2 * Math.PI - 1e-12) {
    return makeEllipseEdge(k, center, normal, major, minor, xDir);
  }
  return makeEllipseArc(k, center, normal, major, minor, r[0] + shift, r[1] + shift, xDir);
}

function splitBezier(
  poles: [number, number][],
  t: number
): [[number, number][], [number, number][]] {
  const work = poles.map(([x, y]) => [x, y] as [number, number]);
  const n = work.length;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  /* eslint-disable @typescript-eslint/no-non-null-assertion -- indices bounded by the pole count */
  left.push([...work[0]!]);
  right.push([...work[n - 1]!]);
  for (let r = 1; r < n; r++) {
    for (let i = 0; i < n - r; i++) {
      const a = work[i]!;
      const b = work[i + 1]!;
      work[i] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left.push([...work[0]!]);
    right.push([...work[n - 1 - r]!]);
  }
  /* eslint-enable @typescript-eslint/no-non-null-assertion */
  return [left, right.reverse()];
}

/** Poles of the Bezier restricted to [from, to] (either order), traversed from -> to. */
function bezierSegmentPoles(
  poles: [number, number][],
  from: number,
  to: number
): [number, number][] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  let seg = poles;
  if (hi < 1) seg = splitBezier(seg, hi)[0];
  if (lo > 0) seg = splitBezier(seg, hi > 0 ? lo / hi : 0)[1];
  return from <= to ? seg : [...seg].reverse();
}

function liftBezier(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  frame: PlaneFrame,
  poles: [number, number][]
): KernelShape {
  const vec = new Module.VectorDouble();
  try {
    for (const [u, v] of poles) for (const x of frame.point(u, v)) vec.push_back(x);
    return handle('edge', k.makeBezierEdge(vec));
  } finally {
    vec.delete();
  }
}

/** Lift a non-periodic B-spline exactly (an affine lift maps poles to poles). */
function liftBSpline(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  frame: PlaneFrame,
  c: BSpline2d
): KernelShape | null {
  if (!k.makeBSplineEdge || c.isPeriodic) return null;
  const poles = new Module.VectorDouble();
  const weights = new Module.VectorDouble();
  const knots = new Module.VectorDouble();
  const mults = new Module.VectorInt();
  try {
    for (const [u, v] of c.poles) for (const x of frame.point(u, v)) poles.push_back(x);
    for (const knot of c.knots) knots.push_back(knot);
    for (const m of c.multiplicities) mults.push_back(m);
    return handle('edge', k.makeBSplineEdge(poles, weights, knots, mults, c.degree, false));
  } finally {
    poles.delete();
    weights.delete();
    knots.delete();
    mults.delete();
  }
}

function liftFitted(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  frame: PlaneFrame,
  cu: Curve2dObj
): KernelShape {
  const bounds = ow2d.curveBounds(cu);
  const bbox = ow2d.createBBox2d();
  ow2d.addCurveToBBox(bbox, cu, 0);
  const extent = Math.hypot(bbox.xMax - bbox.xMin, bbox.yMax - bbox.yMin);
  const knots = ow2d.curveKnotParams(cu);
  const fit = fitBSpline2d(
    (t) => ow2d.evaluateCurve2d(cu, t),
    bounds.first,
    bounds.last,
    1e-9 * Math.max(1, extent),
    { breaks: knots }
  );
  const exact = liftBSpline(k, Module, frame, fit);
  if (exact) return exact;
  const nSamples = Math.max(24, fit.poles.length);
  const span = bounds.last - bounds.first;
  const params: number[] = [];
  for (let i = 0; i <= nSamples; i++) params.push(bounds.first + (span * i) / nSamples);
  // A knot on (or within rounding of) a sample would repeat a point, which
  // makes GeomAPI_Interpolate's system singular.
  for (const t of knots) {
    const nearest =
      bounds.first + (span * Math.round(((t - bounds.first) / span) * nSamples)) / nSamples;
    if (Math.abs(t - nearest) > 1e-9 * span) params.push(t);
  }
  params.sort((a, b) => a - b);
  const distinct = params.filter((t, i) => i === 0 || t - (params[i - 1] ?? t) > 1e-9 * span);
  const vec = new Module.VectorDouble();
  try {
    for (const t of distinct) {
      const [u, v] = ow2d.evaluateCurve2d(cu, t);
      for (const x of frame.point(u, v)) vec.push_back(x);
    }
    return handle('edge', k.interpolatePoints(vec, false));
  } finally {
    vec.delete();
  }
}

export function liftCurve2dToPlane(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  curve: Curve2dHandle,
  planeOrigin: [number, number, number],
  planeZ: [number, number, number],
  planeX: [number, number, number]
): KernelShape {
  const cu = ow2d.flattenTrimmed(c2d(curve));
  const frame = planeFrame(planeOrigin, planeZ, planeX);
  const trimmed = cu.__bk2d === 'trimmed' ? cu : null;
  const basis = trimmed ? trimmed.basis : cu;
  const range: [number, number] | null = trimmed ? [trimmed.tStart, trimmed.tEnd] : null;
  const bounds = ow2d.curveBounds(cu);

  switch (basis.__bk2d) {
    case 'line': {
      const p1 = frame.point(...ow2d.evaluateCurve2d(cu, bounds.first));
      const p2 = frame.point(...ow2d.evaluateCurve2d(cu, bounds.last));
      return handle('edge', k.makeLineEdge(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]));
    }
    case 'circle': {
      if (!range || Math.abs(range[1] - range[0]) >= 2 * Math.PI - 1e-12) {
        const [pcx, pcy, pcz] = frame.point(basis.cx, basis.cy);
        const [zx, zy, zz] = planeZ;
        return handle('edge', k.makeCircleEdge(pcx, pcy, pcz, zx, zy, zz, basis.radius));
      }
      // 3-point arc through three lifted points to ensure endpoint coordinates
      // are bit-identical with the line branches' lifts (so MakeWire merges
      // with default tolerance).
      const p1 = frame.point(...ow2d.evaluateCurve2d(cu, bounds.first));
      const pm = frame.point(...ow2d.evaluateCurve2d(cu, (bounds.first + bounds.last) / 2));
      const p2 = frame.point(...ow2d.evaluateCurve2d(cu, bounds.last));
      return handle(
        'edge',
        k.makeArcEdge(p1[0], p1[1], p1[2], pm[0], pm[1], pm[2], p2[0], p2[1], p2[2])
      );
    }
    case 'ellipse':
      return liftEllipse(k, frame, basis, range);
    case 'bezier':
      return liftBezier(
        k,
        Module,
        frame,
        range ? bezierSegmentPoles(basis.poles, range[0], range[1]) : basis.poles
      );
    case 'bspline': {
      const piece = range ? trimmedPoleCurve(basis, range[0], range[1]) : basis;
      return (piece && liftBSpline(k, Module, frame, piece)) || liftFitted(k, Module, frame, cu);
    }
    case 'trimmed':
      return liftFitted(k, Module, frame, cu);
  }
}

export function buildEdgeOnSurface(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  curve: Curve2dHandle,
  surface: KernelType
): KernelShape {
  const cu = c2d(curve);
  const bounds = ow2d.curveBounds(cu);
  // brepjs-patterns-disable: no-double-cast
  const faceId = unwrap(surface);
  const nSamples = 30;
  const vec = new Module.VectorDouble();
  for (let i = 0; i <= nSamples; i++) {
    const t = bounds.first + ((bounds.last - bounds.first) * i) / nSamples;
    const [u, v] = ow2d.evaluateCurve2d(cu, t);
    const pt = k.pointOnSurface(faceId, u, v);
    try {
      vec.push_back(pt.get(0));
      vec.push_back(pt.get(1));
      vec.push_back(pt.get(2));
    } finally {
      pt.delete();
    }
  }
  try {
    return handle('edge', k.interpolatePoints(vec, false));
  } finally {
    vec.delete();
  }
}

export function extractSurfaceFromFace(face: KernelShape): KernelType {
  // occt-wasm uses faces as surface proxies — just pass through.
  // brepjs-patterns-disable: no-double-cast
  return face;
}

export function extractCurve2dFromEdge(
  k: OcctKernelWasm,
  edge: KernelShape,
  face: KernelShape
): Curve2dHandle {
  // occt-wasm exposes no native pcurve adaptor (BRepAdaptor_Curve2d), so
  // reconstruct the edge's 2D curve on the face: sample the 3D edge, project each
  // point onto the face surface via uvFromPoint (GeomAPI_ProjectPointOnSurf), and
  // interpolate a 2D B-spline through the samples, the same projection approach
  // brepkit uses. A curved pcurve is exact at the samples and within the cubic
  // interpolation error between them.
  // Point projection also snaps to the nearest UV branch, so a seam-crossing edge
  // on a periodic surface (cylinder/cone) can jump branches.
  const [first, last] = curveParameters(k, edge);
  const N = 60;
  const points: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = first + ((last - first) * i) / N;
    const uv = uvFromPoint(k, face, curvePointAtParam(k, edge, t));
    if (uv) points.push(uv);
  }
  if (points.length < 2) {
    throw new Error(
      'occt-wasm: extractCurve2dFromEdge could not project the edge onto the face surface'
    );
  }
  return makeBSpline2d(points);
}

export function buildCurves3d(k: OcctKernelWasm, wire: KernelShape): void {
  k.buildCurves3d(unwrap(wire));
}

export function fixWireOnFace(
  k: OcctKernelWasm,
  wire: KernelShape,
  face: KernelShape,
  tolerance: number
): KernelShape {
  return handle('wire', k.fixWireOnFace(unwrap(wire), unwrap(face), tolerance));
}
