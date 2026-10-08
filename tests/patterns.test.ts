import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  fuseAll,
  rotate,
  linearPattern,
  circularPattern,
  isOk,
  isErr,
  unwrap,
  measureVolume,
  translate,
  getBounds,
} from '@/index.js';
import type { Bounds3D, Vec3 } from '@/index.js';
import { gridPattern } from '@/operations/patternFns.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('linearPattern', () => {
  it('creates a linear pattern of boxes', () => {
    const b = box(5, 5, 5);
    const result = linearPattern(b, [1, 0, 0], 3, 10);
    expect(isOk(result)).toBe(true);
    const pattern = unwrap(result);
    expect(pattern).toBeDefined();
    // 3 non-overlapping boxes (spacing=10 > box width=5)
    const vol = unwrap(measureVolume(pattern));
    expect(vol).toBeCloseTo(5 * 5 * 5 * 3, -1);
  });

  it('returns original shape when count is 1', () => {
    const b = box(5, 5, 5);
    const result = linearPattern(b, [1, 0, 0], 1, 10);
    expect(isOk(result)).toBe(true);
    const pattern = unwrap(result);
    const vol = unwrap(measureVolume(pattern));
    expect(vol).toBeCloseTo(5 * 5 * 5, -1);
  });

  it('returns error for count < 1', () => {
    const b = box(5, 5, 5);
    const result = linearPattern(b, [1, 0, 0], 0, 10);
    expect(isErr(result)).toBe(true);
  });

  it('returns error for zero direction', () => {
    const b = box(5, 5, 5);
    const result = linearPattern(b, [0, 0, 0], 3, 10);
    expect(isErr(result)).toBe(true);
  });
});

describe('circularPattern', () => {
  it('creates a circular pattern around Z axis', () => {
    // Create a box offset from the origin so copies don't overlap
    const b = translate(box(2, 2, 2), [10, 0, 0]);
    const result = circularPattern(b, [0, 0, 1], 4, 360);
    expect(isOk(result)).toBe(true);
    const pattern = unwrap(result);
    expect(pattern).toBeDefined();
    const vol = unwrap(measureVolume(pattern));
    expect(vol).toBeCloseTo(2 * 2 * 2 * 4, -1);
  });

  it('unions copies that overlap at the axis', () => {
    using bar0 = box(10, 2, 2);
    using bar = translate(bar0, [-1, -1, 0]);
    using pattern = unwrap(circularPattern(bar, [0, 0, 1], 6));
    const copies = [0, 1, 2, 3, 4, 5].map((i) => rotate(bar, i * 60, { axis: [0, 0, 1] }));
    try {
      using union = unwrap(fuseAll(copies));
      const expected = unwrap(measureVolume(union));
      expect(expected).toBeLessThan(6 * 10 * 2 * 2);
      expect(unwrap(measureVolume(pattern))).toBeCloseTo(expected, 2);
    } finally {
      for (const c of copies) c[Symbol.dispose]();
    }
  });

  it('creates a partial circular pattern', () => {
    const b = translate(box(2, 2, 2), [10, 0, 0]);
    const result = circularPattern(b, [0, 0, 1], 3, 180);
    expect(isOk(result)).toBe(true);
    const pattern = unwrap(result);
    expect(pattern).toBeDefined();
    const vol = unwrap(measureVolume(pattern));
    expect(vol).toBeCloseTo(2 * 2 * 2 * 3, -1);
  });

  // Volume is blind to where non-overlapping copies land, so placement is
  // checked against the bounds of the same copies rotated one by one.
  it.each([
    { count: 4, fullAngle: 360, axis: [0, 0, 1], center: [0, 0, 0] },
    { count: 3, fullAngle: 180, axis: [0, 0, 1], center: [0, 0, 0] },
    { count: 5, fullAngle: 90, axis: [0, 0, 1], center: [3, -2, 0] },
    { count: 3, fullAngle: 240, axis: [1, 1, 0], center: [0, 0, 4] },
  ] as { count: number; fullAngle: number; axis: Vec3; center: Vec3 }[])(
    'steps $count copies by $fullAngle / count degrees about $axis at $center',
    ({ count, fullAngle, axis, center }) => {
      using seed0 = box(2, 1, 1);
      using seed = translate(seed0, [10, 0.5, 0]);
      using pattern = unwrap(circularPattern(seed, axis, count, fullAngle, center));

      let expected: Bounds3D | undefined;
      for (let i = 0; i < count; i++) {
        using copy = rotate(seed, (i * fullAngle) / count, { axis, at: center });
        const b = getBounds(copy);
        expected = expected
          ? {
              xMin: Math.min(expected.xMin, b.xMin),
              xMax: Math.max(expected.xMax, b.xMax),
              yMin: Math.min(expected.yMin, b.yMin),
              yMax: Math.max(expected.yMax, b.yMax),
              zMin: Math.min(expected.zMin, b.zMin),
              zMax: Math.max(expected.zMax, b.zMax),
            }
          : b;
      }
      if (!expected) throw new Error('no copies');

      const actual = getBounds(pattern);
      for (const k of ['xMin', 'xMax', 'yMin', 'yMax', 'zMin', 'zMax'] as const) {
        expect(actual[k]).toBeCloseTo(expected[k], 3);
      }
    }
  );

  it('places two copies over a full turn opposite each other', () => {
    using seed0 = box(2, 2, 2);
    using seed = translate(seed0, [10, -1, 0]);
    using pattern = unwrap(circularPattern(seed, [0, 0, 1], 2));
    const b = getBounds(pattern);
    expect(b.xMin).toBeCloseTo(-12, 3);
    expect(b.xMax).toBeCloseTo(12, 3);
    expect(b.yMin).toBeCloseTo(-1, 3);
    expect(b.yMax).toBeCloseTo(1, 3);
  });

  it('returns error for count < 1', () => {
    const b = box(5, 5, 5);
    const result = circularPattern(b, [0, 0, 1], 0);
    expect(isErr(result)).toBe(true);
  });

  it('returns error for zero axis', () => {
    const b = box(5, 5, 5);
    const result = circularPattern(b, [0, 0, 0], 4);
    expect(isErr(result)).toBe(true);
  });

  it('returns original shape when count is 1', () => {
    const b = box(5, 5, 5);
    const result = circularPattern(b, [0, 0, 1], 1);
    expect(isOk(result)).toBe(true);
    const pattern = unwrap(result);
    const vol = unwrap(measureVolume(pattern));
    expect(vol).toBeCloseTo(5 * 5 * 5, -1);
  });
});

