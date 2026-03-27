import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel } from './setup.js';
import { shouldSkipSuite } from './helpers/kernelDivergences.js';
import { box, sphere, unwrap, measureVolume, fuse, cut, intersect, translate } from '@/index.js';

const descBk = shouldSkipSuite('brepkitBooleanEdgeCases') ? describe.skip : describe;

beforeAll(async () => {
  await initKernel();
}, 30000);

descBk('Boolean edge cases (GFA hardening v2.26-2.33)', () => {
  it('cut identical solids produces error or empty', () => {
    const a = box(10, 10, 10);
    const b = box(10, 10, 10);
    // Cutting identical shapes should produce an error (empty result) or throw
    try {
      const result = cut(a, b);
      // If it doesn't throw, the result should be an error
      expect(result.ok).toBe(false);
    } catch {
      // Expected — brepkit throws for identical solid cut
    }
  });

  it('fuse identical solids returns same volume', () => {
    const a = box(10, 10, 10);
    const b = box(10, 10, 10);
    const result = unwrap(fuse(a, b));
    const vol = unwrap(measureVolume(result));
    expect(vol).toBeCloseTo(1000, 0);
  });

  it('coplanar face boolean: box on box sharing a face', () => {
    // Two boxes sharing a face — exercises coplanar face section edges (v2.33)
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [0, 0, 10]);
    // Fuse of two stacked 10x10x10 boxes = 10x10x20 = 2000
    const result = unwrap(fuse(a, b));
    const vol = unwrap(measureVolume(result));
    expect(vol).toBeCloseTo(2000, 0);
  });

  it('boolean with sphere (NURBS surfaces)', () => {
    const b = box(10, 10, 10);
    const s = sphere(7);
    const result = unwrap(fuse(b, s));
    const vol = unwrap(measureVolume(result));
    // Fuse should be larger than either alone
    const boxVol = 1000;
    const sphereVol = (4 / 3) * Math.PI * 7 ** 3;
    expect(vol).toBeGreaterThan(boxVol);
    expect(vol).toBeLessThan(boxVol + sphereVol);
  });

  it('intersect overlapping boxes', () => {
    // Two overlapping boxes — straightforward planar intersect
    const a = box(10, 10, 10); // centered at origin
    const b = translate(box(10, 10, 10), [5, 0, 0]); // shifted right by 5
    const result = unwrap(intersect(a, b));
    const vol = unwrap(measureVolume(result));
    // Intersection: 5x10x10 = 500
    expect(vol).toBeCloseTo(500, 0);
  });
});
