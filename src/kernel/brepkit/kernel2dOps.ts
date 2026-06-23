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
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
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
import { vec3At, wasmIndex } from '@/utils/vec3.js';

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
  // The basis evaluates angle = sense ? t : -t, so the trimmed parameter runs
  // in angle space (CCW) or negated-angle space (CW). Normalise the range so
  // the linear interpolation tStart..tEnd sweeps the intended direction — the
  // analog of makeCircleArc2d's wrap. Without it, an arc whose end precedes
  // its start collapses onto the complementary (wrong-side) arc.
  const ccw = sense !== false;
  const tStart = ccw ? start : -start;
  let tEnd = ccw ? end : -end;
  if (tEnd < tStart - 1e-9) tEnd += 2 * Math.PI;
  return { __bk2d: 'trimmed', basis: ellipse, tStart, tEnd } as Curve2dObj;
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

export function reverseCurve2d(curve: Curve2dHandle): void {
  // bk2d curves are plain mutable data (copyCurve2d deep-clones via JSON), so
  // reverse the parameterization in place: evaluateCurve2d must then traverse
  // end -> start. Each variant flips however its own parameter maps to the
  // sweep direction.
  const c = curve as Curve2dObj;
  switch (c.__bk2d) {
    case 'line': {
      // Origin moves to the far end; direction flips, length is unchanged.
      const m = c as { ox: number; oy: number; dx: number; dy: number; len: number };
      m.ox += m.dx * m.len;
      m.oy += m.dy * m.len;
      m.dx = -m.dx;
      m.dy = -m.dy;
      break;
    }
    case 'circle':
    case 'ellipse': {
      // A full conic reversed is the opposite sense.
      const m = c as { sense: boolean };
      m.sense = !m.sense;
      break;
    }
    case 'trimmed': {
      // Swap the trim bounds so the linear sweep runs the other way (same
      // geometric arc, opposite traversal).
      const m = c as { tStart: number; tEnd: number };
      [m.tStart, m.tEnd] = [m.tEnd, m.tStart];
      break;
    }
    case 'bezier': {
      const m = c as { poles: [number, number][] };
      m.poles = [...m.poles].reverse();
      break;
    }
    case 'bspline': {
      const m = c as { poles: [number, number][]; knots: number[]; weights?: number[] };
      m.poles = [...m.poles].reverse();
      const lo = m.knots[0];
      const hi = m.knots[m.knots.length - 1];
      if (lo !== undefined && hi !== undefined) {
        m.knots = m.knots.map((k) => lo + hi - k).reverse();
      }
      if (Array.isArray(m.weights)) m.weights = [...m.weights].reverse();
      break;
    }
    default:
      break;
  }
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
    // Mirror across axis through (ox ?? cx, oy ?? cy) with direction (dx, dy)
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / len,
      ny = dy / len;
    // Reflection matrix: R = 2*n*nT - I
    const m = [2 * nx * nx - 1, 2 * nx * ny, 0, 2 * nx * ny, 2 * ny * ny - 1, 0, 0, 0, 1];
    const px = ox ?? cx,
      py = oy ?? cy;
    // Translation: p - R*p
    const txv = px - wasmIndex(m, 0) * px - wasmIndex(m, 1) * py;
    const tyv = py - wasmIndex(m, 3) * px - wasmIndex(m, 4) * py;
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
  // Apply full affine transform: sample curve, transform points, refit as Bezier
  const c = c2d(curve);
  const m = (gtrsf.m as number[] | undefined) ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const tx = Number(gtrsf.tx) || 0,
    ty = Number(gtrsf.ty) || 0;
  // If transform is just a translation, use fast path
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
    return bk2d.translateCurve2d(c, tx, ty);
  }
  // General: sample, transform, refit as Bezier polyline
  const bounds = bk2d.curveBounds(c);
  const N = 20;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = bounds.first + ((bounds.last - bounds.first) * i) / N;
    const [px, py] = bk2d.evaluateCurve2d(c, t);
    pts.push([m0 * px + m1 * py + tx, m3 * px + m4 * py + ty]);
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
      const p0 = wasmIndex(poles, i);
      const p1 = wasmIndex(poles, i + 1);
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
    const t0 = wasmIndex(breakpoints, i);
    const t1 = wasmIndex(breakpoints, i + 1);
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

  // Circles/arcs and ellipse arcs: use exact analytic 3D edges via
  // makeCircleArc3d / makeEllipseArc3d when the basis is a circle or ellipse.
  // These produce EdgeCurve::Circle / EdgeCurve::Ellipse edges that extrude
  // into exact CylindricalSurface / elliptical swept faces (not NURBS),
  // matching the reference kernel's topology.
  if (c.__bk2d === 'circle' || c.__bk2d === 'trimmed') {
    // Unwrap trimmed to find the analytic basis.
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
      if (edgeIds.length === 1) return edgeHandle(wasmIndex(edgeIds, 0));
      return wireHandle(bk.makeWire(edgeIds, false));
    }

    // Exact ellipse arcs: EdgeCurve::Ellipse edges via makeEllipseArc3d.
    // brepkit extrudes these over the trimmed arc into an exact elliptical
    // swept surface, so no dense-NURBS approximation is needed.
    if (basis.__bk2d === 'ellipse') {
      const ell = basis;
      const center3d = lift(ell.cx, ell.cy);
      // Major-axis reference direction, lifted as a pure direction (no origin).
      const cosA = Math.cos(ell.xDirAngle);
      const sinA = Math.sin(ell.xDirAngle);
      const refDir: [number, number, number] = [
        cosA * planeX[0] + sinA * y[0],
        cosA * planeX[1] + sinA * y[1],
        cosA * planeX[2] + sinA * y[2],
      ];

      const bounds = bk2d.curveBounds(c);
      const span = bounds.last - bounds.first;

      // brepkit reconstructs the arc by sweeping CCW around `axis` from start
      // to end (domain_with_endpoints), so the axis must encode the actual
      // sweep direction — which trimming can reverse relative to the basis
      // `sense`. An ellipse is star-shaped about its center, so the polar
      // angle around the center is monotonic in the parameter; one small
      // forward step from the start gives the direction unambiguously.
      const eps = span * 1e-4;
      const [p0u, p0v] = bk2d.evaluateCurve2d(c, bounds.first);
      const [p1u, p1v] = bk2d.evaluateCurve2d(c, bounds.first + eps);
      const cross = (p0u - ell.cx) * (p1v - ell.cy) - (p0v - ell.cy) * (p1u - ell.cx);
      // cross > 0 => start->next is CCW around +planeZ.
      const axis: [number, number, number] =
        cross >= 0 ? planeZ : [-planeZ[0], -planeZ[1], -planeZ[2]];

      // Keep each segment's eccentric-angle span < π so the trimmed-arc
      // reconstruction from its endpoints is unambiguous.
      const angularSpan =
        c.__bk2d === 'trimmed' ? Math.abs((c as any).tEnd - (c as any).tStart) : 2 * Math.PI;
      const nSegments = angularSpan > Math.PI ? 4 : angularSpan > Math.PI / 2 ? 2 : 1;
      const segmentSpan = span / nSegments;
      const edgeIds: number[] = [];
      for (let seg = 0; seg < nSegments; seg++) {
        const [su, sv] = bk2d.evaluateCurve2d(c, bounds.first + seg * segmentSpan);
        const [eu, ev] = bk2d.evaluateCurve2d(c, bounds.first + (seg + 1) * segmentSpan);
        edgeIds.push(
          bk.makeEllipseArc3d(
            ...lift(su, sv),
            ...lift(eu, ev),
            ...center3d,
            ...axis,
            ...refDir,
            ell.majorRadius,
            ell.minorRadius
          )
        );
      }
      if (edgeIds.length === 1) return edgeHandle(wasmIndex(edgeIds, 0));
      return wireHandle(bk.makeWire(edgeIds, false));
    }

    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Other analytic basis: fall through to generic sampling below
  }

  // For Bezier/BSpline: lift control points exactly (preserves NURBS structure)
  if (c.__bk2d === 'bezier' || c.__bk2d === 'bspline') {
    const points3d = c.poles.map(([u, v]) => lift(u, v));
    if (points3d.length === 2)
      return makeLineEdge(bk, wasmIndex(points3d, 0), wasmIndex(points3d, 1));
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
    points.push(vec3At(bk.evaluateSurface(fid, u, v)));
  }
  return interpolatePoints(bk, points);
}

