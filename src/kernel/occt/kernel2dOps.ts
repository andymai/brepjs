/**
 * 2D geometry operations for OCCT.
 *
 * Pure-2D methods delegate to the shared geometry2d module (no WASM crossing).
 * Bridge methods (2D->3D) construct 3D edges directly using OCCT's 3D APIs,
 * avoiding GeomLib.To3d and toNativeCurve2d entirely.
 *
 * Used by DefaultAdapter to implement Kernel2DCapability.
 */

import type { KernelInstance, KernelShape, KernelType } from '@/kernel/types.js';
import type { Curve2dHandle, BBox2dHandle } from '@/kernel/kernel2dTypes.js';
import type { Curve2dObj, BBox2d } from '../geometry2d.js';
import * as g2d from '../geometry2d.js';
import { iterShapes } from './topologyOps.js';
import { wasmIndex } from '@/utils/vec3.js';

// ---------------------------------------------------------------------------
// Local helpers (no imports from brepkit)
// ---------------------------------------------------------------------------

const noop = () => {};

/** Cast opaque Curve2dHandle to internal Curve2dObj. */
function c2d(handle: Curve2dHandle): Curve2dObj {
  return handle as Curve2dObj;
}

/** Unwrap trimmed curve wrappers to get the basis geometry. */
function c2dBasis(handle: Curve2dHandle): Curve2dObj {
  let c = c2d(handle);
  while (c.__bk2d === 'trimmed') c = c.basis;
  return c;
}

/** Cast opaque BBox2dHandle to internal BBox2d. */
function bb2d(handle: BBox2dHandle): BBox2d {
  return handle as BBox2d;
}

// ═══════════════════════════════════════════════════════════════════════
// Primitive 2D geometry constructors
// ═══════════════════════════════════════════════════════════════════════

export function createPoint2d(x: number, y: number): KernelType {
  return { x, y };
}

export function createDirection2d(x: number, y: number): KernelType {
  const l = Math.sqrt(x * x + y * y);
  if (l < 1e-15) throw new Error('occt: createDirection2d called with zero-length vector');
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
  return g2d.makeLine2d(x1, y1, x2, y2);
}

export function makeCircle2d(
  cx: number,
  cy: number,
  radius: number,
  sense?: boolean
): Curve2dHandle {
  return g2d.makeCircle2d(cx, cy, radius, sense);
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
    return g2d.makeLine2d(x1, y1, x2, y2);
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

  const circle = g2d.makeCircle2d(cx, cy, radius, sense);
  if (!sense) {
    // CW circle evaluates angle = -t, so parameter t = -angle.
    const tStart = -a1;
    let tEnd = -a2;
    if (tEnd < tStart - 1e-9) tEnd += 2 * Math.PI;
    return { __bk2d: 'trimmed', basis: circle, tStart, tEnd } as Curve2dObj;
  }
  // CCW: ensure tEnd >= tStart
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
  const len = Math.sqrt(tx * tx + ty * ty);
  const ntx = len > 0 ? tx / len : 0;
  const nty = len > 0 ? ty / len : 0;

  const dx = sx - ex;
  const dy = sy - ey;
  const denom = 2 * (dy * ntx - dx * nty);

  if (Math.abs(denom) < 1e-12) {
    return g2d.makeLine2d(sx, sy, ex, ey);
  }

  const chord2 = dx * dx + dy * dy;
  const t = -chord2 / denom;
  const cx = sx - t * nty;
  const cy = sy + t * ntx;
  const radius = Math.abs(t);

  const a1 = Math.atan2(sy - cy, sx - cx);
  const a2 = Math.atan2(ey - cy, ex - cx);

  const ccwTanX = -(sy - cy) / radius;
  const ccwTanY = (sx - cx) / radius;
  const dotCcw = ntx * ccwTanX + nty * ccwTanY;

  let aMid: number;
  if (dotCcw > 0) {
    let da = a2 - a1;
    if (da <= 0) da += 2 * Math.PI;
    aMid = a1 + da / 2;
  } else {
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
  return g2d.makeEllipse2d(cx, cy, major, minor, xDirX, xDirY, sense);
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
  const ellipse = g2d.makeEllipse2d(cx, cy, major, minor, xDirX, xDirY, sense);
  return { __bk2d: 'trimmed', basis: ellipse, tStart: start, tEnd: end } as Curve2dObj;
}

export function makeBezier2d(points: [number, number][]): Curve2dHandle {
  return g2d.makeBezier2d(points);
}

export function makeBSpline2d(
  points: [number, number][],
  _options?: Record<string, unknown>
): Curve2dHandle {
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
  return g2d.evaluateCurve2d(c2d(curve), param);
}

export function evaluateCurve2dD1(
  curve: Curve2dHandle,
  param: number
): { point: [number, number]; tangent: [number, number] } {
  return {
    point: g2d.evaluateCurve2d(c2d(curve), param),
    tangent: g2d.tangentCurve2d(c2d(curve), param),
  };
}

export function getCurve2dBounds(curve: Curve2dHandle): { first: number; last: number } {
  return g2d.curveBounds(c2d(curve));
}

export function getCurve2dType(curve: Curve2dHandle): string {
  return g2d.curveTypeName(c2dBasis(curve));
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
  const c = c2d(curve);
  const bounds = g2d.curveBounds(c);
  const N = 30;
  const poles: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = bounds.first + ((bounds.last - bounds.first) * i) / N;
    const [px, py] = g2d.evaluateCurve2d(c, t);
    const [tvx, tvy] = g2d.tangentCurve2d(c, t);
    const tLen = Math.sqrt(tvx * tvx + tvy * tvy);
    if (tLen > 1e-12) {
      poles.push([px - (tvy / tLen) * offset, py + (tvx / tLen) * offset]);
    } else {
      poles.push([px, py]);
    }
  }
  return makeBSpline2d(poles);
}

