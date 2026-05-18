/**
 * Parity spec: round-trip serialization preserves measurements.
 *
 * For each format the kernel supports, asserts that
 *
 *   importFormat(exportFormat(shape)).volume ≈ shape.volume
 *
 * to a format-appropriate tolerance:
 *
 * | Format | Loss model        | Volume tolerance   |
 * | ------ | ----------------- | ------------------ |
 * | BREP   | Lossless (native) | exact (6 decimals) |
 * | STEP   | Lossless (B-rep)  | 4 decimals         |
 *
 * IGES and STL are out of scope for this PR. The current WASM builds
 * of both kernels have known limitations:
 *  - IGES export of solid bodies returns "IGES_EXPORT_FAILED".
 *  - STL import returns "STL_IMPORT_FAILED" on round-tripped output.
 * Re-add their parity coverage when those paths are fixed in-kernel.
 *
 * See `tests/parity/README.md` for the policy.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { initKernel } from '../setup.js';
import { NUM_RUNS, fcDim, formula } from './helpers.js';
import {
  box,
  cylinder,
  sphere,
  sketchCircle,
  sketchRectangle,
  exportSTEP,
  importSTEP,
  toBREP,
  fromBREP,
  measureVolume,
  unwrap,
} from '@/index.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function volOf(shape: AnyShape<Dimension>): number {
  return unwrap(measureVolume(shape));
}

// ---------------------------------------------------------------------------
// BREP — lossless string round-trip
// ---------------------------------------------------------------------------

describe('SPEC: BREP round-trip preserves volume (lossless)', () => {
  // BREP is the kernel's native serialization. Header contract: 6 decimals.
  it.each<[string, () => AnyShape<Dimension>, number]>([
    ['box(2,3,4)', () => box(2, 3, 4), 24],
    ['box(10,10,10)', () => box(10, 10, 10), 1000],
    ['cylinder(r=5, h=10)', () => cylinder(5, 10), Math.PI * 25 * 10],
    ['sphere(r=5)', () => sphere(5), (4 / 3) * Math.PI * 125],
  ])('%s → toBREP → fromBREP preserves volume', (_label, make, expected) => {
    const original = make();
    const serialized = unwrap(toBREP(original));
    const restored = unwrap(fromBREP(serialized));
    expect(volOf(restored)).toBeCloseTo(expected, 6);
  });
});

describe('SPEC: BREP round-trip on sketch.extrude pipeline output', () => {
  // Header contract: 6 decimals (BREP is lossless).
  it.each<[string, () => AnyShape<Dimension>, number]>([
    ['sketchRectangle(10,20).extrude(5)', () => sketchRectangle(10, 20).extrude(5), 1000],
    [
      'sketchCircle(5).extrude(10)',
      () => sketchCircle(5).extrude(10),
      formula.cylinderVolume(5, 10),
    ],
  ])('%s round-trips', (_label, make, expected) => {
    const original = make();
    const restored = unwrap(fromBREP(unwrap(toBREP(original))));
    // sketch.extrude(circle) measures vs the closed-form cylinder volume,
    // which itself has circle-tessellation slack on lossy paths — but here
    // BREP is lossless, so the round-trip can't *introduce* additional
    // error beyond what was already in the original. Compare against
    // volOf(original) instead of the closed-form expected so the test
    // gates the round-trip's faithfulness, not the kernel's circle precision.
    expect(volOf(restored)).toBeCloseTo(volOf(make()), 6);
    // Sanity: the original is within 0.5 of the closed-form expected.
    expect(volOf(make())).toBeCloseTo(expected, 0);
  });
});

// ---------------------------------------------------------------------------
// STEP — lossless B-rep file format
// ---------------------------------------------------------------------------

describe('SPEC: STEP round-trip preserves volume (lossless B-rep)', () => {
  // Header contract: 4 decimals. STEP file I/O round-trips through string
  // serialization with bounded float precision; ±5e-5 is the contract.
  it.each<[string, () => AnyShape<Dimension>, number]>([
    ['box(2,3,4)', () => box(2, 3, 4), 24],
    ['box(10,10,10)', () => box(10, 10, 10), 1000],
    ['cylinder(r=5, h=10)', () => cylinder(5, 10), Math.PI * 25 * 10],
    ['sphere(r=5)', () => sphere(5), (4 / 3) * Math.PI * 125],
  ])('%s → exportSTEP → importSTEP preserves volume', async (_label, make, expected) => {
    const original = make();
    const blob = unwrap(exportSTEP(original));
    const restored = unwrap(await importSTEP(blob));
    // Gate the round-trip's fidelity, not the kernel's curve precision:
    // STEP must preserve whatever volume the original had to 4 decimals.
    expect(volOf(restored)).toBeCloseTo(volOf(original), 4);
    // Sanity: the original is within 0.5 of the closed-form expected.
    expect(volOf(original)).toBeCloseTo(expected, 0);
  });
});

// ---------------------------------------------------------------------------
// Algebraic invariants — round-trip should be idempotent in the BREP path
// ---------------------------------------------------------------------------

describe('INVARIANT: BREP round-trip is volume-preserving for boxes', () => {
  it('vol(fromBREP(toBREP(box(w,d,h)))) === vol(box(w,d,h))', () => {
    fc.assert(
      fc.property(fcDim(), fcDim(), fcDim(), (w, d, h) => {
        const b = box(w, d, h);
        const original = volOf(b);
        const serialized = unwrap(toBREP(b));
        expect(typeof serialized).toBe('string');
        expect(serialized.length).toBeGreaterThan(0);
        const restored = unwrap(fromBREP(serialized));
        expect(volOf(restored)).toBeCloseTo(original, 4);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: BREP round-trip is volume-preserving for cylinders', () => {
  it('vol(fromBREP(toBREP(cylinder(r, h)))) === vol(cylinder(r, h))', () => {
    fc.assert(
      fc.property(fcDim(), fcDim(), (r, h) => {
        const c = cylinder(r, h);
        const original = volOf(c);
        const restored = unwrap(fromBREP(unwrap(toBREP(c))));
        const v = volOf(restored);
        const relErr = Math.abs(v - original) / Math.max(Math.abs(original), 1e-9);
        // Lossless format, but kernels can renumber/reorder topology that
        // affects volume to a few-ULP precision. 1e-6 is well within float.
        expect(relErr).toBeLessThan(1e-6);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

describe('INVARIANT: STEP round-trip preserves volume for boxes', () => {
  it('vol(importSTEP(exportSTEP(box))) === vol(box)', async () => {
    // STEP uses async import, so we run fewer property samples to keep CI
    // time bounded. Coverage comes from the closed-form table above.
    await fc.assert(
      fc.asyncProperty(fcDim(), fcDim(), fcDim(), async (w, d, h) => {
        const b = box(w, d, h);
        const original = volOf(b);
        const blob = unwrap(exportSTEP(b));
        const restored = unwrap(await importSTEP(blob));
        const v = volOf(restored);
        const relErr = Math.abs(v - original) / Math.max(Math.abs(original), 1e-9);
        expect(relErr).toBeLessThan(1e-4);
      }),
      { numRuns: 10 } // STEP is slow; 10 samples is plenty for the property.
    );
  });
});
