/**
 * Parity spec: transforms — translate, rotate, scale, mirror.
 *
 * Tests assert mathematical truth, not OCCT-observed behavior. Transforms
 * have crisp closed-form invariants that any correct kernel must satisfy:
 *
 *   vol(translate(s, v)) === vol(s)            — translation preserves volume
 *   com(translate(s, v)) === com(s) + v        — translation shifts centroid
 *   vol(rotate(s, θ)) === vol(s)               — rotation preserves volume
 *   vol(scale(s, λ)) === λ³ · vol(s)          — uniform scale cubes volume
 *   vol(mirror(s, p)) === vol(s)               — mirror preserves volume
 *   mirror(mirror(s, p), p) === s              — mirror is an involution
 *   rotate(rotate(s, θ), -θ) === s             — rotate has inverse
 *
 * API notes for spec-readers reimplementing brepjs:
 *  - `rotate` takes the angle in **degrees**, not radians.
 *  - The public API uses **options-object** form, not positional Vec3 args:
 *      rotate(s, angle, { at?: Vec3, axis?: Vec3 })
 *      mirror(s, { normal?: Vec3, at?: Vec3 })
 *      scale(s, factor, { center?: Vec3 })
 *    A reimplementation must preserve this signature shape (or change the
 *    callers); the lower-level positional functions in `transformFns.ts`
 *    exist but aren't the public surface.
 *
 * See `tests/parity/README.md` for the policy.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { initKernel } from '../setup.js';
import { NUM_RUNS, fcDim, fcOffset, vecLen, vecSub } from './helpers.js';
import {
  box,
  cylinder,
  sphere,
  translate,
  rotate,
  scale,
  mirror,
  measureVolume,
  measureVolumeProps,
  unwrap,
} from '@/index.js';
import type { Vec3 } from '@/core/types.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function volOf(shape: Parameters<typeof measureVolume>[0]): number {
  return unwrap(measureVolume(shape));
}

function comOf(shape: Parameters<typeof measureVolumeProps>[0]): Vec3 {
  return unwrap(measureVolumeProps(shape)).centerOfMass;
}

// ---------------------------------------------------------------------------
// SPEC — translate
// ---------------------------------------------------------------------------

describe('SPEC: translate preserves volume', () => {
  it.each<[string, () => Parameters<typeof translate>[0], Vec3]>([
    ['box', () => box(2, 3, 4), [10, 0, 0]],
    ['box big offset', () => box(5, 5, 5), [100, -50, 25]],
    ['cylinder', () => cylinder(3, 7), [1, 2, 3]],
    ['sphere', () => sphere(4), [-10, -10, -10]],
  ])('vol(translate(%s, v)) === vol(s)', (_label, make, v) => {
    const s = make();
    const t = translate(s, v);
    expect(volOf(t)).toBeCloseTo(volOf(s), 6);
  });
});

describe('SPEC: translate shifts center of mass by exact delta', () => {
  it.each<[Vec3, Vec3]>([
    [
      [10, 0, 0],
      [10, 0, 0],
    ],
    [
      [0, 5, 0],
      [0, 5, 0],
    ],
    [
      [0, 0, -3],
      [0, 0, -3],
    ],
    [
      [1.5, -2.5, 7],
      [1.5, -2.5, 7],
    ],
  ])('com(translate(box, %j)) === com(s) + %j', (v, expectedShift) => {
    const s = box(2, 3, 4);
    const c0 = comOf(s);
    const c1 = comOf(translate(s, v));
    expect(c1[0]).toBeCloseTo(c0[0] + expectedShift[0], 4);
    expect(c1[1]).toBeCloseTo(c0[1] + expectedShift[1], 4);
    expect(c1[2]).toBeCloseTo(c0[2] + expectedShift[2], 4);
  });
});

// ---------------------------------------------------------------------------
// SPEC — rotate (angle is in DEGREES)
// ---------------------------------------------------------------------------

describe('SPEC: rotate preserves volume', () => {
  it.each<[string, number, Vec3, Vec3]>([
    ['z-axis 30°', 30, [0, 0, 0], [0, 0, 1]],
    ['z-axis 90°', 90, [0, 0, 0], [0, 0, 1]],
    ['z-axis 180°', 180, [0, 0, 0], [0, 0, 1]],
    ['x-axis 45°', 45, [0, 0, 0], [1, 0, 0]],
    ['y-axis 60°', 60, [0, 0, 0], [0, 1, 0]],
    ['off-origin axis 90°', 90, [5, 5, 5], [0, 0, 1]],
  ])('vol(rotate(box, %s)) === vol(box)', (_label, angle, at, axis) => {
    const s = box(2, 3, 4);
    const r = rotate(s, angle, { at, axis });
    expect(volOf(r)).toBeCloseTo(volOf(s), 6);
  });
});

describe('SPEC: rotate by 0 is identity (volume + com)', () => {
  it('rotate(s, 0) preserves volume and com', () => {
    const s = box(2, 3, 4);
    const r = rotate(s, 0);
    expect(volOf(r)).toBeCloseTo(volOf(s), 6);
    const c0 = comOf(s);
    const c1 = comOf(r);
    expect(vecLen(vecSub(c0, c1))).toBeLessThan(1e-4);
  });
});

describe('SPEC: rotate by 360° returns to original (volume + com)', () => {
  it.each<[Vec3]>([[[0, 0, 1]], [[1, 0, 0]], [[0, 1, 0]]])(
    'rotate(box, 360°, axis=%j) ≈ box',
    (axis) => {
      const s = box(2, 3, 4);
      const r = rotate(s, 360, { at: [0, 0, 0], axis });
      expect(volOf(r)).toBeCloseTo(volOf(s), 4);
      const c0 = comOf(s);
      const c1 = comOf(r);
      expect(vecLen(vecSub(c0, c1))).toBeLessThan(1e-3);
    }
  );
});

// ---------------------------------------------------------------------------
// SPEC — scale (uniform)
// ---------------------------------------------------------------------------

describe('SPEC: uniform scale cubes the volume', () => {
  it.each<[string, () => Parameters<typeof scale>[0], number, number]>([
    ['box(2,3,4) ×2', () => box(2, 3, 4), 2, 24 * 8],
    ['box(2,3,4) ×0.5', () => box(2, 3, 4), 0.5, 24 * 0.125],
    ['cylinder(3,7) ×3', () => cylinder(3, 7), 3, Math.PI * 9 * 7 * 27],
    ['sphere(2) ×4', () => sphere(2), 4, (4 / 3) * Math.PI * 8 * 64],
  ])('vol(scale(%s)) === λ³ · vol(s)', (_label, make, lambda, expected) => {
    const s = make();
    const scaled = scale(s, lambda);
    expect(volOf(scaled)).toBeCloseTo(expected, 0);
  });
});

describe('SPEC: scale by 1 is identity (volume + com)', () => {
  it('scale(s, 1) preserves volume and com', () => {
    const s = box(2, 3, 4);
    const r = scale(s, 1);
    expect(volOf(r)).toBeCloseTo(volOf(s), 6);
    const c0 = comOf(s);
    const c1 = comOf(r);
    expect(vecLen(vecSub(c0, c1))).toBeLessThan(1e-4);
  });
});

describe('SPEC: scale around centroid keeps centroid fixed', () => {
  it('com(scale(s, λ, center=s.com)) === s.com', () => {
    const s = box(2, 3, 4);
    const c0 = comOf(s);
    const r = scale(s, 2.5, { center: c0 });
    const c1 = comOf(r);
    expect(vecLen(vecSub(c0, c1))).toBeLessThan(1e-4);
  });
});

// ---------------------------------------------------------------------------
// SPEC — mirror
// ---------------------------------------------------------------------------

describe('SPEC: mirror preserves volume', () => {
  it.each<[string, Vec3, Vec3]>([
    ['XY plane (normal=Z)', [0, 0, 1], [0, 0, 0]],
    ['YZ plane (normal=X)', [1, 0, 0], [0, 0, 0]],
    ['XZ plane (normal=Y)', [0, 1, 0], [0, 0, 0]],
    ['off-origin XY', [0, 0, 1], [5, 5, 5]],
  ])('vol(mirror(box, plane=%s)) === vol(box)', (_label, normal, at) => {
    const s = box(2, 3, 4);
    const m = mirror(s, { normal, at });
    expect(volOf(m)).toBeCloseTo(volOf(s), 6);
  });
});

describe('SPEC: mirror across origin plane negates COM component', () => {
  // box(2,3,4) at corner has com ≈ (1, 1.5, 2). Mirroring across each
  // axis-aligned plane through the origin should negate that component.
  it('mirror across XY plane (z=0) negates z of com', () => {
    const s = box(2, 3, 4);
    const c0 = comOf(s);
    const c1 = comOf(mirror(s, { normal: [0, 0, 1], at: [0, 0, 0] }));
    expect(c1[0]).toBeCloseTo(c0[0], 4);
    expect(c1[1]).toBeCloseTo(c0[1], 4);
    expect(c1[2]).toBeCloseTo(-c0[2], 4);
  });
  it('mirror across YZ plane (x=0) negates x of com', () => {
    const s = box(2, 3, 4);
    const c0 = comOf(s);
    const c1 = comOf(mirror(s, { normal: [1, 0, 0], at: [0, 0, 0] }));
    expect(c1[0]).toBeCloseTo(-c0[0], 4);
    expect(c1[1]).toBeCloseTo(c0[1], 4);
    expect(c1[2]).toBeCloseTo(c0[2], 4);
  });
});

// ---------------------------------------------------------------------------
// INVARIANT — translate
// ---------------------------------------------------------------------------

describe('INVARIANT: translate composes additively', () => {
  it('translate(translate(s, a), b) ≈ translate(s, a+b) by com', () => {
    fc.assert(
      fc.property(
        fcOffset(),
        fcOffset(),
        fcOffset(),
        fcOffset(),
        fcOffset(),
        fcOffset(),
        (ax, ay, az, bx, by, bz) => {
          const s = box(2, 3, 4);
          const sequential = translate(translate(s, [ax, ay, az]), [bx, by, bz]);
          const combined = translate(s, [ax + bx, ay + by, az + bz]);
          const c1 = comOf(sequential);
          const c2 = comOf(combined);
          expect(vecLen(vecSub(c1, c2))).toBeLessThan(1e-4);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: translate has additive inverse', () => {
  it('translate(translate(s, v), -v) ≈ s by com', () => {
    fc.assert(
      fc.property(fcOffset(), fcOffset(), fcOffset(), (x, y, z) => {
        const s = box(2, 3, 4);
        const c0 = comOf(s);
        const back = translate(translate(s, [x, y, z]), [-x, -y, -z]);
        const c1 = comOf(back);
        expect(vecLen(vecSub(c0, c1))).toBeLessThan(1e-4);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

// ---------------------------------------------------------------------------
// INVARIANT — rotate
// ---------------------------------------------------------------------------

describe('INVARIANT: rotate has additive inverse', () => {
  it('rotate(rotate(s, θ), -θ) ≈ s by com', () => {
    fc.assert(
      fc.property(fc.double({ min: -180, max: 180, noNaN: true }), (theta) => {
        const s = box(2, 3, 4);
        const c0 = comOf(s);
        const back = rotate(rotate(s, theta), -theta);
        const c1 = comOf(back);
        expect(vecLen(vecSub(c0, c1))).toBeLessThan(1e-3);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: rotate by 180° twice is identity (com)', () => {
  it('rotate(rotate(s, 180°), 180°) ≈ s', () => {
    const s = box(2, 3, 4);
    const c0 = comOf(s);
    const twice = rotate(rotate(s, 180), 180);
    const c1 = comOf(twice);
    expect(vecLen(vecSub(c0, c1))).toBeLessThan(1e-3);
  });
});

describe('INVARIANT: rotate around its own centroid preserves centroid', () => {
  it('com(rotate(s, any θ, center=s.com)) ≈ s.com', () => {
    fc.assert(
      fc.property(fc.double({ min: -180, max: 180, noNaN: true }), (theta) => {
        const s = box(2, 3, 4);
        const c0 = comOf(s);
        const r = rotate(s, theta, { at: c0, axis: [0, 0, 1] });
        const c1 = comOf(r);
        expect(vecLen(vecSub(c0, c1))).toBeLessThan(1e-3);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

// ---------------------------------------------------------------------------
// INVARIANT — scale
// ---------------------------------------------------------------------------

describe('INVARIANT: uniform scale cubes the volume', () => {
  it('vol(scale(box, λ)) === λ³ · vol(box) for all dims', () => {
    fc.assert(
      fc.property(
        fcDim(),
        fcDim(),
        fcDim(),
        fc.double({ min: 0.25, max: 4, noNaN: true }),
        (w, d, h, lambda) => {
          const s = box(w, d, h);
          const base = volOf(s);
          const scaled = volOf(scale(s, lambda));
          const expected = base * lambda ** 3;
          const relErr = Math.abs(scaled - expected) / Math.max(Math.abs(expected), 1e-9);
          expect(relErr).toBeLessThan(1e-6);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: scale composes multiplicatively', () => {
  it('vol(scale(scale(s, λ1), λ2)) === vol(scale(s, λ1·λ2))', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 3, noNaN: true }),
        fc.double({ min: 0.5, max: 3, noNaN: true }),
        (l1, l2) => {
          const s = box(2, 3, 4);
          const sequential = volOf(scale(scale(s, l1), l2));
          const combined = volOf(scale(s, l1 * l2));
          const relErr = Math.abs(sequential - combined) / Math.max(Math.abs(combined), 1e-9);
          expect(relErr).toBeLessThan(1e-6);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});

// ---------------------------------------------------------------------------
// INVARIANT — mirror
// ---------------------------------------------------------------------------

describe('INVARIANT: mirror is an involution (applying twice = identity)', () => {
  it('mirror(mirror(s, plane), plane) ≈ s by volume + com', () => {
    fc.assert(
      fc.property(
        fc.tuple(fcOffset(), fcOffset(), fcOffset()),
        fc.tuple(fcOffset(), fcOffset(), fcOffset()),
        (at, normalRaw) => {
          // Need a non-zero normal; skip the rare zero sample.
          fc.pre(vecLen(normalRaw) > 1e-3);
          const s = box(2, 3, 4);
          const v0 = volOf(s);
          const c0 = comOf(s);
          const plane = { normal: normalRaw, at };
          const twice = mirror(mirror(s, plane), plane);
          expect(volOf(twice)).toBeCloseTo(v0, 4);
          const c1 = comOf(twice);
          expect(vecLen(vecSub(c0, c1))).toBeLessThan(1e-3);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
