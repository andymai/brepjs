import { describe, expect, it } from 'vitest';
import {
  vecAdd,
  vecSub,
  vecScale,
  vecNegate,
  vecDot,
  vecCross,
  vecLength,
  vecLengthSq,
  vecDistance,
  vecNormalize,
  vecEquals,
  vecIsZero,
  vecAngle,
  vecProjectToPlane,
  vecRotate,
  vecRepr,
  vec2Add,
  vec2Sub,
  vec2Scale,
  vec2Length,
  vec2Distance,
  vec2Normalize,
  vec2Equals,
} from '../src/core/vecOps.js';
import type { Vec3, Vec2 as _Vec2 } from '../src/core/types.js';

// ---------------------------------------------------------------------------
// 3D Arithmetic
// ---------------------------------------------------------------------------

describe('vecAdd', () => {
  it('adds two vectors', () => {
    expect(vecAdd([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
  });

  it('handles zeros', () => {
    expect(vecAdd([0, 0, 0], [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('handles negative values', () => {
    expect(vecAdd([1, -2, 3], [-1, 2, -3])).toEqual([0, 0, 0]);
  });
});

describe('vecSub', () => {
  it('subtracts two vectors', () => {
    expect(vecSub([5, 7, 9], [4, 5, 6])).toEqual([1, 2, 3]);
  });

  it('subtracting self gives zero', () => {
    expect(vecSub([3, 4, 5], [3, 4, 5])).toEqual([0, 0, 0]);
  });
});

describe('vecScale', () => {
  it('scales by positive factor', () => {
    expect(vecScale([1, 2, 3], 2)).toEqual([2, 4, 6]);
  });

  it('scales by zero', () => {
    expect(vecScale([1, 2, 3], 0)).toEqual([0, 0, 0]);
  });

  it('scales by negative factor', () => {
    expect(vecScale([1, 2, 3], -1)).toEqual([-1, -2, -3]);
  });
});

describe('vecNegate', () => {
  it('negates a vector', () => {
    expect(vecNegate([1, -2, 3])).toEqual([-1, 2, -3]);
  });

  it('double negate returns original', () => {
    const v: Vec3 = [1, 2, 3];
    expect(vecNegate(vecNegate(v))).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

describe('vecDot', () => {
  it('computes dot product', () => {
    expect(vecDot([1, 2, 3], [4, 5, 6])).toBe(32);
  });

  it('orthogonal vectors have zero dot product', () => {
    expect(vecDot([1, 0, 0], [0, 1, 0])).toBe(0);
  });

  it('parallel vectors have positive dot product', () => {
    expect(vecDot([1, 0, 0], [2, 0, 0])).toBe(2);
  });
});

describe('vecCross', () => {
  it('X cross Y = Z', () => {
    expect(vecCross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
  });

  it('Y cross X = -Z', () => {
    expect(vecCross([0, 1, 0], [1, 0, 0])).toEqual([0, 0, -1]);
  });

  it('parallel vectors have zero cross product', () => {
    expect(vecCross([1, 0, 0], [2, 0, 0])).toEqual([0, 0, 0]);
  });

  it('Y cross Z = X', () => {
    expect(vecCross([0, 1, 0], [0, 0, 1])).toEqual([1, 0, 0]);
  });
});

// ---------------------------------------------------------------------------
// Length / Distance
// ---------------------------------------------------------------------------

describe('vecLength', () => {
  it('computes length of unit vectors', () => {
    expect(vecLength([1, 0, 0])).toBe(1);
  });

  it('computes length of 3-4-5 triangle', () => {
    expect(vecLength([3, 4, 0])).toBe(5);
  });

  it('zero vector has zero length', () => {
    expect(vecLength([0, 0, 0])).toBe(0);
  });
});

describe('vecLengthSq', () => {
  it('computes squared length', () => {
    expect(vecLengthSq([3, 4, 0])).toBe(25);
  });

  it('matches length squared', () => {
    const v: Vec3 = [1, 2, 3];
    expect(vecLengthSq(v)).toBeCloseTo(vecLength(v) ** 2);
  });
});

describe('vecDistance', () => {
  it('distance between same points is zero', () => {
    expect(vecDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it('distance along axis', () => {
    expect(vecDistance([0, 0, 0], [3, 4, 0])).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

describe('vecNormalize', () => {
  it('normalizes to unit length', () => {
    const n = vecNormalize([3, 4, 0]);
    expect(vecLength(n)).toBeCloseTo(1);
    expect(n[0]).toBeCloseTo(0.6);
    expect(n[1]).toBeCloseTo(0.8);
    expect(n[2]).toBeCloseTo(0);
  });

  it('normalizing zero vector returns zero', () => {
    expect(vecNormalize([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('unit vectors stay the same', () => {
    const n = vecNormalize([0, 0, 1]);
    expect(n).toEqual([0, 0, 1]);
  });
});

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

describe('vecEquals', () => {
  it('equal vectors return true', () => {
    expect(vecEquals([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it('different vectors return false', () => {
    expect(vecEquals([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it('respects tolerance', () => {
    expect(vecEquals([1, 2, 3], [1.0001, 2, 3], 0.001)).toBe(true);
    expect(vecEquals([1, 2, 3], [1.01, 2, 3], 0.001)).toBe(false);
  });
});

describe('vecIsZero', () => {
  it('zero vector is zero', () => {
    expect(vecIsZero([0, 0, 0])).toBe(true);
  });

  it('non-zero vector is not zero', () => {
    expect(vecIsZero([1, 0, 0])).toBe(false);
  });

  it('very small vector is zero within tolerance', () => {
    expect(vecIsZero([1e-12, 1e-12, 1e-12])).toBe(true);
  });

  it('small but significant vector is not zero', () => {
    expect(vecIsZero([1e-8, 0, 0])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

describe('vecAngle', () => {
  it('angle between same direction is 0', () => {
    expect(vecAngle([1, 0, 0], [1, 0, 0])).toBeCloseTo(0);
  });

  it('angle between orthogonal vectors is PI/2', () => {
    expect(vecAngle([1, 0, 0], [0, 1, 0])).toBeCloseTo(Math.PI / 2);
  });

  it('angle between opposite vectors is PI', () => {
    expect(vecAngle([1, 0, 0], [-1, 0, 0])).toBeCloseTo(Math.PI);
  });

  it('returns 0 for zero vectors', () => {
    expect(vecAngle([0, 0, 0], [1, 0, 0])).toBe(0);
  });
});

describe('vecProjectToPlane', () => {
  it('projects point onto XY plane', () => {
    const projected = vecProjectToPlane([3, 4, 5], [0, 0, 0], [0, 0, 1]);
    expect(projected[0]).toBeCloseTo(3);
    expect(projected[1]).toBeCloseTo(4);
    expect(projected[2]).toBeCloseTo(0);
  });

  it('point already on plane stays the same', () => {
    const projected = vecProjectToPlane([3, 4, 0], [0, 0, 0], [0, 0, 1]);
    expect(projected[0]).toBeCloseTo(3);
    expect(projected[1]).toBeCloseTo(4);
    expect(projected[2]).toBeCloseTo(0);
  });

  it('projects onto offset plane', () => {
    const projected = vecProjectToPlane([3, 4, 5], [0, 0, 2], [0, 0, 1]);
    expect(projected[0]).toBeCloseTo(3);
    expect(projected[1]).toBeCloseTo(4);
    expect(projected[2]).toBeCloseTo(2);
  });

  it('returns original when normal is zero', () => {
    const v: Vec3 = [3, 4, 5];
    expect(vecProjectToPlane(v, [0, 0, 0], [0, 0, 0])).toEqual(v);
  });
});

describe('vecRotate', () => {
  it('rotates X around Z by 90 degrees gives Y', () => {
    const result = vecRotate([1, 0, 0], [0, 0, 1], Math.PI / 2);
    expect(result[0]).toBeCloseTo(0);
    expect(result[1]).toBeCloseTo(1);
    expect(result[2]).toBeCloseTo(0);
  });

  it('rotates by 0 degrees gives same vector', () => {
    const result = vecRotate([1, 2, 3], [0, 0, 1], 0);
    expect(result[0]).toBeCloseTo(1);
    expect(result[1]).toBeCloseTo(2);
    expect(result[2]).toBeCloseTo(3);
  });

  it('rotates by 360 degrees gives same vector', () => {
    const result = vecRotate([1, 2, 3], [0, 0, 1], 2 * Math.PI);
    expect(result[0]).toBeCloseTo(1);
    expect(result[1]).toBeCloseTo(2);
    expect(result[2]).toBeCloseTo(3);
  });

  it('rotates Y around X by 90 degrees gives Z', () => {
    const result = vecRotate([0, 1, 0], [1, 0, 0], Math.PI / 2);
    expect(result[0]).toBeCloseTo(0);
    expect(result[1]).toBeCloseTo(0);
    expect(result[2]).toBeCloseTo(1);
  });
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

describe('vecRepr', () => {
  it('formats a vector', () => {
    expect(vecRepr([1, 2, 3])).toBe('x: 1, y: 2, z: 3');
  });

  it('rounds to 3 decimal places', () => {
    expect(vecRepr([1.23456, 0, 0])).toBe('x: 1.235, y: 0, z: 0');
  });
});

// ---------------------------------------------------------------------------
// 2D Operations
// ---------------------------------------------------------------------------

describe('vec2Add', () => {
  it('adds two 2D vectors', () => {
    expect(vec2Add([1, 2], [3, 4])).toEqual([4, 6]);
  });
});

describe('vec2Sub', () => {
  it('subtracts two 2D vectors', () => {
    expect(vec2Sub([5, 7], [3, 4])).toEqual([2, 3]);
  });
});

describe('vec2Scale', () => {
  it('scales a 2D vector', () => {
    expect(vec2Scale([3, 4], 2)).toEqual([6, 8]);
  });
});

describe('vec2Length', () => {
  it('computes 2D length', () => {
    expect(vec2Length([3, 4])).toBe(5);
  });

  it('zero vector has zero length', () => {
    expect(vec2Length([0, 0])).toBe(0);
  });
});

describe('vec2Distance', () => {
  it('computes 2D distance', () => {
    expect(vec2Distance([0, 0], [3, 4])).toBe(5);
  });
});

describe('vec2Normalize', () => {
  it('normalizes to unit length', () => {
    const n = vec2Normalize([3, 4]);
    expect(vec2Length(n)).toBeCloseTo(1);
    expect(n[0]).toBeCloseTo(0.6);
    expect(n[1]).toBeCloseTo(0.8);
  });

  it('zero vector returns zero', () => {
    expect(vec2Normalize([0, 0])).toEqual([0, 0]);
  });
});

describe('vec2Equals', () => {
  it('equal vectors return true', () => {
    expect(vec2Equals([1, 2], [1, 2])).toBe(true);
  });

  it('different vectors return false', () => {
    expect(vec2Equals([1, 2], [1, 3])).toBe(false);
  });

  it('respects tolerance', () => {
    expect(vec2Equals([1, 2], [1.0001, 2], 0.001)).toBe(true);
    expect(vec2Equals([1, 2], [1.01, 2], 0.001)).toBe(false);
  });
});
