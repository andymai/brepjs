import { describe, expect, it } from 'vitest';
import {
  samePoint,
  add2d,
  subtract2d,
  scalarMultiply2d,
  distance2d,
  squareDistance2d,
  crossProduct2d,
  dotProduct2d,
  angle2d,
  polarAngle2d,
  normalize2d,
  rotate2d,
  polarToCartesian,
  cartesianToPolar,
  determinant2x2,
} from '../src/2d/lib/vectorOperations.js';

const closeTo = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe('samePoint', () => {
  it('returns true for identical points', () => {
    expect(samePoint([1, 2], [1, 2])).toBe(true);
  });

  it('returns true within default precision', () => {
    expect(samePoint([1, 2], [1 + 1e-7, 2 - 1e-7])).toBe(true);
  });

  it('returns false for distant points', () => {
    expect(samePoint([0, 0], [1, 0])).toBe(false);
  });

  it('respects custom precision', () => {
    expect(samePoint([0, 0], [0.05, 0], 0.1)).toBe(true);
    expect(samePoint([0, 0], [0.2, 0], 0.1)).toBe(false);
  });
});

describe('add2d', () => {
  it('adds two points', () => {
    expect(add2d([1, 2], [3, 4])).toEqual([4, 6]);
  });

  it('handles negative values', () => {
    expect(add2d([1, -2], [-3, 4])).toEqual([-2, 2]);
  });
});

describe('subtract2d', () => {
  it('subtracts two points', () => {
    expect(subtract2d([5, 7], [2, 3])).toEqual([3, 4]);
  });
});

describe('scalarMultiply2d', () => {
  it('multiplies by scalar', () => {
    expect(scalarMultiply2d([3, 4], 2)).toEqual([6, 8]);
  });

  it('handles zero', () => {
    expect(scalarMultiply2d([3, 4], 0)).toEqual([0, 0]);
  });
});

describe('distance2d', () => {
  it('computes distance between two points', () => {
    expect(distance2d([0, 0], [3, 4])).toBe(5);
  });

  it('computes distance from origin by default', () => {
    expect(distance2d([3, 4])).toBe(5);
  });
});

describe('squareDistance2d', () => {
  it('computes squared distance', () => {
    expect(squareDistance2d([0, 0], [3, 4])).toBe(25);
  });
});

describe('crossProduct2d', () => {
  it('computes 2D cross product', () => {
    expect(crossProduct2d([1, 0], [0, 1])).toBe(1);
    expect(crossProduct2d([0, 1], [1, 0])).toBe(-1);
  });
});

describe('dotProduct2d', () => {
  it('computes 2D dot product', () => {
    expect(dotProduct2d([1, 0], [0, 1])).toBe(0);
    expect(dotProduct2d([2, 3], [4, 5])).toBe(23);
  });
});

describe('angle2d', () => {
  it('returns 0 for same direction', () => {
    expect(closeTo(angle2d([1, 0], [1, 0]), 0)).toBe(true);
  });

  it('returns pi/2 for perpendicular CCW', () => {
    expect(closeTo(angle2d([1, 0], [0, 1]), Math.PI / 2)).toBe(true);
  });
});

describe('polarAngle2d', () => {
  it('returns angle from first to second point', () => {
    expect(closeTo(polarAngle2d([0, 0], [1, 0]), 0)).toBe(true);
    expect(closeTo(polarAngle2d([0, 0], [0, 1]), Math.PI / 2)).toBe(true);
  });
});

describe('normalize2d', () => {
  it('normalizes a vector to unit length', () => {
    const [x, y] = normalize2d([3, 4]);
    expect(closeTo(x, 0.6)).toBe(true);
    expect(closeTo(y, 0.8)).toBe(true);
    expect(closeTo(Math.sqrt(x * x + y * y), 1)).toBe(true);
  });
});

describe('rotate2d', () => {
  it('rotates 90 degrees CCW around origin', () => {
    const [x, y] = rotate2d([1, 0], Math.PI / 2);
    expect(closeTo(x, 0)).toBe(true);
    expect(closeTo(y, 1)).toBe(true);
  });

  it('rotates around a custom center', () => {
    const [x, y] = rotate2d([2, 0], Math.PI / 2, [1, 0]);
    expect(closeTo(x, 1)).toBe(true);
    expect(closeTo(y, 1)).toBe(true);
  });

  it('full rotation returns to start', () => {
    const [x, y] = rotate2d([3, 7], Math.PI * 2);
    expect(closeTo(x, 3)).toBe(true);
    expect(closeTo(y, 7)).toBe(true);
  });
});

describe('polarToCartesian / cartesianToPolar', () => {
  it('round-trips correctly', () => {
    const original: [number, number] = [3, 4];
    const [r, theta] = cartesianToPolar(original);
    const [x, y] = polarToCartesian(r, theta);
    expect(closeTo(x, 3)).toBe(true);
    expect(closeTo(y, 4)).toBe(true);
  });

  it('polarToCartesian at 0 radians is along x-axis', () => {
    const [x, y] = polarToCartesian(5, 0);
    expect(closeTo(x, 5)).toBe(true);
    expect(closeTo(y, 0)).toBe(true);
  });

  it('polarToCartesian at pi/2 is along y-axis', () => {
    const [x, y] = polarToCartesian(5, Math.PI / 2);
    expect(closeTo(x, 0)).toBe(true);
    expect(closeTo(y, 5)).toBe(true);
  });
});

describe('determinant2x2', () => {
  it('computes determinant of identity', () => {
    expect(
      determinant2x2([
        [1, 0],
        [0, 1],
      ])
    ).toBe(1);
  });

  it('computes determinant of arbitrary matrix', () => {
    expect(
      determinant2x2([
        [2, 3],
        [4, 5],
      ])
    ).toBe(-2);
  });

  it('returns 0 for singular matrix', () => {
    expect(
      determinant2x2([
        [2, 4],
        [1, 2],
      ])
    ).toBe(0);
  });
});
