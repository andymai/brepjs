/**
 * 2D curve and bounding-box operations for the brepkit adapter.
 *
 * Pure TypeScript — no WASM boundary crossing for most operations.
 * Methods that require the brepkit kernel take `bk: BrepkitKernel` as their
 * first parameter; the rest work entirely with bk2d module functions and
 * opaque handle casts.
 *
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { KernelShape, KernelType } from '@/kernel/types.js';
import type { Curve2dHandle, BBox2dHandle } from '@/kernel/kernel2dTypes.js';
import type { Curve2dObj } from '../geometry2d.js';
import * as bk2d from '../geometry2d.js';
import {
  isBrepkitHandle,
  noop,
  unwrap,
  edgeHandle,
  wireHandle,
  faceHandle,
  c2d,
  c2dBasis,
  bb2d,
} from './helpers.js';
import { makeLineEdge, interpolatePoints, makeNonPlanarFace } from './constructionOps.js';
import { iterShapes } from './topologyOps.js';

// ═══════════════════════════════════════════════════════════════════════
// Primitive 2D geometry constructors
// ═══════════════════════════════════════════════════════════════════════

export function createPoint2d(x: number, y: number): KernelType {
  return { x, y };
}

export function createDirection2d(x: number, y: number): KernelType {
  const l = Math.sqrt(x * x + y * y);
  if (l < 1e-15) throw new Error('brepkit: createDirection2d called with zero-length vector');
  return { x: x / l, y: y / l };
}

export function createVector2d(x: number, y: number): KernelType {
  return { x, y };
}

export function createAxis2d(px: number, py: number, dx: number, dy: number): KernelType {
  return { px, py, dx, dy, delete: noop } as KernelType;
}

export function wrapCurve2dHandle(handle: KernelType): Curve2dHandle {
  return handle;
}

export function createCurve2dAdaptor(handle: Curve2dHandle): KernelType {
  return handle;
}

// ═══════════════════════════════════════════════════════════════════════
// 2D curve construction
// ═══════════════════════════════════════════════════════════════════════

export function makeLine2d(x1: number, y1: number, x2: number, y2: number): Curve2dHandle {
  return bk2d.makeLine2d(x1, y1, x2, y2);
}

export function makeCircle2d(
  cx: number,
  cy: number,
  radius: number,
  sense?: boolean
): Curve2dHandle {
  return bk2d.makeCircle2d(cx, cy, radius, sense);
}

export function makeArc2dThreePoints(
  x1: number,
  y1: number,
  xm: number,
  ym: number,
  x2: number,
  y2: number
): Curve2dHandle {
  // Circumscribed circle through 3 points
  const d = 2 * (x1 * (ym - y2) + xm * (y2 - y1) + x2 * (y1 - ym));
  if (Math.abs(d) < 1e-12) {
    // Degenerate (collinear): return a line
    return bk2d.makeLine2d(x1, y1, x2, y2);
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

  // Compute angles for start (p1), mid (pm), and end (p2)
  const a1 = Math.atan2(y1 - cy, x1 - cx);
  const am = Math.atan2(ym - cy, xm - cx);
  const a2 = Math.atan2(y2 - cy, x2 - cx);

  // Determine sense: CCW if mid-point angle is between start and end going CCW
  let da1m = am - a1;
  if (da1m < 0) da1m += 2 * Math.PI;
  let da12 = a2 - a1;
  if (da12 < 0) da12 += 2 * Math.PI;
  const sense = da1m < da12; // CCW if midpoint comes before endpoint

  const circle = bk2d.makeCircle2d(cx, cy, radius, sense);
  if (!sense) {
    // CW circle evaluates angle = -t, so parameter t = -angle.
    // Map start/end angles to the CW parameter space.
    const tStart = -a1;
    let tEnd = -a2;
    // Ensure tEnd >= tStart so the linear interpolation
    // tStart + t*(tEnd-tStart) traverses the arc in the correct (CW) direction.
    if (tEnd < tStart - 1e-9) tEnd += 2 * Math.PI;
    return { __bk2d: 'trimmed', basis: circle, tStart, tEnd } as Curve2dObj;
  }
  // CCW: ensure tEnd >= tStart so interpolation goes in the CCW direction.
  let tEnd = a2;
  if (tEnd < a1 - 1e-9) tEnd += 2 * Math.PI;
  return { __bk2d: 'trimmed', basis: circle, tStart: a1, tEnd } as Curve2dObj;
}

export function makeArc2dTangent(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  ex: number,
  ey: number
): Curve2dHandle {
  // Exact tangent arc: find circle center C where:
  //   (C - S) . T = 0        (tangent constraint)
  //   |C - S| = |C - E|      (equidistant = on circle)
  // Solution: C = S + t * perp(T), with t = -chord^2 / (2 * ((sy-ey)*ntx - (sx-ex)*nty))
  const len = Math.sqrt(tx * tx + ty * ty);
  const ntx = len > 0 ? tx / len : 0;
  const nty = len > 0 ? ty / len : 0;

  const dx = sx - ex;
  const dy = sy - ey;
  const denom = 2 * (dy * ntx - dx * nty);

  if (Math.abs(denom) < 1e-12) {
    // Degenerate: tangent parallel to S->E chord
    return bk2d.makeLine2d(sx, sy, ex, ey);
  }

  const chord2 = dx * dx + dy * dy;
  const t = -chord2 / denom;
  const cx = sx - t * nty;
  const cy = sy + t * ntx;
  const radius = Math.abs(t);

  // Pick the arc midpoint on the correct side (matching tangent direction).
  const a1 = Math.atan2(sy - cy, sx - cx);
  const a2 = Math.atan2(ey - cy, ex - cx);

  // At S the CCW tangent is perpendicular to the radius: (-sin(a1), cos(a1))
  const ccwTanX = -(sy - cy) / radius;
  const ccwTanY = (sx - cx) / radius;
  const dotCcw = ntx * ccwTanX + nty * ccwTanY;

  let aMid: number;
  if (dotCcw > 0) {
    // CCW arc from S to E
    let da = a2 - a1;
    if (da <= 0) da += 2 * Math.PI;
    aMid = a1 + da / 2;
  } else {
    // CW arc from S to E
    let da = a2 - a1;
    if (da >= 0) da -= 2 * Math.PI;
    aMid = a1 + da / 2;
  }

  const mx = cx + radius * Math.cos(aMid);
  const my = cy + radius * Math.sin(aMid);

  return makeArc2dThreePoints(sx, sy, mx, my, ex, ey);
}

export function makeEllipse2d(
  cx: number,
  cy: number,
  major: number,
  minor: number,
  xDirX?: number,
  xDirY?: number,
  sense?: boolean
): Curve2dHandle {
  return bk2d.makeEllipse2d(cx, cy, major, minor, xDirX, xDirY, sense);
}

export function makeEllipseArc2d(
  cx: number,
  cy: number,
  major: number,
  minor: number,
  start: number,
  end: number,
  xDirX?: number,
  xDirY?: number,
  sense?: boolean
): Curve2dHandle {
  const ellipse = bk2d.makeEllipse2d(cx, cy, major, minor, xDirX, xDirY, sense);
  return { __bk2d: 'trimmed', basis: ellipse, tStart: start, tEnd: end } as Curve2dObj;
}

export function makeBezier2d(points: [number, number][]): Curve2dHandle {
  return bk2d.makeBezier2d(points);
}

export function makeBSpline2d(
  points: [number, number][],
  _options?: Record<string, unknown>
): Curve2dHandle {
  // Approximate: use points as control points with uniform knots
  const n = points.length;
  const degree = Math.min(3, n - 1);
  const knots: number[] = [];
  const mults: number[] = [];
  knots.push(0);
  mults.push(degree + 1);
  const nInternal = n - degree - 1;
  for (let i = 1; i <= nInternal; i++) {
    knots.push(i / (nInternal + 1));
    mults.push(1);
  }
  knots.push(1);
  mults.push(degree + 1);
  return {
    __bk2d: 'bspline',
    poles: [...points],
    knots,
    multiplicities: mults,
    degree,
    isPeriodic: false,
  } as Curve2dObj;
}

// ═══════════════════════════════════════════════════════════════════════
// 2D curve evaluation & query
// ═══════════════════════════════════════════════════════════════════════

export function evaluateCurve2d(curve: Curve2dHandle, param: number): [number, number] {
  return bk2d.evaluateCurve2d(c2d(curve), param);
}

export function evaluateCurve2dD1(
  curve: Curve2dHandle,
  param: number
): { point: [number, number]; tangent: [number, number] } {
  return {
    point: bk2d.evaluateCurve2d(c2d(curve), param),
    tangent: bk2d.tangentCurve2d(c2d(curve), param),
  };
}

export function getCurve2dBounds(curve: Curve2dHandle): { first: number; last: number } {
  return bk2d.curveBounds(c2d(curve));
}

export function getCurve2dType(curve: Curve2dHandle): string {
  // Unwrap trimmed curves to report the basis type (matches OCCT adaptor behavior)
  return bk2d.curveTypeName(c2dBasis(curve));
}

// ═══════════════════════════════════════════════════════════════════════
// 2D curve manipulation
// ═══════════════════════════════════════════════════════════════════════

export function trimCurve2d(curve: Curve2dHandle, start: number, end: number): Curve2dHandle {
  return { __bk2d: 'trimmed', basis: c2d(curve), tStart: start, tEnd: end } as Curve2dObj;
}

export function reverseCurve2d(_curve: Curve2dHandle): void {
  /* Mutates in-place — no-op for immutable objects */
}