export function translateCurve2d(curve: Curve2dHandle, dx: number, dy: number): Curve2dHandle {
  return g2d.translateCurve2d(c2d(curve), dx, dy);
}

export function rotateCurve2d(
  curve: Curve2dHandle,
  angle: number,
  cx: number,
  cy: number
): Curve2dHandle {
  return g2d.rotateCurve2d(c2d(curve), angle, cx, cy);
}

export function scaleCurve2d(
  curve: Curve2dHandle,
  factor: number,
  cx: number,
  cy: number
): Curve2dHandle {
  return g2d.scaleCurve2d(c2d(curve), factor, cx, cy);
}

export function mirrorCurve2dAtPoint(curve: Curve2dHandle, cx: number, cy: number): Curve2dHandle {
  return g2d.mirrorAtPoint(c2d(curve), cx, cy);
}

export function mirrorCurve2dAcrossAxis(
  curve: Curve2dHandle,
  ox: number,
  oy: number,
  dx: number,
  dy: number
): Curve2dHandle {
  return g2d.mirrorAcrossAxis(c2d(curve), ox, oy, dx, dy);
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
    py = dx / len;
  const k = ratio - 1;
  const m = [1 + k * px * px, k * px * py, 0, k * py * px, 1 + k * py * py, 0, 0, 0, 1];
  const txv = ox - wasmIndex(m, 0) * ox - wasmIndex(m, 1) * oy;
  const tyv = oy - wasmIndex(m, 3) * ox - wasmIndex(m, 4) * oy;
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
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / len,
      ny = dy / len;
    const m = [2 * nx * nx - 1, 2 * nx * ny, 0, 2 * nx * ny, 2 * ny * ny - 1, 0, 0, 0, 1];
    const apx = ox ?? cx,
      apy = oy ?? cy;
    const txv = apx - wasmIndex(m, 0) * apx - wasmIndex(m, 1) * apy;
    const tyv = apy - wasmIndex(m, 3) * apx - wasmIndex(m, 4) * apy;
    return _gtrsf(m, txv, tyv);
  }
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
  const a = base.m as number[],
    b = other.m as number[];
  const ai = (i: number) => wasmIndex(a, i);
  const bi = (i: number) => wasmIndex(b, i);
  base.m = [
    ai(0) * bi(0) + ai(1) * bi(3) + ai(2) * bi(6),
    ai(0) * bi(1) + ai(1) * bi(4) + ai(2) * bi(7),
    ai(0) * bi(2) + ai(1) * bi(5) + ai(2) * bi(8),
    ai(3) * bi(0) + ai(4) * bi(3) + ai(5) * bi(6),
    ai(3) * bi(1) + ai(4) * bi(4) + ai(5) * bi(7),
    ai(3) * bi(2) + ai(4) * bi(5) + ai(5) * bi(8),
    ai(6) * bi(0) + ai(7) * bi(3) + ai(8) * bi(6),
    ai(6) * bi(1) + ai(7) * bi(4) + ai(8) * bi(7),
    ai(6) * bi(2) + ai(7) * bi(5) + ai(8) * bi(8),
  ];
  const oldTx = base.tx as number,
    oldTy = base.ty as number;
  const otx = Number(other.tx) || 0,
    oty = Number(other.ty) || 0;
  base.tx = ai(0) * otx + ai(1) * oty + oldTx;
  base.ty = ai(3) * otx + ai(4) * oty + oldTy;
}

