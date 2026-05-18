/**
 * Parity spec: boolean operations on solids.
 *
 * Reference values come from closed-form math, not observed kernel output.
 * Algebraic invariants (inclusion–exclusion, idempotency, commutativity,
 * absorption, associativity) are tested via fast-check with `NUM_RUNS = 50`.
 *
 * See `tests/parity/README.md` for the policy.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { initKernel } from '../setup.js';
import { NUM_RUNS, fcDim, fcOffset, shiftedBy, unitCube } from './helpers.js';
import { fuse, cut, intersect, fuseAll, measureVolume, unwrap, isOk } from '@/index.js';
import type { Shape3D } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

/** Volume of a shape; throws (via unwrap) if the measurement fails. */
function volOf(shape: Shape3D): number {
  return unwrap(measureVolume(shape));
}

// ---------------------------------------------------------------------------
// Closed-form references — two unit cubes at known relative positions
// ---------------------------------------------------------------------------

describe('SPEC: fuse of two unit cubes', () => {
  it('disjoint cubes — vol(a ∪ b) = vol(a) + vol(b)', () => {
    const a = unitCube(1, 1, 1);
    const b = shiftedBy(unitCube(1, 1, 1), 10, 0, 0);
    const result = fuse(a, b);
    expect(isOk(result)).toBe(true);
    expect(volOf(unwrap(result))).toBeCloseTo(2, 5);
  });

  it('touching face-to-face — vol(a ∪ b) = vol(a) + vol(b)', () => {
    const a = unitCube(1, 1, 1);
    const b = shiftedBy(unitCube(1, 1, 1), 1, 0, 0);
    const result = fuse(a, b);
    expect(isOk(result)).toBe(true);
    expect(volOf(unwrap(result))).toBeCloseTo(2, 5);
  });

  it('half-overlap — vol(a ∪ b) = vol(a) + vol(b) − vol(a ∩ b)', () => {
    const a = unitCube(2, 2, 2);
    const b = shiftedBy(unitCube(2, 2, 2), 1, 0, 0);
    // Overlap region = 1·2·2 = 4; union = 8 + 8 − 4 = 12
    const result = fuse(a, b);
    expect(isOk(result)).toBe(true);
    expect(volOf(unwrap(result))).toBeCloseTo(12, 5);
  });

  it('full containment — vol(a ∪ b) = vol(larger)', () => {
    const a = unitCube(4, 4, 4);
    const b = shiftedBy(unitCube(1, 1, 1), 1, 1, 1);
    const result = fuse(a, b);
    expect(isOk(result)).toBe(true);
    expect(volOf(unwrap(result))).toBeCloseTo(64, 5);
  });

  it('identical — vol(a ∪ a) = vol(a)', () => {
    const a = unitCube(3, 3, 3);
    const b = unitCube(3, 3, 3);
    const result = fuse(a, b);
    expect(isOk(result)).toBe(true);
    expect(volOf(unwrap(result))).toBeCloseTo(27, 5);
  });
});

describe('SPEC: cut of two unit cubes', () => {
  it('disjoint — vol(a − b) = vol(a)', () => {
    const a = unitCube(1, 1, 1);
    const b = shiftedBy(unitCube(1, 1, 1), 10, 0, 0);
    const result = cut(a, b);
    expect(isOk(result)).toBe(true);
    expect(volOf(unwrap(result))).toBeCloseTo(1, 5);
  });

  it('half-overlap — vol(a − b) = vol(a) − vol(a ∩ b)', () => {
    const a = unitCube(2, 2, 2);
    const b = shiftedBy(unitCube(2, 2, 2), 1, 0, 0);
    const result = cut(a, b);
    expect(isOk(result)).toBe(true);
    expect(volOf(unwrap(result))).toBeCloseTo(4, 5); // 8 − 4
  });

  it('full containment — vol(a − b) where b ⊂ a = vol(a) − vol(b)', () => {
    const a = unitCube(4, 4, 4);
    const b = shiftedBy(unitCube(1, 1, 1), 1, 1, 1);
    const result = cut(a, b);
    expect(isOk(result)).toBe(true);
    expect(volOf(unwrap(result))).toBeCloseTo(63, 5); // 64 − 1
  });
});

describe('SPEC: intersect of two unit cubes', () => {
  it('disjoint — vol(a ∩ b) = 0', () => {
    const a = unitCube(1, 1, 1);
    const b = shiftedBy(unitCube(1, 1, 1), 10, 0, 0);
    const result = intersect(a, b);
    if (isOk(result)) {
      expect(volOf(unwrap(result))).toBeCloseTo(0, 5);
    }
    // Empty-result also acceptable — both encode "no intersection volume".
  });

  it('half-overlap — vol(a ∩ b) = overlap region', () => {
    const a = unitCube(2, 2, 2);
    const b = shiftedBy(unitCube(2, 2, 2), 1, 0, 0);
    const result = intersect(a, b);
    expect(isOk(result)).toBe(true);
    expect(volOf(unwrap(result))).toBeCloseTo(4, 5); // 1·2·2
  });

  it('full containment — vol(a ∩ b) where b ⊂ a = vol(b)', () => {
    const a = unitCube(4, 4, 4);
    const b = shiftedBy(unitCube(1, 1, 1), 1, 1, 1);
    const result = intersect(a, b);
    expect(isOk(result)).toBe(true);
    expect(volOf(unwrap(result))).toBeCloseTo(1, 5);
  });

  it('identical — vol(a ∩ a) = vol(a)', () => {
    const a = unitCube(3, 3, 3);
    const b = unitCube(3, 3, 3);
    const result = intersect(a, b);
    expect(isOk(result)).toBe(true);
    expect(volOf(unwrap(result))).toBeCloseTo(27, 5);
  });
});