export function copyCurve2d(curve: Curve2dHandle): Curve2dHandle {
  return JSON.parse(JSON.stringify(curve));
}

export function offsetCurve2d(curve: Curve2dHandle, offset: number): Curve2dHandle {
  // Approximate: sample the curve, offset each point by the normal, rebuild
  const c = c2d(curve);
  const bounds = bk2d.curveBounds(c);
  const N = 30;
  const poles: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = bounds.first + ((bounds.last - bounds.first) * i) / N;
    const [px, py] = bk2d.evaluateCurve2d(c, t);
    const [tx, ty] = bk2d.tangentCurve2d(c, t);
    const tLen = Math.sqrt(tx * tx + ty * ty);
    if (tLen > 1e-12) {
      // Normal = perpendicular to tangent
      poles.push([px - (ty / tLen) * offset, py + (tx / tLen) * offset]);
    } else {
      poles.push([px, py]);
    }
  }
  return makeBSpline2d(poles);
}

export function translateCurve2d(curve: Curve2dHandle, dx: number, dy: number): Curve2dHandle {
  return bk2d.translateCurve2d(c2d(curve), dx, dy);
}

export function rotateCurve2d(
  curve: Curve2dHandle,
  angle: number,
  cx: number,
  cy: number
): Curve2dHandle {
  return bk2d.rotateCurve2d(c2d(curve), angle, cx, cy);
}