export function transformCurve2dGeneral(curve: Curve2dHandle, gtrsf: KernelType): Curve2dHandle {
  const c = c2d(curve);
  const m = (gtrsf.m as number[] | undefined) ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const tx = Number(gtrsf.tx) || 0,
    ty = Number(gtrsf.ty) || 0;
  const m0 = wasmIndex(m, 0),
    m1 = wasmIndex(m, 1),
    m3 = wasmIndex(m, 3),
    m4 = wasmIndex(m, 4);
  const isIdentityMatrix =
    Math.abs(m0 - 1) < 1e-12 &&
    Math.abs(m4 - 1) < 1e-12 &&
    Math.abs(m1) < 1e-12 &&
    Math.abs(m3) < 1e-12;
  if (isIdentityMatrix) {
    return g2d.translateCurve2d(c, tx, ty);
  }
  const bounds = g2d.curveBounds(c);
  const N = 20;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = bounds.first + ((bounds.last - bounds.first) * i) / N;
    const [px, py] = g2d.evaluateCurve2d(c, t);
    pts.push([m0 * px + m1 * py + tx, m3 * px + m4 * py + ty]);
  }
  return g2d.makeBezier2d(pts);
}

// ═══════════════════════════════════════════════════════════════════════
// 2D intersection & distance
// ═══════════════════════════════════════════════════════════════════════

