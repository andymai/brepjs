import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
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
  curveLength,
  curveIsClosed,
  curveIsPeriodic,
  curvePeriod,
  getOrientation,
  flipOrientation,
  offsetWire2D,
  isOk,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
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