export function scaleCurve2d(
  curve: Curve2dHandle,
  factor: number,
  cx: number,
  cy: number
): Curve2dHandle {
  return bk2d.scaleCurve2d(c2d(curve), factor, cx, cy);
}

export function mirrorCurve2dAtPoint(curve: Curve2dHandle, cx: number, cy: number): Curve2dHandle {
  return bk2d.mirrorAtPoint(c2d(curve), cx, cy);
}

export function mirrorCurve2dAcrossAxis(
  curve: Curve2dHandle,
  ox: number,
  oy: number,
  dx: number,
  dy: number
): Curve2dHandle {
  return bk2d.mirrorAcrossAxis(c2d(curve), ox, oy, dx, dy);
}

export function affinityTransform2d(
  curve: Curve2dHandle,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  ratio: number
): Curve2dHandle {
  return transformCurve2dGeneral(curve, createAffinityGTrsf2d(ox, oy, dx, dy, ratio));
}

// ═══════════════════════════════════════════════════════════════════════
// General 2D transforms (stored as 3x3 matrices)
// ═══════════════════════════════════════════════════════════════════════

// All GTrsf2d methods return objects with a no-op .delete() to match OCCT's
// Emscripten WASM objects, which callers (e.g. curves.ts) rely on for cleanup.

function _gtrsf(m: number[], tx: number, ty: number): KernelType {
  return { m, tx, ty, delete: noop } as KernelType;
}

export function createIdentityGTrsf2d(): KernelType {
  return _gtrsf([1, 0, 0, 0, 1, 0, 0, 0, 1], 0, 0);
}

export function createAffinityGTrsf2d(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  ratio: number
): KernelType {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-15) return createIdentityGTrsf2d();
  const px = -dy / len,
    py = dx / len; // perpendicular to axis
  const k = ratio - 1;
  const m = [1 + k * px * px, k * px * py, 0, k * py * px, 1 + k * py * py, 0, 0, 0, 1];
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
  const txv = ox - m[0]! * ox - m[1]! * oy;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
  const tyv = oy - m[3]! * ox - m[4]! * oy;
  return _gtrsf(m, txv, tyv);
}

export function createTranslationGTrsf2d(dx: number, dy: number): KernelType {
  return _gtrsf([1, 0, 0, 0, 1, 0, 0, 0, 1], dx, dy);
}

export function createMirrorGTrsf2d(
  cx: number,
  cy: number,
  mode: 'point' | 'axis',
  ox?: number,
  oy?: number,
  dx?: number,
  dy?: number
): KernelType {
  if (mode === 'axis' && dx !== undefined && dy !== undefined) {
    // Mirror across axis through (ox ?? cx, oy ?? cy) with direction (dx, dy)
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / len,
      ny = dy / len;
    // Reflection matrix: R = 2*n*nT - I
    const m = [2 * nx * nx - 1, 2 * nx * ny, 0, 2 * nx * ny, 2 * ny * ny - 1, 0, 0, 0, 1];
    const px = ox ?? cx,
      py = oy ?? cy;
    // Translation: p - R*p
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
    const txv = px - m[0]! * px - m[1]! * py;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
    const tyv = py - m[3]! * px - m[4]! * py;
    return _gtrsf(m, txv, tyv);
  }
  // Point mirror at (cx, cy)
  return _gtrsf([-1, 0, 0, 0, -1, 0, 0, 0, 1], 2 * cx, 2 * cy);
}

export function createRotationGTrsf2d(angle: number, cx: number, cy: number): KernelType {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return _gtrsf([c, -s, 0, s, c, 0, 0, 0, 1], cx - c * cx + s * cy, cy - s * cx - c * cy);
}

export function createScaleGTrsf2d(factor: number, cx: number, cy: number): KernelType {
  return _gtrsf([factor, 0, 0, 0, factor, 0, 0, 0, 1], cx * (1 - factor), cy * (1 - factor));
}

export function setGTrsf2dTranslationPart(gtrsf: KernelType, dx: number, dy: number): void {
  gtrsf.tx = dx;
  gtrsf.ty = dy;
}

export function multiplyGTrsf2d(base: KernelType, other: KernelType): void {
  // Full 3x3 matrix multiply: base = base * other
  const a = base.m as number[],
    b = other.m as number[];
  /* eslint-disable @typescript-eslint/no-non-null-assertion -- WASM index */
  const r = [
    a[0]! * b[0]! + a[1]! * b[3]! + a[2]! * b[6]!,
    a[0]! * b[1]! + a[1]! * b[4]! + a[2]! * b[7]!,
    a[0]! * b[2]! + a[1]! * b[5]! + a[2]! * b[8]!,
    a[3]! * b[0]! + a[4]! * b[3]! + a[5]! * b[6]!,
    a[3]! * b[1]! + a[4]! * b[4]! + a[5]! * b[7]!,
    a[3]! * b[2]! + a[4]! * b[5]! + a[5]! * b[8]!,
    a[6]! * b[0]! + a[7]! * b[3]! + a[8]! * b[6]!,
    a[6]! * b[1]! + a[7]! * b[4]! + a[8]! * b[7]!,
    a[6]! * b[2]! + a[7]! * b[5]! + a[8]! * b[8]!,
  ];
  /* eslint-enable @typescript-eslint/no-non-null-assertion */
  base.m = r;
  const oldTx = base.tx as number,
    oldTy = base.ty as number;
  const otx = Number(other.tx) || 0,
    oty = Number(other.ty) || 0;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
  base.tx = a[0]! * otx + a[1]! * oty + oldTx;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
  base.ty = a[3]! * otx + a[4]! * oty + oldTy;
}

