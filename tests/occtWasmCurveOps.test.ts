/**
 * NURBS curve edit/construct + Bézier pole read on the occt-wasm adapter.
 *
 * These bindings landed in occt-wasm 3.4.0 (andymai/occt-wasm#172); before that
 * the adapter stubbed them as notImplemented. The suite pins occt-wasm
 * explicitly (not TEST_KERNEL) so it always exercises the new bindings.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { getKernel } from '@/kernel/index.js';
import type { KernelAdapter, KernelShape, NurbsCurveData } from '@/kernel/types.js';

let kernel: KernelAdapter;

beforeAll(async () => {
  await initKernel('occt-wasm');
  kernel = getKernel('occt-wasm');
}, 30000);

function nurbsEdge(): KernelShape {
  return kernel.interpolatePoints(
    [
      [0, 0, 0],
      [5, 5, 0],
      [10, 0, 0],
    ],
    { periodic: false }
  );
}

function nurbsData(edge: KernelShape): NurbsCurveData {
  const data = kernel.getNurbsCurveData?.(edge);
  if (!data) throw new Error('expected NURBS data for edge');
  return data;
}

describe('occt-wasm NURBS curve editing', () => {
  it('curveDegreeElevate raises the degree of a NURBS edge', () => {
    const edge = nurbsEdge();
    const before = nurbsData(edge);
    const elevated = kernel.curveDegreeElevate(edge, 1);
    expect(nurbsData(elevated).degree).toBe(before.degree + 1);
  });

  it('curveKnotInsert adds a knot and preserves the parameter range', () => {
    const edge = nurbsEdge();
    const before = nurbsData(edge);
    const [u0, u1] = kernel.curveParameters(edge);
    const inserted = kernel.curveKnotInsert(edge, (u0 + u1) / 2, 1);
    expect(nurbsData(inserted).knots.length).toBe(before.knots.length + 1);
    const [v0, v1] = kernel.curveParameters(inserted);
    expect(v1 - v0).toBeCloseTo(u1 - u0, 6);
  });

  it('curveKnotRemove undoes an inserted knot', () => {
    const edge = nurbsEdge();
    const baseKnots = nurbsData(edge).knots.length;
    const [u0, u1] = kernel.curveParameters(edge);
    const mid = (u0 + u1) / 2;
    const inserted = kernel.curveKnotInsert(edge, mid, 1);
    const removed = kernel.curveKnotRemove(inserted, mid, 1e-3);
    expect(nurbsData(removed).knots.length).toBe(baseKnots);
  });

  it('curveSplit divides a NURBS edge into two valid sub-edges', () => {
    const edge = nurbsEdge();
    const [u0, u1] = kernel.curveParameters(edge);
    const [a, b] = kernel.curveSplit(edge, (u0 + u1) / 2);
    expect(kernel.curveType(a)).toBe('BSPLINE_CURVE');
    expect(kernel.curveType(b)).toBe('BSPLINE_CURVE');
    // The two pieces meet at the split parameter.
    const [, a1] = kernel.curveParameters(a);
    const [b0] = kernel.curveParameters(b);
    expect(a1).toBeCloseTo(b0, 6);
  });

  it('curveSplit rejects an out-of-range parameter', () => {
    const edge = nurbsEdge();
    const [, u1] = kernel.curveParameters(edge);
    expect(() => kernel.curveSplit(edge, u1 + 10)).toThrow();
  });
});

describe('occt-wasm Bézier pole read', () => {
  const bezierPoints: [number, number, number][] = [
    [0, 0, 0],
    [5, 5, 0],
    [10, 0, 0],
  ];

  it('getNurbsCurveData reads a Bézier edge via Bézier→BSpline conversion', () => {
    const edge = kernel.makeBezierEdge(bezierPoints);
    expect(kernel.curveType(edge)).toBe('BEZIER_CURVE');
    const data = nurbsData(edge);
    expect(data.degree).toBe(2);
    expect(data.poles.length).toBe(3);
  });

  it('getBezierPenultimatePole returns the second-to-last control pole', () => {
    const edge = kernel.makeBezierEdge(bezierPoints);
    const pole = kernel.getBezierPenultimatePole(edge);
    if (!pole) throw new Error('expected a penultimate pole');
    expect(pole[0]).toBeCloseTo(5, 6);
    expect(pole[1]).toBeCloseTo(5, 6);
    expect(pole[2]).toBeCloseTo(0, 6);
  });

  it('getBezierPenultimatePole returns null for a straight line edge', () => {
    const line = kernel.makeLineEdge([0, 0, 0], [10, 0, 0]);
    expect(kernel.getBezierPenultimatePole(line)).toBeNull();
  });
});
