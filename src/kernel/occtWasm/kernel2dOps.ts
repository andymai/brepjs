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
import type { Curve2dObj } from '@/kernel/geometry2d.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import { handle, unwrap } from './helpers.js';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type bridge
  return c2dWrap({ ...full, __bk2d: 'ellipse', startAngle, endAngle } as any);
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
  // Build a genuine B-spline (poles = input points, clamped knot vector) so
  // getCurve2dType reports BSPLINE_CURVE and decomposeBSpline2dToBeziers works.
  // The pure-TS 2D system has no fitting solver, so this approximates (passes
  // through the endpoints) rather than interpolating every point.
  const poles = points;
  const n = poles.length;
  const degree = Math.max(1, Math.min(options?.degMax ?? 3, n - 1));
  const knots: number[] = [0];
  const mults: number[] = [degree + 1];
  const nInternalKnots = n - degree - 1;
  for (let i = 1; i <= nInternalKnots; i++) {
    knots.push(i / (nInternalKnots + 1));
    mults.push(1);
  }
  knots.push(1);
  mults.push(degree + 1);
  return c2dWrap({
    __bk2d: 'bspline' as const,
    poles,
    knots,
    multiplicities: mults,
    degree,
    isPeriodic: false,
  });
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
  return c2dWrap({ __bk2d: 'trimmed' as const, basis: c2d(curve), tStart: start, tEnd: end });
}

export function reverseCurve2d(_curve: Curve2dHandle): void {
  // Curves are immutable in our pure-TS 2D system — reverse is a no-op.
}

export function copyCurve2d(curve: Curve2dHandle): Curve2dHandle {
  return c2dWrap(JSON.parse(JSON.stringify(c2d(curve))));
}

export function offsetCurve2d(curve: Curve2dHandle, offset: number): Curve2dHandle {
  // Approximate offset by sampling + shifting normals.
  const c = c2d(curve);
  const bounds = ow2d.curveBounds(c);
  const pts: [number, number][] = [];
  for (let i = 0; i <= 20; i++) {
    const t = bounds.first + ((bounds.last - bounds.first) * i) / 20;
    const [px, py] = ow2d.evaluateCurve2d(c, t);
    const [tx, ty] = ow2d.tangentCurve2d(c, t);
    const len = Math.sqrt(tx * tx + ty * ty) || 1;
    pts.push([px - (ty / len) * offset, py + (tx / len) * offset]);
  }
  return c2dWrap(
    ow2d.makeBezier2d(
      pts.length <= 25 ? pts : pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1)
    )
  );
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
 * leaving the parallel component fixed. Applied by sampling and refitting as a
 * Bezier, since occt-wasm has no native Geom2d transform.
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
  const c = c2d(curve);
  const bounds = ow2d.curveBounds(c);
  const N = 20;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = bounds.first + ((bounds.last - bounds.first) * i) / N;
    const [qx, qy] = ow2d.evaluateCurve2d(c, t);
    pts.push([a * qx + b * qy + tx, d * qx + e * qy + ty]);
  }
  return c2dWrap(ow2d.makeBezier2d(pts));
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
    return mirrorCurve2dAtPoint(curve, Number(t['ox']) || 0, Number(t['oy']) || 0);
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
    // For circles and general curves: dense sampling.
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
    return { param: bestT, distance: Math.sqrt(bestDist) };
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
  const n = 20;
  let minDist = Infinity;
  for (let i = 0; i <= n; i++) {
    const t1 = p1Start + (p1End - p1Start) * (i / n);
    const [x1, y1] = ow2d.evaluateCurve2d(c2d(c1), t1);
    for (let j = 0; j <= n; j++) {
      const t2 = p2Start + (p2End - p2Start) * (j / n);
      const [x2, y2] = ow2d.evaluateCurve2d(c2d(c2), t2);
      const d = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      if (d < minDist) minDist = d;
    }
  }
  return minDist;
}