export function transformCurve2dGeneral(curve: Curve2dHandle, gtrsf: KernelType): Curve2dHandle {
  // Apply full affine transform: sample curve, transform points, refit as Bezier
  const c = c2d(curve);
  const m = (gtrsf.m as number[] | undefined) ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const tx = Number(gtrsf.tx) || 0,
    ty = Number(gtrsf.ty) || 0;
  // If transform is just a translation, use fast path
  /* eslint-disable @typescript-eslint/no-non-null-assertion -- WASM index */
  const isIdentityMatrix =
    Math.abs(m[0]! - 1) < 1e-12 &&
    Math.abs(m[4]! - 1) < 1e-12 &&
    Math.abs(m[1]!) < 1e-12 &&
    Math.abs(m[3]!) < 1e-12;
  /* eslint-enable @typescript-eslint/no-non-null-assertion */
  if (isIdentityMatrix) {
    return bk2d.translateCurve2d(c, tx, ty);
  }
  // General: sample, transform, refit as Bezier polyline
  const bounds = bk2d.curveBounds(c);
  const N = 20;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = bounds.first + ((bounds.last - bounds.first) * i) / N;
    const [px, py] = bk2d.evaluateCurve2d(c, t);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
    pts.push([m[0]! * px + m[1]! * py + tx, m[3]! * px + m[4]! * py + ty]);
  }
  return bk2d.makeBezier2d(pts);
}

// ═══════════════════════════════════════════════════════════════════════
// 2D intersection & distance
// ═══════════════════════════════════════════════════════════════════════

export function intersectCurves2d(
  c1: Curve2dHandle,
  c2: Curve2dHandle,
  tolerance: number
): { points: [number, number][]; segments: Curve2dHandle[] } {
  const result = bk2d.intersectCurves2dFn(c2d(c1), c2d(c2), tolerance);
  // Wrap segment Curve2dObj as Curve2dHandle (add no-op delete for OCCT compat)
  const segments: Curve2dHandle[] = result.segments.map((s) =>
    Object.assign(s, {
      delete() {
        /* no-op */
      },
    })
  );
  return { points: result.points, segments };
}

export function projectPointOnCurve2d(
  curve: Curve2dHandle,
  x: number,
  y: number
): { param: number; distance: number } | null {
  const c = c2d(curve);
  const bounds = bk2d.curveBounds(c);

  // Analytic projection for untrimmed lines
  if (c.__bk2d === 'line') {
    const dx = x - c.ox;
    const dy = y - c.oy;
    const t = Math.max(bounds.first, Math.min(bounds.last, dx * c.dx + dy * c.dy));
    const [px, py] = bk2d.evaluateCurve2d(c, t);
    return { param: t, distance: Math.sqrt((px - x) ** 2 + (py - y) ** 2) };
  }

  // Analytic projection for untrimmed circles
  if (c.__bk2d === 'circle') {
    const angle = Math.atan2(y - c.cy, x - c.cx);
    let t = c.sense ? angle : -angle;
    while (t < 0) t += 2 * Math.PI;
    while (t > 2 * Math.PI) t -= 2 * Math.PI;
    const [px, py] = bk2d.evaluateCurve2d(c, t);
    return { param: t, distance: Math.sqrt((px - x) ** 2 + (py - y) ** 2) };
  }

  // General: brute-force + Newton refinement (handles trimmed, ellipse, bezier, bspline)
  if (!isFinite(bounds.first) || !isFinite(bounds.last)) return null;
  let bestT = bounds.first;
  let bestDist = Infinity;
  const N = 200;
  const dt = (bounds.last - bounds.first) / N;
  for (let i = 0; i <= N; i++) {
    const t = bounds.first + i * dt;
    const [px, py] = bk2d.evaluateCurve2d(c, t);
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestT = t;
    }
  }
  // Newton refinement: minimize f(t) = |C(t) - P|^2
  // f'(t) = 2 * dot(C(t) - P, C'(t))
  for (let iter = 0; iter < 10; iter++) {
    const [px, py] = bk2d.evaluateCurve2d(c, bestT);
    const [tx, ty] = bk2d.tangentCurve2d(c, bestT);
    const dot = (px - x) * tx + (py - y) * ty;
    const denom = tx * tx + ty * ty;
    if (denom < 1e-20) break;
    const step = dot / denom;
    const newT = Math.max(bounds.first, Math.min(bounds.last, bestT - step));
    if (Math.abs(newT - bestT) < 1e-14) break;
    bestT = newT;
  }
  const [fx, fy] = bk2d.evaluateCurve2d(c, bestT);
  return { param: bestT, distance: Math.sqrt((fx - x) ** 2 + (fy - y) ** 2) };
}