export function intersectCurves2d(
  c1: Curve2dHandle,
  c2: Curve2dHandle,
  tolerance: number
): { points: [number, number][]; segments: Curve2dHandle[] } {
  const result = g2d.intersectCurves2dFn(c2d(c1), c2d(c2), tolerance);
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
  const bounds = g2d.curveBounds(c);

  // Analytic projection for untrimmed lines
  if (c.__bk2d === 'line') {
    const ddx = x - c.ox;
    const ddy = y - c.oy;
    const t = Math.max(bounds.first, Math.min(bounds.last, ddx * c.dx + ddy * c.dy));
    const [px, py] = g2d.evaluateCurve2d(c, t);
    return { param: t, distance: Math.sqrt((px - x) ** 2 + (py - y) ** 2) };
  }

  // Analytic projection for untrimmed circles
  if (c.__bk2d === 'circle') {
    const angle = Math.atan2(y - c.cy, x - c.cx);
    let t = c.sense ? angle : -angle;
    while (t < 0) t += 2 * Math.PI;
    while (t > 2 * Math.PI) t -= 2 * Math.PI;
    const [px, py] = g2d.evaluateCurve2d(c, t);
    return { param: t, distance: Math.sqrt((px - x) ** 2 + (py - y) ** 2) };
  }

  // General: brute-force + Newton refinement
  if (!isFinite(bounds.first) || !isFinite(bounds.last)) return null;
  let bestT = bounds.first;
  let bestDist = Infinity;
  const N = 200;
  const dt = (bounds.last - bounds.first) / N;
  for (let i = 0; i <= N; i++) {
    const t = bounds.first + i * dt;
    const [px, py] = g2d.evaluateCurve2d(c, t);
    const dd = (px - x) ** 2 + (py - y) ** 2;
    if (dd < bestDist) {
      bestDist = dd;
      bestT = t;
    }
  }
  for (let iter = 0; iter < 10; iter++) {
    const [px, py] = g2d.evaluateCurve2d(c, bestT);
    const [tvx, tvy] = g2d.tangentCurve2d(c, bestT);
    const dot = (px - x) * tvx + (py - y) * tvy;
    const ddenom = tvx * tvx + tvy * tvy;
    if (ddenom < 1e-20) break;
    const step = dot / ddenom;
    const newT = Math.max(bounds.first, Math.min(bounds.last, bestT - step));
    if (Math.abs(newT - bestT) < 1e-14) break;
    bestT = newT;
  }
  const [fx, fy] = g2d.evaluateCurve2d(c, bestT);
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
    const [x1, y1] = g2d.evaluateCurve2d(curve1, t1);
    for (let j = 0; j <= N; j++) {
      const t2 = p2s + ((p2e - p2s) * j) / N;
      const [x2, y2] = g2d.evaluateCurve2d(curve2, t2);
      const dd = (x2 - x1) ** 2 + (y2 - y1) ** 2;
      if (dd < minDistSq) {
        minDistSq = dd;
        bestT1 = t1;
        bestT2 = t2;
      }
    }
  }

  // Phase 2: Alternating projection refinement
  let t1 = bestT1;
  let t2 = bestT2;
  for (let iter = 0; iter < 20; iter++) {
    const [x2, y2] = g2d.evaluateCurve2d(curve2, t2);
    const proj1 = projectPointOnCurve2d(c1, x2, y2);
    if (proj1) {
      const newT1 = Math.max(p1s, Math.min(p1e, proj1.param));
      const converged1 = Math.abs(newT1 - t1) < 1e-12;
      t1 = newT1;
      if (converged1) break;
    }

    const [x1, y1] = g2d.evaluateCurve2d(curve1, t1);
    const proj2 = projectPointOnCurve2d(c2, x1, y1);
    if (proj2) {
      const newT2 = Math.max(p2s, Math.min(p2e, proj2.param));
      const converged2 = Math.abs(newT2 - t2) < 1e-12;
      t2 = newT2;
      if (converged2) break;
    }
  }

  const [fx1, fy1] = g2d.evaluateCurve2d(curve1, t1);
  const [fx2, fy2] = g2d.evaluateCurve2d(curve2, t2);
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
  const c = c2d(curve);
  const bounds = g2d.curveBounds(c);

  const contDegMap: Record<string, number> = { C0: 1, C1: 2, C2: 3, C3: 4 };
  const degree = Math.max(3, contDegMap[cont] ?? 4);

  let curN = Math.max(100, maxSeg * 10);
  let poles: [number, number][] = [];
  let maxErr = Infinity;

  for (let attempt = 0; attempt < 3 && maxErr > tol; attempt++) {
    poles = [];
    for (let i = 0; i <= curN; i++) {
      const t = bounds.first + ((bounds.last - bounds.first) * i) / curN;
      poles.push(g2d.evaluateCurve2d(c, t));
    }

    maxErr = 0;
    for (let i = 0; i < curN; i++) {
      const tMid = bounds.first + ((bounds.last - bounds.first) * (i + 0.5)) / curN;
      const [ex, ey] = g2d.evaluateCurve2d(c, tMid);
      const p0 = wasmIndex(poles, i);
      const p1 = wasmIndex(poles, i + 1);
      const mx = (p0[0] + p1[0]) / 2;
      const my = (p0[1] + p1[1]) / 2;
      const err = Math.sqrt((ex - mx) ** 2 + (ey - my) ** 2);
      if (err > maxErr) maxErr = err;
    }

    if (maxErr > tol) curN = Math.min(curN * 2, 500);
  }

  return makeBSpline2d(poles, { degMax: degree });
}

