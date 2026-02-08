import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  interpolateCurve,
  approximateCurve,
  curveStartPoint,
  curveEndPoint,
  curveLength,
  isOk,
  isErr,
  unwrap,
  type Vec3,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
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
});