export function distanceBetweenCurves2d(
  c1: Curve2dHandle,
  c2: Curve2dHandle,
  p1s: number,
  p1e: number,
  p2s: number,
  p2e: number
): number {
  const curve1 = c2d(c1);
  const curve2 = c2d(c2);

  // Phase 1: 50x50 grid scan
  let bestT1 = p1s;
  let bestT2 = p2s;
  let minDistSq = Infinity;
  const N = 50;
  for (let i = 0; i <= N; i++) {
    const t1 = p1s + ((p1e - p1s) * i) / N;
    const [x1, y1] = bk2d.evaluateCurve2d(curve1, t1);
    for (let j = 0; j <= N; j++) {
      const t2 = p2s + ((p2e - p2s) * j) / N;
      const [x2, y2] = bk2d.evaluateCurve2d(curve2, t2);
      const d = (x2 - x1) ** 2 + (y2 - y1) ** 2;
      if (d < minDistSq) {
        minDistSq = d;
        bestT1 = t1;
        bestT2 = t2;
      }
    }
  }

  // Phase 2: Alternating projection refinement
  let t1 = bestT1;
  let t2 = bestT2;
  for (let iter = 0; iter < 20; iter++) {
    // Fix t2, project C2(t2) onto C1 to refine t1
    const [x2, y2] = bk2d.evaluateCurve2d(curve2, t2);
    const proj1 = projectPointOnCurve2d(c1, x2, y2);
    if (proj1) {
      const newT1 = Math.max(p1s, Math.min(p1e, proj1.param));
      const converged1 = Math.abs(newT1 - t1) < 1e-12;
      t1 = newT1;
      if (converged1) break;
    }

    // Fix t1, project C1(t1) onto C2 to refine t2
    const [x1, y1] = bk2d.evaluateCurve2d(curve1, t1);
    const proj2 = projectPointOnCurve2d(c2, x1, y1);
    if (proj2) {
      const newT2 = Math.max(p2s, Math.min(p2e, proj2.param));
      const converged2 = Math.abs(newT2 - t2) < 1e-12;
      t2 = newT2;
      if (converged2) break;
    }
  }

  const [fx1, fy1] = bk2d.evaluateCurve2d(curve1, t1);
  const [fx2, fy2] = bk2d.evaluateCurve2d(curve2, t2);
  return Math.sqrt((fx2 - fx1) ** 2 + (fy2 - fy1) ** 2);
}

// ═══════════════════════════════════════════════════════════════════════
// 2D curve approximation & decomposition
// ═══════════════════════════════════════════════════════════════════════

export function approximateCurve2dAsBSpline(
  curve: Curve2dHandle,
  tol: number,
  cont: 'C0' | 'C1' | 'C2' | 'C3',
  maxSeg: number
): Curve2dHandle {
  // Sample the curve densely and build a B-spline approximation
  const c = c2d(curve);
  const bounds = bk2d.curveBounds(c);

  // Map continuity to minimum degree
  const contDegMap: Record<string, number> = { C0: 1, C1: 2, C2: 3, C3: 4 };
  const degree = Math.max(3, contDegMap[cont] ?? 4);

  // Start with 100 samples, adaptively increase if error exceeds tolerance
  let N = Math.max(100, maxSeg * 10);
  let poles: [number, number][] = [];
  let maxErr = Infinity;

  for (let attempt = 0; attempt < 3 && maxErr > tol; attempt++) {
    poles = [];
    for (let i = 0; i <= N; i++) {
      const t = bounds.first + ((bounds.last - bounds.first) * i) / N;
      poles.push(bk2d.evaluateCurve2d(c, t));
    }

    // Check approximation error at midpoints between samples
    maxErr = 0;
    for (let i = 0; i < N; i++) {
      const tMid = bounds.first + ((bounds.last - bounds.first) * (i + 0.5)) / N;
      const [ex, ey] = bk2d.evaluateCurve2d(c, tMid);
      // Linear interp between adjacent samples
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
      const p0 = poles[i]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
      const p1 = poles[i + 1]!;
      const mx = (p0[0] + p1[0]) / 2;
      const my = (p0[1] + p1[1]) / 2;
      const err = Math.sqrt((ex - mx) ** 2 + (ey - my) ** 2);
      if (err > maxErr) maxErr = err;
    }

    if (maxErr > tol) N = Math.min(N * 2, 500);
  }

  return makeBSpline2d(poles, { degMax: degree });
}

export function decomposeBSpline2dToBeziers(curve: Curve2dHandle): Curve2dHandle[] {
  const c = c2dBasis(curve);
  if (c.__bk2d === 'bezier') return [curve];
  if (c.__bk2d !== 'bspline') {
    // For other types, approximate as B-spline first, then decompose
    const approx = approximateCurve2dAsBSpline(curve, 1e-6, 'C2', 10);
    return decomposeBSpline2dToBeziers(approx);
  }
  // Convert B-spline to cubic Bezier(s) via Hermite interpolation.
  // For multi-span B-splines, split at internal knots.
  // Use the original (possibly trimmed) curve bounds, not the basis bounds,
  // so only Bezier segments within the trim range are emitted.
  const trimBounds = bk2d.curveBounds(c2d(curve));
  const first = trimBounds.first;
  const last = trimBounds.last;
  // Collect unique internal knots
  const internalKnots: number[] = [];
  for (const k of c.knots) {
    if (k > first + 1e-12 && k < last - 1e-12) internalKnots.push(k);
  }
  const breakpoints = [first, ...internalKnots, last];
  const result: Curve2dHandle[] = [];
  for (let i = 0; i < breakpoints.length - 1; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
    const t0 = breakpoints[i]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
    const t1 = breakpoints[i + 1]!;
    const span = t1 - t0;
    if (span < 1e-15) continue;
    const p0 = bk2d.evaluateCurve2d(c, t0);
    const p3 = bk2d.evaluateCurve2d(c, t1);
    const tan0 = bk2d.tangentCurve2d(c, t0);
    const tan3 = bk2d.tangentCurve2d(c, t1);
    const s = span / 3;
    const bezier: Curve2dObj = {
      __bk2d: 'bezier',
      poles: [
        p0,
        [p0[0] + tan0[0] * s, p0[1] + tan0[1] * s],
        [p3[0] - tan3[0] * s, p3[1] - tan3[1] * s],
        p3,
      ],
    };
    result.push(bezier as Curve2dHandle);
  }
  return result.length > 0 ? result : [curve];
}

