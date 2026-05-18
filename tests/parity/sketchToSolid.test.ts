/**
 * Parity spec: 2D sketch → 3D solid pipelines.
 *
 * Specifies the end-to-end behavior of extrude/revolve/loft from sketch
 * inputs, asserting closed-form volumes (and where simple, surface areas)
 * for the composed result. These tests exercise many subsystems at once —
 * sketch construction, wire assembly, face construction, the kernel's
 * 3D operation, and measurement — so a parity failure here may have its
 * root cause in any of them. The README's debugging guide applies.
 *
 * See `tests/parity/README.md` for the policy.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { initKernel } from '../setup.js';
import { NUM_RUNS, fcDim, formula } from './helpers.js';
import {
  sketchCircle,
  sketchRectangle,
  sketchEllipse,
  loft,
  measureVolume,
  unwrap,
  isOk,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

// ---------------------------------------------------------------------------
// Closed-form references — extrude (sketch.extrude pipeline)
// ---------------------------------------------------------------------------

describe('SPEC: sketchRectangle(a, b).extrude(h) volume = a · b · h', () => {
  it.each([
    [1, 1, 1, 1],
    [10, 20, 5, 1000],
    [2, 3, 4, 24],
    [5, 5, 5, 125],
    [50, 1, 1, 50],
  ])('sketchRectangle(%f, %f).extrude(%f) === %f', (a, b, h, expected) => {
    const solid = sketchRectangle(a, b).extrude(h);
    expect(unwrap(measureVolume(solid))).toBeCloseTo(expected, 4);
  });
});

describe('SPEC: sketchCircle(r).extrude(h) volume = π · r² · h', () => {
  it.each([
    [1, 1],
    [2, 5],
    [5, 10],
    [10, 1],
    [0.5, 20],
  ])('sketchCircle(%f).extrude(%f) === π·r²·h', (r, h) => {
    const solid = sketchCircle(r).extrude(h);
    expect(unwrap(measureVolume(solid))).toBeCloseTo(formula.cylinderVolume(r, h), 0);
  });
});

describe('SPEC: sketchEllipse(a, b).extrude(h) volume = π · a · b · h', () => {
  it.each([
    [2, 3, 5, Math.PI * 2 * 3 * 5],
    [5, 2, 10, Math.PI * 5 * 2 * 10],
    [4, 4, 2, Math.PI * 16 * 2], // a = b reduces to circle
  ])('sketchEllipse(%f, %f).extrude(%f)', (a, b, h, expected) => {
    const solid = sketchEllipse(a, b).extrude(h);
    expect(unwrap(measureVolume(solid))).toBeCloseTo(expected, 0);
  });
});

// ---------------------------------------------------------------------------
// Closed-form references — loft
// ---------------------------------------------------------------------------

describe('SPEC: loft between two same-radius circle wires equals cylinder', () => {
  it.each([
    [5, 10], // r = 5, height = 10 → π·25·10
    [3, 7],
    [10, 4],
  ])('loft circles r=%f at h=0 and h=%f', (r, h) => {
    const bottom = sketchCircle(r);
    const top = sketchCircle(r, { origin: [0, 0, h] });
    const result = loft([bottom.wire, top.wire]);
    expect(isOk(result)).toBe(true);
    expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(formula.cylinderVolume(r, h), 0);
  });
});

describe('SPEC: loft between two different-radius circle wires equals frustum', () => {
  it.each([
    [10, 5, 10],
    [3, 1, 8],
    [10, 2, 5],
  ])('loft circles R=%f, r=%f, h=%f → frustum volume', (R, r, h) => {
    const bottom = sketchCircle(R);
    const top = sketchCircle(r, { origin: [0, 0, h] });
    const result = loft([bottom.wire, top.wire]);
    expect(isOk(result)).toBe(true);
    expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(formula.frustumVolume(R, r, h), 0);
  });
});

describe('SPEC: loft between two same-size rectangle wires equals prism', () => {
  it.each([
    [10, 20, 5], // 10·20·5 box equivalent
    [4, 4, 3], // 4·4·3
    [50, 1, 2], // thin slab
  ])('loft rectangles a=%f, b=%f, h=%f → a·b·h', (a, b, h) => {
    const bottom = sketchRectangle(a, b);
    const top = sketchRectangle(a, b, { origin: [0, 0, h] });
    const result = loft([bottom.wire, top.wire]);
    expect(isOk(result)).toBe(true);
    expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(a * b * h, 0);
  });
});

// ---------------------------------------------------------------------------
// Algebraic invariants
// ---------------------------------------------------------------------------

describe('INVARIANT: extruded rectangle volume is linear in height', () => {
  it('vol(rect(a, b).extrude(λ·h)) === λ · vol(rect(a, b).extrude(h))', () => {
    fc.assert(
      fc.property(
        fcDim(),
        fcDim(),
        fcDim(),
        fc.double({ min: 0.5, max: 10, noNaN: true }),
        (a, b, h, lambda) => {
          const base = unwrap(measureVolume(sketchRectangle(a, b).extrude(h)));
          const scaled = unwrap(measureVolume(sketchRectangle(a, b).extrude(h * lambda)));
          const expected = base * lambda;
          const relErr = Math.abs(scaled - expected) / Math.max(Math.abs(expected), 1e-9);
          expect(relErr).toBeLessThan(1e-6);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: extruded rectangle volume is bilinear in cross-section', () => {
  it('vol(rect(λa, b).extrude(h)) === λ · vol(rect(a, b).extrude(h))', () => {
    fc.assert(
      fc.property(
        fcDim(),
        fcDim(),
        fcDim(),
        fc.double({ min: 0.5, max: 10, noNaN: true }),
        (a, b, h, lambda) => {
          const base = unwrap(measureVolume(sketchRectangle(a, b).extrude(h)));
          const scaled = unwrap(measureVolume(sketchRectangle(a * lambda, b).extrude(h)));
          const expected = base * lambda;
          const relErr = Math.abs(scaled - expected) / Math.max(Math.abs(expected), 1e-9);
          expect(relErr).toBeLessThan(1e-6);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: extruded circle volume is linear in height', () => {
  it('vol(circle(r).extrude(λ·h)) === λ · vol(circle(r).extrude(h))', () => {
    fc.assert(
      fc.property(
        fcDim(),
        fcDim(),
        fc.double({ min: 0.5, max: 10, noNaN: true }),
        (r, h, lambda) => {
          const base = unwrap(measureVolume(sketchCircle(r).extrude(h)));
          const scaled = unwrap(measureVolume(sketchCircle(r).extrude(h * lambda)));
          const expected = base * lambda;
          const relErr = Math.abs(scaled - expected) / Math.max(Math.abs(expected), 1e-9);
          // Loose-ish bound — circle tessellation is per-extrusion, so the
          // approximation error compounds with height changes. 0.1% is plenty.
          expect(relErr).toBeLessThan(1e-3);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: extruded circle volume is quadratic in radius', () => {
  it('vol(circle(λ·r).extrude(h)) === λ² · vol(circle(r).extrude(h))', () => {
    fc.assert(
      fc.property(
        fcDim(),
        fcDim(),
        fc.double({ min: 0.5, max: 5, noNaN: true }),
        (r, h, lambda) => {
          const base = unwrap(measureVolume(sketchCircle(r).extrude(h)));
          const scaled = unwrap(measureVolume(sketchCircle(r * lambda).extrude(h)));
          const expected = base * lambda ** 2;
          const relErr = Math.abs(scaled - expected) / Math.max(Math.abs(expected), 1e-9);
          expect(relErr).toBeLessThan(1e-3);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: loft of two identical circles equals cylinder volume', () => {
  it('vol(loft(circle(r) at z=0, circle(r) at z=h)) === π · r² · h', () => {
    fc.assert(
      fc.property(fcDim(), fcDim(), (r, h) => {
        const bottom = sketchCircle(r);
        const top = sketchCircle(r, { origin: [0, 0, h] });
        const result = loft([bottom.wire, top.wire]);
        // Loft must succeed on these non-degenerate inputs — failure here is
        // a parity gap, not a precondition to silently skip. (`fc.pre` would
        // skip the sample; an `expect` failure surfaces the regression.)
        expect(isOk(result)).toBe(true);
        if (!isOk(result)) return; // Type narrowing for the unwrap below.
        const vol = unwrap(measureVolume(unwrap(result)));
        const expected = formula.cylinderVolume(r, h);
        const relErr = Math.abs(vol - expected) / Math.max(Math.abs(expected), 1e-9);
        // 1% — loft tessellates twice (each cross-section) and surfaces
        // between them, so error margins are wider than direct extrude.
        expect(relErr).toBeLessThan(1e-2);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