export function decomposeBSpline2dToBeziers(curve: Curve2dHandle): Curve2dHandle[] {
  const c = c2dBasis(curve);
  if (c.__bk2d === 'bezier') return [curve];
  if (c.__bk2d !== 'bspline') {
    const approx = approximateCurve2dAsBSpline(curve, 1e-6, 'C2', 10);
    return decomposeBSpline2dToBeziers(approx);
  }
  const trimBounds = g2d.curveBounds(c2d(curve));
  const first = trimBounds.first;
  const last = trimBounds.last;
  const internalKnots: number[] = [];
  for (const k of c.knots) {
    if (k > first + 1e-12 && k < last - 1e-12) internalKnots.push(k);
  }
  const breakpoints = [first, ...internalKnots, last];
  const result: Curve2dHandle[] = [];
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const t0 = wasmIndex(breakpoints, i);
    const t1 = wasmIndex(breakpoints, i + 1);
    const span = t1 - t0;
    if (span < 1e-15) continue;
    const p0 = g2d.evaluateCurve2d(c, t0);
    const p3 = g2d.evaluateCurve2d(c, t1);
    const tan0 = g2d.tangentCurve2d(c, t0);
    const tan3 = g2d.tangentCurve2d(c, t1);
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
  return g2d.createBBox2d();
}

export function addCurveToBBox2d(bbox: BBox2dHandle, curve: Curve2dHandle, tol: number): void {
  g2d.addCurveToBBox(bb2d(bbox), c2d(curve), tol);
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
  return g2d.serializeCurve2d(c2d(curve));
}

export function deserializeCurve2d(data: string): Curve2dHandle {
  return g2d.deserializeCurve2d(data);
}

// ═══════════════════════════════════════════════════════════════════════
// 2D curve splitting
// ═══════════════════════════════════════════════════════════════════════