// ═══════════════════════════════════════════════════════════════════════
// 2D bounding boxes
// ═══════════════════════════════════════════════════════════════════════

export function createBoundingBox2d(): BBox2dHandle {
  return bk2d.createBBox2d();
}

export function addCurveToBBox2d(bbox: BBox2dHandle, curve: Curve2dHandle, tol: number): void {
  bk2d.addCurveToBBox(bb2d(bbox), c2d(curve), tol);
}

export function getBBox2dBounds(bbox: BBox2dHandle): {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
} {
  const b = bb2d(bbox);
  return { xMin: b.xMin, yMin: b.yMin, xMax: b.xMax, yMax: b.yMax };
}

export function mergeBBox2d(target: BBox2dHandle, other: BBox2dHandle): void {
  const t = bb2d(target),
    o = bb2d(other);
  t.xMin = Math.min(t.xMin, o.xMin);
  t.yMin = Math.min(t.yMin, o.yMin);
  t.xMax = Math.max(t.xMax, o.xMax);
  t.yMax = Math.max(t.yMax, o.yMax);
}

export function isBBox2dOut(a: BBox2dHandle, b: BBox2dHandle): boolean {
  const ba = bb2d(a),
    bbb = bb2d(b);
  return ba.xMax < bbb.xMin || bbb.xMax < ba.xMin || ba.yMax < bbb.yMin || bbb.yMax < ba.yMin;
}

export function isBBox2dOutPoint(bbox: BBox2dHandle, x: number, y: number): boolean {
  const b = bb2d(bbox);
  return x < b.xMin || x > b.xMax || y < b.yMin || y > b.yMax;
}

// ═══════════════════════════════════════════════════════════════════════
// 2D type extraction
// ═══════════════════════════════════════════════════════════════════════

export function getCurve2dCircleData(
  curve: Curve2dHandle
): { cx: number; cy: number; radius: number; isDirect: boolean } | null {
  const c = c2dBasis(curve);
  if (c.__bk2d === 'circle') return { cx: c.cx, cy: c.cy, radius: c.radius, isDirect: c.sense };
  return null;
}

export function getCurve2dEllipseData(
  curve: Curve2dHandle
): { majorRadius: number; minorRadius: number; xAxisAngle: number; isDirect: boolean } | null {
  const c = c2dBasis(curve);
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
  const c = c2dBasis(curve);
  if (c.__bk2d === 'bezier') return [...c.poles];
  return null;
}

export function getCurve2dBezierDegree(curve: Curve2dHandle): number | null {
  const c = c2dBasis(curve);
  if (c.__bk2d === 'bezier') return c.poles.length - 1;
  return null;
}

