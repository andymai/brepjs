import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { convexHull, measureVolume, isSolid, isOk, isErr, unwrap } from '../src/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('convexHull', () => {
  it('returns error for fewer than 4 points', () => {
    const result = convexHull([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ]);
    expect(isErr(result)).toBe(true);
  });

  it('builds a tetrahedron from 4 points', () => {
    const result = convexHull([
      [0, 0, 0],
      [10, 0, 0],
      [0, 10, 0],
      [0, 0, 10],
    ]);
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(isSolid(solid)).toBe(true);
    // Tetrahedron volume = (1/6) * |a · (b × c)| = (1/6) * 1000 ≈ 166.67
    expect(unwrap(measureVolume(solid))).toBeCloseTo(1000 / 6, 0);
  });

  it('builds a box-shaped hull from 8 corner points', () => {
    const result = convexHull([
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
      [0, 10, 0],
      [0, 0, 10],
      [10, 0, 10],
      [10, 10, 10],
      [0, 10, 10],
    ]);
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(isSolid(solid)).toBe(true);
    expect(unwrap(measureVolume(solid))).toBeCloseTo(1000, 0);
  });
});