export function approximateCurve2dAsBSpline(
  curve: Curve2dHandle,
  maxSegments: number
): Curve2dHandle {
  const cu = c2d(curve);
  const bounds = ow2d.curveBounds(cu);
  const nPts = Math.min(Math.max(maxSegments + 1, 10), 100);
  const poles: [number, number][] = [];
  for (let i = 0; i < nPts; i++) {
    const t = bounds.first + ((bounds.last - bounds.first) * i) / (nPts - 1);
    poles.push(ow2d.evaluateCurve2d(cu, t));
  }
  const degree = Math.min(3, nPts - 1);
  const n = poles.length;
  const knots: number[] = [];
  const mults: number[] = [];
  const nInternalKnots = n - degree - 1;
  knots.push(0);
  mults.push(degree + 1);
  for (let i = 1; i <= nInternalKnots; i++) {
    knots.push(i / (nInternalKnots + 1));
    mults.push(1);
  }
  knots.push(1);
  mults.push(degree + 1);

  return c2dWrap({
    __bk2d: 'bspline' as const,
    poles,
    knots,
    multiplicities: mults,
    degree,
    isPeriodic: false,
  });
}

export function decomposeBSpline2dToBeziers(curve: Curve2dHandle): Curve2dHandle[] {
  let cu = c2d(curve);
  while (cu.__bk2d === 'trimmed') cu = cu.basis;
  if (cu.__bk2d !== 'bspline') return [curve];

  const poles: [number, number][] = cu.poles;
  const p: number = cu.degree;
  // Expand knots+multiplicities into the full knot vector U.
  const U: number[] = [];
  for (let i = 0; i < cu.knots.length; i++) {
    const knot = cu.knots[i] ?? 0;
    const mult = cu.multiplicities[i] ?? 0;
    for (let j = 0; j < mult; j++) U.push(knot);
  }
  const n = poles.length - 1;
  const m = n + p + 1;
  // A clamped, non-rational B-spline has |U| = n + p + 2. Bail to a single
  // Bezier on the control polygon if the curve is malformed.
  if (p < 1 || U.length !== m + 1) {
    return [c2dWrap(ow2d.makeBezier2d(poles))];
  }

  // NURBS Book Algorithm A5.6 (DecomposeCurve): knot-insert every interior knot
  // up to multiplicity p, yielding one Bezier segment (p+1 poles) per span.
  const clone = (pt: [number, number]): [number, number] => [pt[0], pt[1]];
  const segments: [number, number][][] = [];
  let a = p;
  let b = p + 1;
  let segPoles: [number, number][] = [];
  for (let i = 0; i <= p; i++) segPoles[i] = clone(poles[i] as [number, number]);
  let nextPoles: [number, number][] = [];
  while (b < m) {
    const i0 = b;
    while (b < m && U[b + 1] === U[b]) b++;
    const mult = b - i0 + 1;
    if (mult < p) {
      const numer = (U[b] as number) - (U[a] as number);
      const alphas: number[] = [];
      for (let j = p; j > mult; j--) {
        alphas[j - mult - 1] = numer / ((U[a + j] as number) - (U[a] as number));
      }
      const r = p - mult;
      for (let j = 1; j <= r; j++) {
        const save = r - j;
        const s = mult + j;
        for (let k = p; k >= s; k--) {
          const alpha = alphas[k - s] as number;
          const cur = segPoles[k] as [number, number];
          const prev = segPoles[k - 1] as [number, number];
          segPoles[k] = [
            alpha * cur[0] + (1 - alpha) * prev[0],
            alpha * cur[1] + (1 - alpha) * prev[1],
          ];
        }
        if (b < m) nextPoles[save] = clone(segPoles[p] as [number, number]);
      }
    }
    segments.push(segPoles);
    if (b < m) {
      for (let i = p - mult; i <= p; i++) {
        nextPoles[i] = clone(poles[b - p + i] as [number, number]);
      }
      segPoles = nextPoles;
      nextPoles = [];
      a = b;
      b++;
    }
  }
  return segments.map((sp) => c2dWrap(ow2d.makeBezier2d(sp)));
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

// brepjs-patterns-disable: max-function-lines
export function liftCurve2dToPlane(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  curve: Curve2dHandle,
  planeOrigin: [number, number, number],
  planeZ: [number, number, number],
  planeX: [number, number, number]
): KernelShape {
  const cu = c2d(curve);
  const [ox, oy, oz] = planeOrigin;
  const [zx, zy, zz] = planeZ;
  const [xx, xy, xz] = planeX;
  const yx = zy * xz - zz * xy,
    yy = zz * xx - zx * xz,
    yz = zx * xy - zy * xx;
  const lift = (u: number, v: number): [number, number, number] => [
    ox + u * xx + v * yx,
    oy + u * xy + v * yy,
    oz + u * xz + v * yz,
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inspect curve internals
  const bk2dType = (cu as any).__bk2d as string;
  if (bk2dType === 'line') {
    const bounds = ow2d.curveBounds(cu);
    const [u1, v1] = ow2d.evaluateCurve2d(cu, bounds.first);
    const [u2, v2] = ow2d.evaluateCurve2d(cu, bounds.last);
    const p1 = lift(u1, v1);
    const p2 = lift(u2, v2);
    return handle('edge', k.makeLineEdge(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]));
  }
  if (bk2dType === 'trimmed') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inspect trimmed basis
    const trimmed = cu as any;
    if (trimmed.basis && trimmed.basis.__bk2d === 'line') {
      const [u1, v1] = ow2d.evaluateCurve2d(cu, 0);
      const [u2, v2] = ow2d.evaluateCurve2d(cu, 1);
      const p1 = lift(u1, v1);
      const p2 = lift(u2, v2);
      return handle('edge', k.makeLineEdge(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]));
    }
    if (trimmed.basis && trimmed.basis.__bk2d === 'circle') {
      // 3-point arc through three lifted points to ensure endpoint coordinates
      // are bit-identical with the line branches' lifts (so MakeWire merges
      // with default tolerance).
      const bounds = ow2d.curveBounds(cu);
      const [u1, v1] = ow2d.evaluateCurve2d(cu, bounds.first);
      const [um, vm] = ow2d.evaluateCurve2d(cu, (bounds.first + bounds.last) / 2);
      const [u2, v2] = ow2d.evaluateCurve2d(cu, bounds.last);
      const p1 = lift(u1, v1);
      const pm = lift(um, vm);
      const p2 = lift(u2, v2);
      return handle(
        'edge',
        k.makeArcEdge(p1[0], p1[1], p1[2], pm[0], pm[1], pm[2], p2[0], p2[1], p2[2])
      );
    }
  }
  if (bk2dType === 'circle') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inspect circle data
    const circleData = cu as any;
    if (circleData.cx !== undefined && circleData.radius !== undefined) {
      const [pcx, pcy, pcz] = lift(circleData.cx, circleData.cy);
      return handle('edge', k.makeCircleEdge(pcx, pcy, pcz, zx, zy, zz, circleData.radius));
    }
    const bounds = ow2d.curveBounds(cu);
    const [u1, v1] = ow2d.evaluateCurve2d(cu, bounds.first);
    const [um, vm] = ow2d.evaluateCurve2d(cu, (bounds.first + bounds.last) / 2);
    const [u2, v2] = ow2d.evaluateCurve2d(cu, bounds.last);
    const p1 = lift(u1, v1);
    const pm = lift(um, vm);
    const p2 = lift(u2, v2);
    return handle(
      'edge',
      k.makeArcEdge(p1[0], p1[1], p1[2], pm[0], pm[1], pm[2], p2[0], p2[1], p2[2])
    );
  }
  // Fallback: sample + interpolate.
  const bounds = ow2d.curveBounds(cu);
  const nSamples = 24;
  const dt = (bounds.last - bounds.first) / nSamples;
  const pts: number[] = [];
  for (let i = 0; i <= nSamples; i++) {
    const [u, v] = ow2d.evaluateCurve2d(cu, bounds.first + i * dt);
    const [px, py, pz] = lift(u, v);
    pts.push(px, py, pz);
  }
  const vec = new Module.VectorDouble();
  for (const p of pts) vec.push_back(p);
  try {
    return handle('edge', k.interpolatePoints(vec, false));
  } finally {
    vec.delete();
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
  // fit a 2D B-spline through the samples — the same projection approach brepkit
  // uses. Accuracy: makeBSpline2d has no fitting solver and treats the samples as
  // control poles, so a straight (LINE) edge is exact, while a curved pcurve (an
  // arc/circle on a planar face, or any curved edge) is a smooth approximation
  // that bows slightly inside the samples — the deviation shrinks as N rises.
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