export function getCurve2dBSplineData(curve: Curve2dHandle): {
  poles: [number, number][];
  knots: number[];
  multiplicities: number[];
  degree: number;
  isPeriodic: boolean;
} | null {
  const c = c2dBasis(curve);
  if (c.__bk2d === 'bspline')
    return {
      poles: [...c.poles],
      knots: [...c.knots],
      multiplicities: [...c.multiplicities],
      degree: c.degree,
      isPeriodic: c.isPeriodic,
    };
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// 2D serialization
// ═══════════════════════════════════════════════════════════════════════

export function serializeCurve2d(curve: Curve2dHandle): string {
  return bk2d.serializeCurve2d(c2d(curve));
}

export function deserializeCurve2d(data: string): Curve2dHandle {
  return bk2d.deserializeCurve2d(data);
}

// ═══════════════════════════════════════════════════════════════════════
// 2D curve splitting
// ═══════════════════════════════════════════════════════════════════════

export function splitCurve2d(curve: Curve2dHandle, params: number[]): Curve2dHandle[] {
  const c = c2d(curve);
  const bounds = bk2d.curveBounds(c);
  const sortedParams = [bounds.first, ...[...params].sort((a, b) => a - b), bounds.last];
  const result: Curve2dHandle[] = [];
  for (let i = 0; i < sortedParams.length - 1; i++) {
    result.push({
      __bk2d: 'trimmed',
      basis: c,
      tStart: sortedParams[i],
      tEnd: sortedParams[i + 1],
    });
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// 2D -> 3D projection (requires brepkit kernel)
// ═══════════════════════════════════════════════════════════════════════

export function liftCurve2dToPlane(
  bk: BrepkitKernel,
  curve: Curve2dHandle,
  origin: [number, number, number],
  planeZ: [number, number, number],
  planeX: [number, number, number]
): KernelShape {
  const c = c2d(curve);
  // Build Y axis from Z cross X
  const y: [number, number, number] = [
    planeZ[1] * planeX[2] - planeZ[2] * planeX[1],
    planeZ[2] * planeX[0] - planeZ[0] * planeX[2],
    planeZ[0] * planeX[1] - planeZ[1] * planeX[0],
  ];

  // Helper to lift a 2D point onto the plane
  const lift = (u: number, v: number): [number, number, number] => [
    origin[0] + u * planeX[0] + v * y[0],
    origin[1] + u * planeX[1] + v * y[1],
    origin[2] + u * planeX[2] + v * y[2],
  ];

  // Lines: exact 3D line edge (no NURBS interpolation needed)
  if (c.__bk2d === 'line') {
    const p1 = lift(c.ox, c.oy);
    const p2 = lift(c.ox + c.dx * c.len, c.oy + c.dy * c.len);
    return makeLineEdge(bk, p1, p2);
  }

  // Circles/arcs: use exact Circle3D edges via makeCircleArc3d when the
  // basis is a circle. This produces EdgeCurve::Circle edges that extrude
  // into CylindricalSurface faces (not NURBS), matching OCCT topology.
  if (c.__bk2d === 'circle' || c.__bk2d === 'trimmed') {
    // Unwrap trimmed to find the circle basis.
    // bk2d curve objects have dynamic structure — suppress type-safety here.
    /* eslint-disable @typescript-eslint/no-explicit-any -- bk2d curve internals */
    let basis: any = c;
    while (basis.__bk2d === 'trimmed') basis = basis.basis;

    // Only use exact circle edges if the basis is actually a circle
    if (basis.__bk2d === 'circle') {
      const circ = basis;
      const center3d = lift(circ.cx, circ.cy);
      // Axis direction: CCW circle -> planeZ, CW -> -planeZ
      const axis: [number, number, number] = circ.sense
        ? planeZ
        : [-planeZ[0], -planeZ[1], -planeZ[2]];

      const bounds = bk2d.curveBounds(c);
      let angularSpan: number;
      if (c.__bk2d === 'trimmed') {
        angularSpan = Math.abs((c as any).tEnd - (c as any).tStart);
      } else {
        angularSpan = 2 * Math.PI;
      }
      // Full/near-full circles -> 4 arcs; large arcs -> 2; small arcs -> 1
      const nSegments = angularSpan > Math.PI ? 4 : angularSpan > Math.PI / 2 ? 2 : 1;
      const segmentSpan = (bounds.last - bounds.first) / nSegments;
      const edgeIds: number[] = [];
      for (let seg = 0; seg < nSegments; seg++) {
        const [su, sv] = bk2d.evaluateCurve2d(c, bounds.first + seg * segmentSpan);
        const [eu, ev] = bk2d.evaluateCurve2d(c, bounds.first + (seg + 1) * segmentSpan);
        edgeIds.push(bk.makeCircleArc3d(...lift(su, sv), ...lift(eu, ev), ...center3d, ...axis));
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
      if (edgeIds.length === 1) return edgeHandle(edgeIds[0]!);
      return wireHandle(bk.makeWire(edgeIds, false));
    }

    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Non-circle basis (e.g. ellipse): fall through to generic sampling below
  }

  // For Bezier/BSpline: lift control points exactly (preserves NURBS structure)
  if (c.__bk2d === 'bezier' || c.__bk2d === 'bspline') {
    const points3d = c.poles.map(([u, v]) => lift(u, v));
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
    if (points3d.length === 2) return makeLineEdge(bk, points3d[0]!, points3d[1]!);
    const degree = Math.min(3, points3d.length - 1);
    const coords = points3d.flatMap(([px, py, pz]) => [px, py, pz]);
    const id = bk.interpolatePoints(coords, degree);
    return edgeHandle(id);
  }

  // For unknown curve types: sample densely and interpolate
  const bounds = bk2d.curveBounds(c);
  const nSamples = 100;
  const points: [number, number, number][] = [];
  for (let i = 0; i <= nSamples; i++) {
    const t = bounds.first + ((bounds.last - bounds.first) * i) / nSamples;
    const [u, v] = bk2d.evaluateCurve2d(c, t);
    points.push(lift(u, v));
  }
  return interpolatePoints(bk, points);
}

export function buildEdgeOnSurface(
  bk: BrepkitKernel,
  curve: Curve2dHandle,
  surface: KernelType
): KernelShape {
  // Sample the 2D curve, evaluate surface at those UV points, create 3D edge
  if (!isBrepkitHandle(surface))
    throw new Error('brepkit: buildEdgeOnSurface requires a face handle as surface');
  const fid = unwrap(surface, 'face');
  const c = c2d(curve);
  const bounds = bk2d.curveBounds(c);

  // For NURBS curves on planar surfaces, we can lift control points directly.
  // For general surfaces, use dense sampling (100 points for accuracy).
  const surfType = bk.getSurfaceType(fid);
  const N = surfType === 'plane' ? 50 : 100;
  const points: [number, number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = bounds.first + ((bounds.last - bounds.first) * i) / N;
    const [u, v] = bk2d.evaluateCurve2d(c, t);
    const p = bk.evaluateSurface(fid, u, v);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
    points.push([p[0]!, p[1]!, p[2]!]);
  }
  return interpolatePoints(bk, points);
}

export function extractSurfaceFromFace(face: KernelShape): KernelType {
  return face; /* brepkit face IS its surface */
}

export function extractCurve2dFromEdge(
  bk: BrepkitKernel,
  edge: KernelShape,
  face: KernelShape
): Curve2dHandle {
  const eid = unwrap(edge, 'edge');
  const fid = unwrap(face, 'face');

  const params = bk.getEdgeCurveParameters(eid);
  const tMin = params[0] ?? 0;
  const tMax = params[1] ?? 1;

  // Sample the 3D edge curve and project onto the face's UV space.
  // Uses uvFromPoint for proper projection on any surface type (not just planar).
  // Adaptive sampling: start coarse, refine where UV curvature is high.
  const BASE_N = 20;
  const MAX_N = 80;
  const REFINE_THRESHOLD = 0.05; // max UV chord deviation for refinement

  // Initial coarse sample
  const tValues: number[] = [];
  for (let i = 0; i <= BASE_N; i++) {
    tValues.push(tMin + ((tMax - tMin) * i) / BASE_N);
  }

  // Evaluate 3D points -> UV
  const evaluateUV = (t: number): [number, number] => {
    const pt = bk.evaluateEdgeCurve(eid, t);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
    const uv = bk.projectPointOnSurface(fid, pt[0]!, pt[1]!, pt[2]!);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
    return [uv[0]!, uv[1]!];
  };

  const uvSamples: Array<{ t: number; uv: [number, number] }> = tValues.map((t) => ({
    t,
    uv: evaluateUV(t),
  }));

  // Adaptive refinement: insert midpoints where the UV midpoint deviates
  // significantly from the linear interpolation of its neighbors.
  let refinements = 0;
  while (uvSamples.length < MAX_N) {
    const insertions: Array<{ index: number; t: number; uv: [number, number] }> = [];
    for (let i = 0; i < uvSamples.length - 1; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
      const a = uvSamples[i]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
      const b = uvSamples[i + 1]!;
      const tMid = (a.t + b.t) / 2;
      const uvMid = evaluateUV(tMid);
      // Linear interpolation of UV
      const interpU = (a.uv[0] + b.uv[0]) / 2;
      const interpV = (a.uv[1] + b.uv[1]) / 2;
      const deviation = Math.sqrt((uvMid[0] - interpU) ** 2 + (uvMid[1] - interpV) ** 2);
      if (deviation > REFINE_THRESHOLD) {
        insertions.push({ index: i + 1, t: tMid, uv: uvMid });
      }
    }
    if (insertions.length === 0) break;
    // Insert in reverse order to preserve indices; cap at MAX_N total samples
    let budget = MAX_N - uvSamples.length;
    for (let j = insertions.length - 1; j >= 0 && budget > 0; j--) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
      const ins = insertions[j]!;
      uvSamples.splice(ins.index, 0, { t: ins.t, uv: ins.uv });
      budget--;
    }
    refinements++;
    if (refinements > 3) break; // cap refinement passes
  }

  const uvPoints: [number, number][] = uvSamples.map((s) => s.uv);

  if (uvPoints.length >= 2) {
    return makeBSpline2d(uvPoints);
  }

  // Fallback: use edge vertices projected to UV
  const verts = bk.getEdgeVertices(eid);
  if (verts.length >= 6) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
    const uv1 = bk.projectPointOnSurface(fid, verts[0]!, verts[1]!, verts[2]!);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
    const uv2 = bk.projectPointOnSurface(fid, verts[3]!, verts[4]!, verts[5]!);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
    return bk2d.makeLine2d(uv1[0]!, uv1[1]!, uv2[0]!, uv2[1]!);
  }
  throw new Error(`brepkit: extractCurve2dFromEdge: degenerate edge (${verts.length} coords)`);
}

export function buildCurves3d(_wire: KernelShape): void {
  /* No-op: brepkit doesn't separate 2D/3D curve storage */
}

export function fixWireOnFace(
  wire: KernelShape,
  _face: KernelShape,
  _tolerance: number
): KernelShape {
  return wire;
}

export function fillSurface(
  bk: BrepkitKernel,
  wires: KernelShape[],
  _options?: Record<string, unknown>
): KernelShape {
  if (wires.length >= 1) {
    // Try Coons patch for 4-sided boundaries
    const wireEdges = iterShapes(bk, wires[0], 'edge');
    if (wireEdges.length === 4) {
      // Collect boundary curves as polylines (sample each edge)
      const allCoords: number[] = [];
      const curveLengths: number[] = [];
      for (const edge of wireEdges) {
        const edgeId = unwrap(edge, 'edge');
        const params = bk.getEdgeCurveParameters(edgeId);
        /* eslint-disable @typescript-eslint/no-non-null-assertion -- WASM index */
        const tMin = params[0]!,
          tMax = params[1]!;
        /* eslint-enable @typescript-eslint/no-non-null-assertion */
        const N = 10;
        const pts: number[] = [];
        for (let i = 0; i <= N; i++) {
          const t = tMin + ((tMax - tMin) * i) / N;
          const p = bk.evaluateEdgeCurve(edgeId, t);
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
          pts.push(p[0]!, p[1]!, p[2]!);
        }
        allCoords.push(...pts);
        curveLengths.push(N + 1);
      }
      try {
        const faceId: number = bk.fillCoonsPatch(allCoords, curveLengths);
        return faceHandle(faceId);
      } catch (e: unknown) {
        console.warn('brepkit: Coons patch failed, falling back:', e);
      }
    }
  }
  const outerWire = wires[0];
  if (!outerWire) throw new Error('fillSurface: no wires provided');
  return makeNonPlanarFace(bk, outerWire);
}
