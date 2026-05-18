/**
 * Parity spec: solid measurement (volume + surface area).
 *
 * Reference values come from closed-form math — see `formula.*` in
 * `tests/parity/helpers.ts`. See `tests/parity/README.md` for the policy
 * on why we test mathematical truth rather than observed kernel output.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { initKernel } from '../setup.js';
import {
  NUM_RUNS,
  REL_TOL,
  fcDim,
  formula,
  shiftedBy,
  unitCube,
  unitCylinder,
  unitFrustum,
  unitSphere,
  unitTorus,
} from './helpers.js';
import { measureVolume, measureArea, unwrap } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

// ---------------------------------------------------------------------------
// Closed-form reference values
// ---------------------------------------------------------------------------

describe('SPEC: box volume = w · d · h', () => {
  it.each([
    [1, 1, 1, 1],
    [2, 3, 4, 24],
    [0.5, 10, 4, 20],
    [10, 10, 10, 1000],
    [25, 1, 1, 25],
  ])('box(%f, %f, %f).volume === %f', (w, d, h, expected) => {
    expect(unwrap(measureVolume(unitCube(w, d, h)))).toBeCloseTo(expected, 5);
  });
});

describe('SPEC: box surface area = 2(wd + wh + dh)', () => {
  it.each([
    [1, 1, 1, 6],
    [2, 3, 4, 52],
    [10, 10, 10, 600],
    [5, 4, 3, 94],
  ])('box(%f, %f, %f).area === %f', (w, d, h, expected) => {
    expect(unwrap(measureArea(unitCube(w, d, h)))).toBeCloseTo(expected, 5);
  });
});

describe('SPEC: sphere volume = (4/3) · π · r³', () => {
  it.each([1, 2, 5, 10, 0.5])('sphere(r=%f).volume', (r) => {
    expect(unwrap(measureVolume(unitSphere(r)))).toBeCloseTo(formula.sphereVolume(r), 0);
  });
});

describe('SPEC: sphere surface area = 4π · r²', () => {
  it.each([1, 2, 5, 10, 0.5])('sphere(r=%f).area', (r) => {
    expect(unwrap(measureArea(unitSphere(r)))).toBeCloseTo(formula.sphereArea(r), 0);
  });
});

describe('SPEC: cylinder volume = π · r² · h', () => {
  it.each([
    [1, 1],
    [2, 5],
    [5, 10],
    [10, 1],
    [0.5, 20],
  ])('cylinder(r=%f, h=%f).volume', (r, h) => {
    expect(unwrap(measureVolume(unitCylinder(r, h)))).toBeCloseTo(formula.cylinderVolume(r, h), 0);
  });
});

describe('SPEC: cylinder surface area = 2π·r·h + 2π·r²', () => {
  it.each([
    [1, 1],
    [2, 5],
    [5, 10],
    [10, 1],
  ])('cylinder(r=%f, h=%f).area', (r, h) => {
    expect(unwrap(measureArea(unitCylinder(r, h)))).toBeCloseTo(formula.cylinderArea(r, h), 0);
  });
});

describe('SPEC: frustum volume = (π·h/3)(R² + Rr + r²)', () => {
  // R === r is a degenerate frustum (it's a cylinder) — covered by the
  // cylinder suite. The frustum formula requires distinct radii to exercise.
  it.each([
    [10, 5, 10],
    [3, 1, 8],
    [10, 0, 10], // Full cone — frustum with r = 0.
  ])('frustum(R=%f, r=%f, h=%f).volume', (R, r, h) => {
    expect(unwrap(measureVolume(unitFrustum(R, r, h)))).toBeCloseTo(
      formula.frustumVolume(R, r, h),
      0
    );
  });
});

describe('SPEC: torus volume = 2π²·R·r²', () => {
  it.each([
    [5, 1],
    [10, 2],
    [20, 5],
    [3, 0.5],
  ])('torus(R=%f, r=%f).volume', (R, r) => {
    expect(unwrap(measureVolume(unitTorus(R, r)))).toBeCloseTo(formula.torusVolume(R, r), 0);
  });
});

describe('SPEC: torus surface area = 4π²·R·r', () => {
  it.each([
    [5, 1],
    [10, 2],
    [20, 5],
  ])('torus(R=%f, r=%f).area', (R, r) => {
    expect(unwrap(measureArea(unitTorus(R, r)))).toBeCloseTo(formula.torusArea(R, r), 0);
  });
});

// ---------------------------------------------------------------------------
// Algebraic invariants (fast-check)
// ---------------------------------------------------------------------------

describe('INVARIANT: translation preserves volume', () => {
  it('vol(translate(box, v)) === vol(box) for all v', () => {
    fc.assert(
      fc.property(
        fcDim(),
        fcDim(),
        fcDim(),
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        (w, d, h, dx, dy, dz) => {
          const base = unitCube(w, d, h);
          const shifted = shiftedBy(base, dx, dy, dz);
          const v0 = unwrap(measureVolume(base));
          const v1 = unwrap(measureVolume(shifted));
          expect(v1).toBeCloseTo(v0, 6);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: translation preserves surface area', () => {
  it('area(translate(sphere, v)) === area(sphere) for all v', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 10, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        (r, dx, dy, dz) => {
          const base = unitSphere(r);
          const a0 = unwrap(measureArea(base));
          const a1 = unwrap(measureArea(shiftedBy(base, dx, dy, dz)));
          expect(a1).toBeCloseTo(a0, 3);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: linear scaling of dimensions scales volume cubically', () => {
  it('vol(box(λw, λd, λh)) === λ³ · vol(box(w, d, h))', () => {
    fc.assert(
      fc.property(
        fcDim(),
        fcDim(),
        fcDim(),
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        (w, d, h, lambda) => {
          const base = unwrap(measureVolume(unitCube(w, d, h)));
          const scaled = unwrap(measureVolume(unitCube(w * lambda, d * lambda, h * lambda)));
          const expected = base * lambda ** 3;
          // Relative tolerance: |scaled - expected| / |expected| < REL_TOL.
          // Box volume is an exact closed-form measurement (no curved geometry),
          // so the only error source is float arithmetic — REL_TOL = 1e-6 is well
          // within reach for a correct kernel.
          const relErr = Math.abs(scaled - expected) / Math.max(Math.abs(expected), 1e-9);
          expect(relErr).toBeLessThan(REL_TOL);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: cylinder volume is linear in height', () => {
  it('vol(cylinder(r, h1+h2)) === vol(cylinder(r, h1)) + vol(cylinder(r, h2))', () => {
    fc.assert(
      fc.property(fcDim(), fcDim(), fcDim(), (r, h1, h2) => {
        const sum =
          unwrap(measureVolume(unitCylinder(r, h1))) + unwrap(measureVolume(unitCylinder(r, h2)));
        const combined = unwrap(measureVolume(unitCylinder(r, h1 + h2)));
        expect(combined).toBeCloseTo(sum, 2);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: cylinder volume is quadratic in radius', () => {
  it('vol(cylinder(2r, h)) === 4 · vol(cylinder(r, h))', () => {
    fc.assert(
      fc.property(fcDim(), fcDim(), (r, h) => {
        const small = unwrap(measureVolume(unitCylinder(r, h)));
        const big = unwrap(measureVolume(unitCylinder(2 * r, h)));
        expect(big).toBeCloseTo(4 * small, 2);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