export function splitCurve2d(curve: Curve2dHandle, params: number[]): Curve2dHandle[] {
  const c = c2d(curve);
  const bounds = g2d.curveBounds(c);
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
// 3D edge helpers for bridge methods (private)
// ═══════════════════════════════════════════════════════════════════════

/** Create a straight 3D edge between two points. */
function makeLineEdge3d(
  oc: KernelInstance,
  p1: [number, number, number],
  p2: [number, number, number]
): KernelShape {
  const gp1 = new oc.gp_Pnt_3(p1[0], p1[1], p1[2]);
  const gp2 = new oc.gp_Pnt_3(p2[0], p2[1], p2[2]);
  const builder = new oc.BRepBuilderAPI_MakeEdge_3(gp1, gp2);
  const edge = builder.Edge();
  builder.delete();
  gp1.delete();
  gp2.delete();
  return edge;
}

/** Create a circular arc edge through 3 points. */
function makeCircleArcEdge3d(
  oc: KernelInstance,
  startPt: [number, number, number],
  midPt: [number, number, number],
  endPt: [number, number, number]
): KernelShape {
  const gpStart = new oc.gp_Pnt_3(startPt[0], startPt[1], startPt[2]);
  const gpMid = new oc.gp_Pnt_3(midPt[0], midPt[1], midPt[2]);
  const gpEnd = new oc.gp_Pnt_3(endPt[0], endPt[1], endPt[2]);
  const arcMaker = new oc.GC_MakeArcOfCircle_4(gpStart, gpMid, gpEnd);
  const arcGeom = arcMaker.Value().get();
  const curveHandle = new oc.Handle_Geom_Curve_2(arcGeom);
  const edgeBuilder = new oc.BRepBuilderAPI_MakeEdge_24(curveHandle);
  const edge = edgeBuilder.Edge();
  edgeBuilder.delete();
  curveHandle.delete();
  gpStart.delete();
  gpMid.delete();
  gpEnd.delete();
  return edge;
}

/** Interpolate a 3D BSpline through the given points and return an edge. */
function interpolatePoints3d(oc: KernelInstance, points: [number, number, number][]): KernelShape {
  const pnts = new oc.TColgp_Array1OfPnt_2(1, points.length);
  const reusePnt = new oc.gp_Pnt_1();
  for (let i = 0; i < points.length; i++) {
    const p = wasmIndex(points, i);
    reusePnt.SetCoord_2(p[0], p[1], p[2]);
    pnts.SetValue_1(i + 1, reusePnt);
  }
  reusePnt.delete();

  const interp = new oc.GeomAPI_PointsToBSpline_2(pnts, 3, 8, oc.GeomAbs_Shape.GeomAbs_C2, 1e-6);
  pnts.delete();

  if (!interp.IsDone()) {
    interp.delete();
    throw new Error('Interpolation failed — GeomAPI_PointsToBSpline did not converge');
  }

  const curve3d = interp.Curve();
  const geomHandle = new oc.Handle_Geom_Curve_2(curve3d.get());
  const builder = new oc.BRepBuilderAPI_MakeEdge_24(geomHandle);
  const edge = builder.Edge();
  builder.delete();
  interp.delete();
  return edge;
}

// ═══════════════════════════════════════════════════════════════════════
// 2D -> 3D projection (bridge methods — require OCCT kernel)
// ═══════════════════════════════════════════════════════════════════════

export function liftCurve2dToPlane(
  oc: KernelInstance,
  curve: Curve2dHandle,
  planeOrigin: [number, number, number],
  planeZ: [number, number, number],
  planeX: [number, number, number]
): KernelShape {
  const c = c2d(curve);
  // Y axis = Z cross X
  const y: [number, number, number] = [
    planeZ[1] * planeX[2] - planeZ[2] * planeX[1],
    planeZ[2] * planeX[0] - planeZ[0] * planeX[2],
    planeZ[0] * planeX[1] - planeZ[1] * planeX[0],
  ];

  const lift = (u: number, v: number): [number, number, number] => [
    planeOrigin[0] + u * planeX[0] + v * y[0],
    planeOrigin[1] + u * planeX[1] + v * y[1],
    planeOrigin[2] + u * planeX[2] + v * y[2],
  ];

  // Lines: exact 3D line edge
  if (c.__bk2d === 'line') {
    return makeLineEdge3d(oc, lift(c.ox, c.oy), lift(c.ox + c.dx * c.len, c.oy + c.dy * c.len));
  }

  // Circles/arcs: use exact Circle3D edges when the basis is a circle
  if (c.__bk2d === 'circle' || c.__bk2d === 'trimmed') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- geometry2d internal
    let basis: any = c;
    while (basis.__bk2d === 'trimmed') basis = basis.basis;

    if (basis.__bk2d === 'circle') {
      const circ = basis;
      const center3d = lift(circ.cx, circ.cy);
      const axisDir: [number, number, number] = circ.sense
        ? planeZ
        : [-planeZ[0], -planeZ[1], -planeZ[2]];

      // Full circle: create single OCCT circle edge
      if (c.__bk2d === 'circle') {
        const gpCenter = new oc.gp_Pnt_3(center3d[0], center3d[1], center3d[2]);
        const gpDir = new oc.gp_Dir_5(axisDir[0], axisDir[1], axisDir[2]);
        const gpAx2 = new oc.gp_Ax2_4(gpCenter, gpDir);
        const gpCirc = new oc.gp_Circ_2(gpAx2, circ.radius);
        const builder = new oc.BRepBuilderAPI_MakeEdge_8(gpCirc);
        const edge = builder.Edge();
        builder.delete();
        gpCirc.delete();
        gpAx2.delete();
        gpDir.delete();
        gpCenter.delete();
        return edge;
      }

      // Arc (trimmed circle): create arc edge via 3-point construction
      const bounds = g2d.curveBounds(c);
      const [su, sv] = g2d.evaluateCurve2d(c, bounds.first);
      const [mu, mv] = g2d.evaluateCurve2d(c, (bounds.first + bounds.last) / 2);
      const [eu, ev] = g2d.evaluateCurve2d(c, bounds.last);
      return makeCircleArcEdge3d(oc, lift(su, sv), lift(mu, mv), lift(eu, ev));
    }
    // Non-circle trimmed: fall through to generic sampling
  }

  // Bezier/BSpline: lift control points directly
  if (c.__bk2d === 'bezier' || c.__bk2d === 'bspline') {
    const pts3d = c.poles.map(([u, v]) => lift(u, v));
    if (pts3d.length === 2) return makeLineEdge3d(oc, wasmIndex(pts3d, 0), wasmIndex(pts3d, 1));
    return interpolatePoints3d(oc, pts3d);
  }

  // General: sample + lift + interpolate
  const bounds = g2d.curveBounds(c);
  const nSamples = 60;
  const pts3d: [number, number, number][] = [];
  for (let i = 0; i <= nSamples; i++) {
    const t = bounds.first + ((bounds.last - bounds.first) * i) / nSamples;
    const [u, v] = g2d.evaluateCurve2d(c, t);
    pts3d.push(lift(u, v));
  }
  return interpolatePoints3d(oc, pts3d);
}