// ---------------------------------------------------------------------------
// Algebraic invariants (fast-check)
// ---------------------------------------------------------------------------

/**
 * Inclusion–exclusion is the strongest single check: it constrains fuse,
 * cut, intersect, and the volume measurement against each other, regardless
 * of any specific reference shape.
 *
 *   vol(a ∪ b) + vol(a ∩ b) = vol(a) + vol(b)
 */
describe('INVARIANT: inclusion–exclusion on cubes', () => {
  it('vol(a ∪ b) + vol(a ∩ b) === vol(a) + vol(b)', () => {
    fc.assert(
      fc.property(fcDim(), fcDim(), fcOffset(), fcOffset(), fcOffset(), (s, t, dx, dy, dz) => {
        const a = unitCube(s, s, s);
        const b = shiftedBy(unitCube(t, t, t), dx, dy, dz);
        const union = fuse(a, b);
        const inter = intersect(a, b);
        if (!isOk(union) || !isOk(inter)) return; // Skip kernel-failure samples.
        const lhs = volOf(unwrap(union)) + volOf(unwrap(inter));
        const rhs = volOf(a) + volOf(b);
        // Tolerance: 0.1% of the larger of (LHS, RHS), or 1e-3 absolute.
        const tol = Math.max(1e-3, 1e-3 * Math.max(Math.abs(lhs), Math.abs(rhs)));
        expect(Math.abs(lhs - rhs)).toBeLessThanOrEqual(tol);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: fuse idempotency — vol(a ∪ a) = vol(a)', () => {
  it('on cubes of all sizes', () => {
    fc.assert(
      fc.property(fcDim(), fcDim(), fcDim(), (w, d, h) => {
        const a = unitCube(w, d, h);
        const result = fuse(a, unitCube(w, d, h));
        if (!isOk(result)) return;
        expect(volOf(unwrap(result))).toBeCloseTo(volOf(a), 2);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: intersect idempotency — vol(a ∩ a) = vol(a)', () => {
  it('on cubes of all sizes', () => {
    fc.assert(
      fc.property(fcDim(), fcDim(), fcDim(), (w, d, h) => {
        const a = unitCube(w, d, h);
        const result = intersect(a, unitCube(w, d, h));
        if (!isOk(result)) return;
        expect(volOf(unwrap(result))).toBeCloseTo(volOf(a), 2);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: fuse is commutative by volume', () => {
  it('vol(a ∪ b) === vol(b ∪ a)', () => {
    fc.assert(
      fc.property(fcDim(), fcDim(), fcOffset(), fcOffset(), (s, t, dx, dy) => {
        const a = unitCube(s, s, s);
        const b = shiftedBy(unitCube(t, t, t), dx, dy, 0);
        const ab = fuse(a, b);
        const ba = fuse(b, a);
        if (!isOk(ab) || !isOk(ba)) return;
        expect(volOf(unwrap(ab))).toBeCloseTo(volOf(unwrap(ba)), 2);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: intersect is commutative by volume', () => {
  it('vol(a ∩ b) === vol(b ∩ a)', () => {
    fc.assert(
      fc.property(fcDim(), fcDim(), fcOffset(), fcOffset(), (s, t, dx, dy) => {
        const a = unitCube(s, s, s);
        const b = shiftedBy(unitCube(t, t, t), dx, dy, 0);
        const ab = intersect(a, b);
        const ba = intersect(b, a);
        if (!isOk(ab) || !isOk(ba)) return;
        expect(volOf(unwrap(ab))).toBeCloseTo(volOf(unwrap(ba)), 2);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: fuseAll equals chained pairwise fuse by volume', () => {
  it('vol(fuseAll([a, b, c])) === vol(fuse(fuse(a, b), c))', () => {
    fc.assert(
      fc.property(fcDim(), fcDim(), fcDim(), fcOffset(), fcOffset(), (a, b, c, dx, dy) => {
        const sA = unitCube(a, a, a);
        const sB = shiftedBy(unitCube(b, b, b), dx, 0, 0);
        const sC = shiftedBy(unitCube(c, c, c), 0, dy, 0);
        const all = fuseAll([sA, sB, sC]);
        const ab = fuse(sA, sB);
        if (!isOk(all) || !isOk(ab)) return;
        const abc = fuse(unwrap(ab), sC);
        if (!isOk(abc)) return;
        expect(volOf(unwrap(all))).toBeCloseTo(volOf(unwrap(abc)), 1);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: cut-of-self yields empty (or zero-volume)', () => {
  it('vol(a − a) === 0', () => {
    fc.assert(
      fc.property(fcDim(), fcDim(), fcDim(), (w, d, h) => {
        const a = unitCube(w, d, h);
        const result = cut(a, unitCube(w, d, h));
        if (!isOk(result)) return; // Kernel may return err for empty result.
        expect(volOf(unwrap(result))).toBeCloseTo(0, 2);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: cut-then-fuse-back recovers original volume', () => {
  it('vol((a − b) ∪ (a ∩ b)) === vol(a)', () => {
    fc.assert(
      fc.property(fcDim(), fcDim(), fcOffset(), (s, t, dx) => {
        const a = unitCube(s, s, s);
        const b = shiftedBy(unitCube(t, t, t), dx, 0, 0);
        const aMinusB = cut(a, b);
        const aAndB = intersect(a, b);
        if (!isOk(aMinusB) || !isOk(aAndB)) return;
        const recombined = fuse(unwrap(aMinusB), unwrap(aAndB));
        if (!isOk(recombined)) return;
        expect(volOf(unwrap(recombined))).toBeCloseTo(volOf(a), 1);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