export function extractSurfaceFromFace(face: KernelShape): KernelType {
  return face; /* brepkit face IS its surface */
}

type UVSample = { t: number; uv: [number, number] };

/**
 * Adaptively refine a UV sample list by inserting midpoints whenever the
 * sampled UV midpoint deviates from the linear interpolation of its
 * neighbors by more than `threshold`. Stops at `maxSamples` or when no
 * pair exceeds the threshold; cap of 3 refinement passes overall.
 */
function refineUVSamples(
  uvSamples: UVSample[],
  evaluateUV: (t: number) => [number, number],
  maxSamples: number,
  threshold: number
): void {
  let refinements = 0;
  while (uvSamples.length < maxSamples) {
    const insertions: Array<{ index: number; t: number; uv: [number, number] }> = [];
    for (let i = 0; i < uvSamples.length - 1; i++) {
      const a = wasmIndex(uvSamples, i);
      const b = wasmIndex(uvSamples, i + 1);
      const tMid = (a.t + b.t) / 2;
      const uvMid = evaluateUV(tMid);
      const interpU = (a.uv[0] + b.uv[0]) / 2;
      const interpV = (a.uv[1] + b.uv[1]) / 2;
      const deviation = Math.sqrt((uvMid[0] - interpU) ** 2 + (uvMid[1] - interpV) ** 2);
      if (deviation > threshold) {
        insertions.push({ index: i + 1, t: tMid, uv: uvMid });
      }
    }
    if (insertions.length === 0) break;
    let budget = maxSamples - uvSamples.length;
    for (let j = insertions.length - 1; j >= 0 && budget > 0; j--) {
      const ins = wasmIndex(insertions, j);
      uvSamples.splice(ins.index, 0, { t: ins.t, uv: ins.uv });
      budget--;
    }
    refinements++;
    if (refinements > 3) break;
  }
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
    const uv = bk.projectPointOnSurface(fid, wasmIndex(pt, 0), wasmIndex(pt, 1), wasmIndex(pt, 2));
    return [wasmIndex(uv, 0), wasmIndex(uv, 1)];
  };

  const uvSamples: UVSample[] = tValues.map((t) => ({ t, uv: evaluateUV(t) }));

  refineUVSamples(uvSamples, evaluateUV, MAX_N, REFINE_THRESHOLD);

  const uvPoints: [number, number][] = uvSamples.map((s) => s.uv);

  if (uvPoints.length >= 2) {
    return makeBSpline2d(uvPoints);
  }

  // Fallback: use edge vertices projected to UV
  const verts = bk.getEdgeVertices(eid);
  if (verts.length >= 6) {
    const uv1 = bk.projectPointOnSurface(
      fid,
      wasmIndex(verts, 0),
      wasmIndex(verts, 1),
      wasmIndex(verts, 2)
    );
    const uv2 = bk.projectPointOnSurface(
      fid,
      wasmIndex(verts, 3),
      wasmIndex(verts, 4),
      wasmIndex(verts, 5)
    );
    return bk2d.makeLine2d(
      wasmIndex(uv1, 0),
      wasmIndex(uv1, 1),
      wasmIndex(uv2, 0),
      wasmIndex(uv2, 1)
    );
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
        const tMin = wasmIndex(params, 0);
        const tMax = wasmIndex(params, 1);
        const N = 10;
        const pts: number[] = [];
        for (let i = 0; i <= N; i++) {
          const t = tMin + ((tMax - tMin) * i) / N;
          const p = bk.evaluateEdgeCurve(edgeId, t);
          pts.push(wasmIndex(p, 0), wasmIndex(p, 1), wasmIndex(p, 2));
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

/** Co-located factory: returns the Kernel2D slice of {@link KernelAdapter} bound to `bk`. */
// brepjs-patterns-disable: max-function-lines
export function makeKernel2dOps(bk: BrepkitKernel) {
  return {
    createPoint2d: (x, y) => createPoint2d(x, y),
    createDirection2d: (x, y) => createDirection2d(x, y),
    createVector2d: (x, y) => createVector2d(x, y),
    createAxis2d: (px, py, dx, dy) => createAxis2d(px, py, dx, dy),
    wrapCurve2dHandle: (handle) => wrapCurve2dHandle(handle),
    createCurve2dAdaptor: (handle) => createCurve2dAdaptor(handle),
    makeLine2d: (x1, y1, x2, y2) => makeLine2d(x1, y1, x2, y2),
    makeCircle2d: (cx, cy, radius, sense) => makeCircle2d(cx, cy, radius, sense),
    makeArc2dThreePoints: (x1, y1, xm, ym, x2, y2) =>
      bk2d.makeArc2dThreePoints(x1, y1, xm, ym, x2, y2),
    makeArc2dTangent: (sx, sy, tx, ty, ex, ey) => bk2d.makeArc2dTangent(sx, sy, tx, ty, ex, ey),
    makeEllipse2d: (cx, cy, major, minor, xDirX, xDirY, sense) =>
      makeEllipse2d(cx, cy, major, minor, xDirX, xDirY, sense),
    makeEllipseArc2d: (cx, cy, major, minor, start, end, xDirX, xDirY, sense) =>
      makeEllipseArc2d(cx, cy, major, minor, start, end, xDirX, xDirY, sense),
    makeBezier2d: (points) => makeBezier2d(points),
    makeBSpline2d: (points, options) => makeBSpline2d(points, options),
    evaluateCurve2d: (curve, param) => evaluateCurve2d(curve, param),
    evaluateCurve2dD1: (curve, param) => evaluateCurve2dD1(curve, param),
    getCurve2dBounds: (curve) => getCurve2dBounds(curve),
    getCurve2dType: (curve) => getCurve2dType(curve),
    trimCurve2d: (curve, start, end) => trimCurve2d(curve, start, end),
    reverseCurve2d: (curve) => {
      reverseCurve2d(curve);
    },
    copyCurve2d: (curve) => copyCurve2d(curve),
    offsetCurve2d: (curve, off) => offsetCurve2d(curve, off),
    translateCurve2d: (curve, dx, dy) => translateCurve2d(curve, dx, dy),
    rotateCurve2d: (curve, angle, cx, cy) => rotateCurve2d(curve, angle, cx, cy),
    scaleCurve2d: (curve, factor, cx, cy) => scaleCurve2d(curve, factor, cx, cy),
    mirrorCurve2dAtPoint: (curve, cx, cy) => mirrorCurve2dAtPoint(curve, cx, cy),
    mirrorCurve2dAcrossAxis: (curve, ox, oy, dx, dy) =>
      mirrorCurve2dAcrossAxis(curve, ox, oy, dx, dy),
    affinityTransform2d: (curve, ox, oy, dx, dy, ratio) =>
      affinityTransform2d(curve, ox, oy, dx, dy, ratio),
    createIdentityGTrsf2d: () => createIdentityGTrsf2d(),
    createAffinityGTrsf2d: (ox, oy, dx, dy, ratio) => createAffinityGTrsf2d(ox, oy, dx, dy, ratio),
    createTranslationGTrsf2d: (dx, dy) => createTranslationGTrsf2d(dx, dy),
    createMirrorGTrsf2d: (cx, cy, mode, ox, oy, dx, dy) =>
      createMirrorGTrsf2d(cx, cy, mode, ox, oy, dx, dy),
    createRotationGTrsf2d: (angle, cx, cy) => createRotationGTrsf2d(angle, cx, cy),
    createScaleGTrsf2d: (factor, cx, cy) => createScaleGTrsf2d(factor, cx, cy),
    setGTrsf2dTranslationPart: (gtrsf, dx, dy) => {
      setGTrsf2dTranslationPart(gtrsf, dx, dy);
    },
    multiplyGTrsf2d: (base, other) => {
      multiplyGTrsf2d(base, other);
    },
    transformCurve2dGeneral: (curve, gtrsf) => transformCurve2dGeneral(curve, gtrsf),
    intersectCurves2d: (c1, c2, tolerance) => intersectCurves2d(c1, c2, tolerance),
    projectPointOnCurve2d: (curve, x, y) => projectPointOnCurve2d(curve, x, y),
    distanceBetweenCurves2d: (c1, c2, p1s, p1e, p2s, p2e) =>
      distanceBetweenCurves2d(c1, c2, p1s, p1e, p2s, p2e),
    approximateCurve2dAsBSpline: (curve, tol, cont, maxSeg) =>
      approximateCurve2dAsBSpline(curve, tol, cont, maxSeg),
    decomposeBSpline2dToBeziers: (curve) => decomposeBSpline2dToBeziers(curve),
    createBoundingBox2d: () => createBoundingBox2d(),
    addCurveToBBox2d: (bbox, curve, tol) => {
      addCurveToBBox2d(bbox, curve, tol);
    },
    getBBox2dBounds: (bbox) => getBBox2dBounds(bbox),
    mergeBBox2d: (target, other) => {
      mergeBBox2d(target, other);
    },
    isBBox2dOut: (a, b) => isBBox2dOut(a, b),
    isBBox2dOutPoint: (bbox, x, y) => isBBox2dOutPoint(bbox, x, y),
    getCurve2dCircleData: (curve) => getCurve2dCircleData(curve),
    getCurve2dEllipseData: (curve) => getCurve2dEllipseData(curve),
    getCurve2dBezierPoles: (curve) => getCurve2dBezierPoles(curve),
    getCurve2dBezierDegree: (curve) => getCurve2dBezierDegree(curve),
    getCurve2dBSplineData: (curve) => getCurve2dBSplineData(curve),
    serializeCurve2d: (curve) => serializeCurve2d(curve),
    deserializeCurve2d: (data) => deserializeCurve2d(data),
    splitCurve2d: (curve, params) => splitCurve2d(curve, params),
    liftCurve2dToPlane: (curve, origin, planeZ, planeX) =>
      liftCurve2dToPlane(bk, curve, origin, planeZ, planeX),
    buildEdgeOnSurface: (curve, surface) => buildEdgeOnSurface(bk, curve, surface),
    extractSurfaceFromFace: (face) => extractSurfaceFromFace(face),
    extractCurve2dFromEdge: (edge, face) => extractCurve2dFromEdge(bk, edge, face),
    buildCurves3d: (wire) => {
      buildCurves3d(wire);
    },
    fixWireOnFace: (wire, face, tolerance) => fixWireOnFace(wire, face, tolerance),
    fillSurface: (wires, options) => fillSurface(bk, wires, options),
  } satisfies Pick<
    KernelAdapter,
    | 'createPoint2d'
    | 'createDirection2d'
    | 'createVector2d'
    | 'createAxis2d'
    | 'wrapCurve2dHandle'
    | 'createCurve2dAdaptor'
    | 'makeLine2d'
    | 'makeCircle2d'
    | 'makeArc2dThreePoints'
    | 'makeArc2dTangent'
    | 'makeEllipse2d'
    | 'makeEllipseArc2d'
    | 'makeBezier2d'
    | 'makeBSpline2d'
    | 'evaluateCurve2d'
    | 'evaluateCurve2dD1'
    | 'getCurve2dBounds'
    | 'getCurve2dType'
    | 'trimCurve2d'
    | 'reverseCurve2d'
    | 'copyCurve2d'
    | 'offsetCurve2d'
    | 'translateCurve2d'
    | 'rotateCurve2d'
    | 'scaleCurve2d'
    | 'mirrorCurve2dAtPoint'
    | 'mirrorCurve2dAcrossAxis'
    | 'affinityTransform2d'
    | 'createIdentityGTrsf2d'
    | 'createAffinityGTrsf2d'
    | 'createTranslationGTrsf2d'
    | 'createMirrorGTrsf2d'
    | 'createRotationGTrsf2d'
    | 'createScaleGTrsf2d'
    | 'setGTrsf2dTranslationPart'
    | 'multiplyGTrsf2d'
    | 'transformCurve2dGeneral'
    | 'intersectCurves2d'
    | 'projectPointOnCurve2d'
    | 'distanceBetweenCurves2d'
    | 'approximateCurve2dAsBSpline'
    | 'decomposeBSpline2dToBeziers'
    | 'createBoundingBox2d'
    | 'addCurveToBBox2d'
    | 'getBBox2dBounds'
    | 'mergeBBox2d'
    | 'isBBox2dOut'
    | 'isBBox2dOutPoint'
    | 'getCurve2dCircleData'
    | 'getCurve2dEllipseData'
    | 'getCurve2dBezierPoles'
    | 'getCurve2dBezierDegree'
    | 'getCurve2dBSplineData'
    | 'serializeCurve2d'
    | 'deserializeCurve2d'
    | 'splitCurve2d'
    | 'liftCurve2dToPlane'
    | 'buildEdgeOnSurface'
    | 'extractSurfaceFromFace'
    | 'extractCurve2dFromEdge'
    | 'buildCurves3d'
    | 'fixWireOnFace'
    | 'fillSurface'
  >;
}