export function buildEdgeOnSurface(
  oc: KernelInstance,
  curve: Curve2dHandle,
  surface: KernelType
): KernelShape {
  const c = c2d(curve);
  const bounds = g2d.curveBounds(c);
  const N = 60;
  const pts3d: [number, number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = bounds.first + ((bounds.last - bounds.first) * i) / N;
    const [u, v] = g2d.evaluateCurve2d(c, t);
    // Evaluate OCCT surface at (u,v) — surface is a Handle_Geom_Surface
    const gpPnt = surface.get().Value(u, v);
    pts3d.push([gpPnt.X(), gpPnt.Y(), gpPnt.Z()]);
    gpPnt.delete();
  }
  return interpolatePoints3d(oc, pts3d);
}

export function extractSurfaceFromFace(oc: KernelInstance, face: KernelShape): KernelType {
  return oc.BRep_Tool.Surface_2(face);
}

export function extractCurve2dFromEdge(
  oc: KernelInstance,
  edge: KernelShape,
  face: KernelShape
): Curve2dHandle {
  const adaptor = new oc.BRepAdaptor_Curve2d_2(edge, face);
  const first = Number(adaptor.FirstParameter());
  const last = Number(adaptor.LastParameter());
  const N = 30;
  const points: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = first + ((last - first) * i) / N;
    const pt = adaptor.Value(t);
    points.push([pt.X(), pt.Y()]);
    pt.delete();
  }
  adaptor.delete();
  return makeBSpline2d(points);
}

export function buildCurves3d(oc: KernelInstance, wire: KernelShape): void {
  oc.BRepLib.BuildCurves3d_2(wire);
}

export function fixWireOnFace(
  oc: KernelInstance,
  wire: KernelShape,
  face: KernelShape,
  tolerance: number
): KernelShape {
  const fixer = new oc.ShapeFix_Wire_2(wire, face, tolerance);
  fixer.FixEdgeCurves();
  const result = fixer.Wire();
  fixer.delete();
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// Surface filling (requires OCCT kernel)
// ═══════════════════════════════════════════════════════════════════════

export function fillSurface(
  oc: KernelInstance,
  wires: KernelShape[],
  options: {
    order?: number;
    nbPtsOnCur?: number;
    nbIter?: number;
    tol3d?: number;
    tol2d?: number;
    maxDeg?: number;
    maxSeg?: number;
  } = {}
): KernelShape {
  const {
    order = 3,
    nbPtsOnCur = 15,
    nbIter = 2,
    tol3d = 1e-5,
    tol2d = 1e-4,
    maxDeg = 8,
    maxSeg = 9,
  } = options;

  const builder = new oc.BRepOffsetAPI_MakeFilling(
    order,
    nbPtsOnCur,
    nbIter,
    false,
    tol3d,
    tol2d,
    1e-2,
    0.1,
    maxDeg,
    maxSeg
  );

  for (let wi = 0; wi < wires.length; wi++) {
    const edges = iterShapes(oc, wires[wi], 'edge');
    for (const edge of edges) {
      builder.Add_1(edge, oc.GeomAbs_Shape.GeomAbs_C0, wi === 0);
    }
  }

  const progress = new oc.Message_ProgressRange_1();
  builder.Build(progress);
  const shape = builder.Shape();
  builder.delete();
  progress.delete();
  return shape;
}
