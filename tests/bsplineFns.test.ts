import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  interpolateCurve,
  approximateCurve,
  curveStartPoint,
  curveEndPoint,
  curveLength,
  curveIsClosed,
  curvePointAt,
  curveTangentAt,
  isOk,
  isErr,
  unwrap,
  type Vec3,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const samplePoints: Vec3[] = [
  [0, 0, 0],
  [5, 5, 0],
  [10, 0, 0],
  [15, -5, 0],
  [20, 0, 0],
];

describe('approximateCurve', () => {
  it('creates an edge from points', () => {
    const result = approximateCurve(samplePoints);
    expect(isOk(result)).toBe(true);
    const edge = unwrap(result);
    const len = curveLength(edge);
    expect(len).toBeGreaterThan(15);
  });

  it('start and end match first/last points (approximately)', () => {
    const result = approximateCurve(samplePoints);
    const edge = unwrap(result);
    const start = curveStartPoint(edge);
    const end = curveEndPoint(edge);
    expect(start[0]).toBeCloseTo(0, 0);
    expect(start[1]).toBeCloseTo(0, 0);
    expect(end[0]).toBeCloseTo(20, 0);
    expect(end[1]).toBeCloseTo(0, 0);
  });

  it('returns error for fewer than 2 points', () => {
    const result = approximateCurve([[0, 0, 0]]);
    expect(isErr(result)).toBe(true);
  });

  it('accepts custom options', () => {
    const result = approximateCurve(samplePoints, {
      tolerance: 1e-2,
      degMax: 4,
    });
    expect(isOk(result)).toBe(true);
  });

  it('accepts smoothing weights', () => {
    const result = approximateCurve(samplePoints, {
      smoothing: [1, 1, 1],
    });
    expect(isOk(result)).toBe(true);
    const edge = unwrap(result);
    expect(curveLength(edge)).toBeGreaterThan(15);
  });
});

describe('interpolateCurve', () => {
  it('creates an edge from points', () => {
    const result = interpolateCurve(samplePoints);
    expect(isOk(result)).toBe(true);
    const edge = unwrap(result);
    const len = curveLength(edge);
    expect(len).toBeGreaterThan(15);
  });

  it('passes through the given points exactly', () => {
    const result = interpolateCurve(samplePoints);
    const edge = unwrap(result);
    const start = curveStartPoint(edge);
    const end = curveEndPoint(edge);
    // Interpolation should hit first and last points exactly
    expect(start[0]).toBeCloseTo(0, 3);
    expect(start[1]).toBeCloseTo(0, 3);
    expect(end[0]).toBeCloseTo(20, 3);
    expect(end[1]).toBeCloseTo(0, 3);
  });

  it('returns error for fewer than 2 points', () => {
    const result = interpolateCurve([[0, 0, 0]]);
    expect(isErr(result)).toBe(true);
  });

  it('creates a curve with periodic option', () => {
    const closedPoints: Vec3[] = [
      [10, 0, 0],
      [0, 10, 0],
      [-10, 0, 0],
      [0, -10, 0],
    ];
    const result = interpolateCurve(closedPoints, { periodic: true });
    expect(isOk(result)).toBe(true);
    expect(curveLength(unwrap(result))).toBeGreaterThan(0);
  });

  // The closed cubic OCCT's periodic GeomAPI_Interpolate builds: chord-length
  // parameters, C2 at every point but the first, where it closes C1. Points at
  // fractions of the parameter range, read off occt-wasm.
  it('closes a periodic curve back on its first point, smoothly', () => {
    const pts: Vec3[] = [
      [0, 0, 0],
      [20, -5, 0],
      [30, 10, 0],
      [15, 25, 0],
      [-5, 15, 0],
    ];
    using c = unwrap(interpolateCurve(pts, { periodic: true }));
    expectPoint(curveStartPoint(c), [0, 0, 0]);
    expectPoint(curveEndPoint(c), [0, 0, 0]);
    expect(curveIsClosed(c)).toBe(true);
    const start = curveTangentAt(c, 0);
    const end = curveTangentAt(c, 1);
    for (const k of [0, 1, 2]) expect(end[k]).toBeCloseTo(start[k] ?? NaN, 6);
    const expected: Array<[number, Vec3]> = [
      [0.1, [9.463965590029137, -6.899276545384871, 0]],
      [0.25, [23.41630010011421, -2.6107066657746323, 0]],
      [0.5, [25.553873148024046, 19.51754794319828, 0]],
      [0.75, [0.4362218786906773, 21.228094074771555, 0]],
      [0.9, [-5.38902754967702, 10.076158089803327, 0]],
    ];
    for (const [at, point] of expected) expectPoint(curvePointAt(c, at), point);
    expect(curveLength(c)).toBeCloseTo(104.92854186347782, 3);
  });
});

function expectPoint(actual: readonly number[], expected: readonly number[]): void {
  for (const [i, value] of expected.entries()) expect(actual[i]).toBeCloseTo(value, 6);
}