describe('gridPattern', () => {
  it('creates a 2x3 grid of boxes', () => {
    const b = box(2, 2, 2);
    const result = gridPattern(b, [1, 0, 0], [0, 1, 0], 2, 3, 5, 5);
    expect(isOk(result)).toBe(true);
    const pattern = unwrap(result);
    const vol = unwrap(measureVolume(pattern));
    // 6 non-overlapping boxes (spacing=5 > size=2)
    expect(vol).toBeCloseTo(2 * 2 * 2 * 6, -1);
  });

  it('returns original shape when both counts are 1', () => {
    const b = box(5, 5, 5);
    const result = gridPattern(b, [1, 0, 0], [0, 1, 0], 1, 1, 10, 10);
    expect(isOk(result)).toBe(true);
    const vol = unwrap(measureVolume(unwrap(result)));
    expect(vol).toBeCloseTo(5 * 5 * 5, -1);
  });

  it('returns error for countX < 1', () => {
    const b = box(5, 5, 5);
    const result = gridPattern(b, [1, 0, 0], [0, 1, 0], 0, 3, 10, 10);
    expect(isErr(result)).toBe(true);
  });

  it('returns error for countY < 1', () => {
    const b = box(5, 5, 5);
    const result = gridPattern(b, [1, 0, 0], [0, 1, 0], 3, 0, 10, 10);
    expect(isErr(result)).toBe(true);
  });

  it('returns error for zero directionX', () => {
    const b = box(5, 5, 5);
    const result = gridPattern(b, [0, 0, 0], [0, 1, 0], 2, 2, 10, 10);
    expect(isErr(result)).toBe(true);
  });

  it('returns error for zero directionY', () => {
    const b = box(5, 5, 5);
    const result = gridPattern(b, [1, 0, 0], [0, 0, 0], 2, 2, 10, 10);
    expect(isErr(result)).toBe(true);
  });

  it('creates a 1xN grid (single row)', () => {
    const b = box(2, 2, 2);
    const result = gridPattern(b, [1, 0, 0], [0, 1, 0], 1, 4, 5, 5);
    expect(isOk(result)).toBe(true);
    const vol = unwrap(measureVolume(unwrap(result)));
    expect(vol).toBeCloseTo(2 * 2 * 2 * 4, -1);
  });

  it('creates a Nx1 grid (single column)', () => {
    const b = box(2, 2, 2);
    const result = gridPattern(b, [1, 0, 0], [0, 1, 0], 3, 1, 5, 5);
    expect(isOk(result)).toBe(true);
    const vol = unwrap(measureVolume(unwrap(result)));
    expect(vol).toBeCloseTo(2 * 2 * 2 * 3, -1);
  });
});
