import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';
import { getKernel } from '@/kernel/index.js';
import {
  line,
  circle,
  wire,
  sketchRectangle,
  unwrap,
  castShape,
  getCurveType,
  curveStartPoint,
  curveEndPoint,
  curvePointAt,
  curveTangentAt,
  curveAxis,
  curveLength,
  curveIsClosed,
  curveIsPeriodic,
  curvePeriod,
  getOrientation,
  flipOrientation,
  offsetWire2D,
  isOk,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('getCurveType', () => {
  it('returns LINE for a line edge', () => {
    const edge = line([0, 0, 0], [10, 0, 0]);
    expect(getCurveType(castShape(edge.wrapped))).toBe('LINE');
  });

  it('returns CIRCLE for a circle edge', () => {
    const edge = circle(5);
    expect(getCurveType(castShape(edge.wrapped))).toBe('CIRCLE');
  });
});

describe('curveAxis', () => {
  it('returns center + plane normal for a circle edge', () => {
    const edge = circle(5);
    const axis = curveAxis(castShape(edge.wrapped));
    expect(axis).not.toBeNull();
    if (!axis) return;
    expect(axis.origin[0]).toBeCloseTo(0, 6);
    expect(axis.origin[1]).toBeCloseTo(0, 6);
    expect(axis.origin[2]).toBeCloseTo(0, 6);
    // Unit normal of the XY plane.
    expect(Math.abs(axis.direction[2])).toBeCloseTo(1, 6);
    expect(Math.hypot(...axis.direction)).toBeCloseTo(1, 6);
  });

  it('returns null for a non-circular (line) edge', () => {
    const edge = line([0, 0, 0], [10, 0, 0]);
    expect(curveAxis(castShape(edge.wrapped))).toBeNull();
  });

  it('resolves the same axis from a partial arc as from the full circle', (ctx) => {
    skipIfDiverges(ctx, 'curveFns.circleArcType');
    // A 90-degree arc samples three points spanning a quarter turn, a much
    // thinner triangle than a full circle; the circumcenter must still land on
    // the true center. Arc: radius 4, center (2, 3, 5), in a plane normal to Z.
    const arcShape = getKernel().makeCircleArc([2, 3, 5], [0, 0, 1], 4, 0, Math.PI / 2);
    const axis = curveAxis(castShape(arcShape));
    expect(axis).not.toBeNull();
    if (!axis) return;
    expect(axis.origin[0]).toBeCloseTo(2, 5);
    expect(axis.origin[1]).toBeCloseTo(3, 5);
    expect(axis.origin[2]).toBeCloseTo(5, 5);
    expect(Math.abs(axis.direction[2])).toBeCloseTo(1, 5);
  });
});

describe('curveStartPoint / curveEndPoint', () => {
  it('returns correct start and end for a line', () => {
    const edge = line([0, 0, 0], [10, 0, 0]);
    const fn = castShape(edge.wrapped);
    const start = curveStartPoint(fn);
    const end = curveEndPoint(fn);
    expect(start[0]).toBeCloseTo(0);
    expect(end[0]).toBeCloseTo(10);
  });
});

describe('curvePointAt', () => {
  it('returns midpoint at t=0.5', () => {
    const edge = line([0, 0, 0], [10, 0, 0]);
    const pt = curvePointAt(castShape(edge.wrapped), 0.5);
    expect(pt[0]).toBeCloseTo(5);
    expect(pt[1]).toBeCloseTo(0);
    expect(pt[2]).toBeCloseTo(0);
  });
});

describe('curveTangentAt', () => {
  it('returns tangent vector', () => {
    const edge = line([0, 0, 0], [10, 0, 0]);
    const t = curveTangentAt(castShape(edge.wrapped), 0.5);
    expect(t).toBeDefined();
    // Tangent of an X-axis line should be [1,0,0] (or [-1,0,0])
    expect(Math.abs(t[0])).toBeCloseTo(1, 1);
  });
});

describe('curveLength', () => {
  it('returns correct length for a line', () => {
    const edge = line([0, 0, 0], [10, 0, 0]);
    expect(curveLength(castShape(edge.wrapped))).toBeCloseTo(10, 2);
  });

  it('returns correct length for a wire', () => {
    const e1 = line([0, 0, 0], [10, 0, 0]);
    const e2 = line([10, 0, 0], [10, 10, 0]);
    const w = unwrap(wire([e1, e2]));
    expect(curveLength(castShape(w.wrapped))).toBeCloseTo(20, 2);
  });
});

describe('curveIsClosed / isPeriodic / period', () => {
  it('line is not closed', () => {
    const edge = line([0, 0, 0], [10, 0, 0]);
    expect(curveIsClosed(castShape(edge.wrapped))).toBe(false);
  });

  it('circle is closed and periodic', () => {
    const c = circle(5);
    const fn = castShape(c.wrapped);
    expect(curveIsClosed(fn)).toBe(true);
    expect(curveIsPeriodic(fn)).toBe(true);
    expect(curvePeriod(fn)).toBeGreaterThan(0);
  });
});

describe('getOrientation / flipOrientation', () => {
  it('returns forward or backward', () => {
    const edge = line([0, 0, 0], [10, 0, 0]);
    const o = getOrientation(castShape(edge.wrapped));
    expect(['forward', 'backward']).toContain(o);
  });

  it('flipOrientation returns a new edge', () => {
    const edge = line([0, 0, 0], [10, 0, 0]);
    const flipped = flipOrientation(castShape(edge.wrapped));
    expect(flipped).toBeDefined();
  });
});

describe('offsetWire2D', () => {
  it('offsets a planar wire', () => {
    const w = sketchRectangle(10, 10).wire;
    const result = offsetWire2D(castShape(w.wrapped), 1);
    expect(isOk(result)).toBe(true);
  });
});
