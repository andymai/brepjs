import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { shouldSkipSuite } from './helpers/kernelDivergences.js';
import {
  box,
  sphere,
  translate,
  hull,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  isSolid,
  measureVolume,
  getKernel,
  createSolid,
} from '@/index.js';
import type { Shape3D } from '@/core/shapeTypes.js';

describe.skipIf(shouldSkipSuite('hullFns'))('OCCT-specific: hullFns', () => {
  beforeAll(async () => {
    await initKernel();
  }, 30000);

  describe('hull', () => {
    it('returns error for empty array', () => {
      const result = hull([]);
      expect(isErr(result)).toBe(true);
      const error = unwrapErr(result);
      expect(error.message).toContain('at least one shape');
    });

    it('hull of a single box returns a solid with approximately same volume', () => {
      const b = box(10, 10, 10);
      const result = hull([b]);
      expect(isOk(result)).toBe(true);
      const solid = unwrap(result);
      expect(isSolid(solid)).toBe(true);
      const vol = unwrap(measureVolume(solid));
      expect(vol).toBeCloseTo(1000, 0);
    });

    it('hull of two separated boxes has volume greater than sum', () => {
      const b1 = box(10, 10, 10);
      const b2 = translate(box(10, 10, 10), [20, 0, 0]) as Shape3D;
      const result = hull([b1, b2]);
      expect(isOk(result)).toBe(true);
      const solid = unwrap(result);
      expect(isSolid(solid)).toBe(true);
      const vol = unwrap(measureVolume(solid));
      expect(vol).toBeGreaterThan(2000);
    });

    it('hull of a sphere has approximately correct volume', () => {
      const r = 10;
      const s = sphere(r);
      const result = hull([s]);
      expect(isOk(result)).toBe(true);
      const solid = unwrap(result);
      const vol = unwrap(measureVolume(solid));
      const expected = (4 / 3) * Math.PI * r ** 3;
      // Mesh-based hull is an approximation, allow 15% tolerance
      expect(vol).toBeGreaterThan(expected * 0.85);
      expect(vol).toBeLessThan(expected * 1.15);
    });

    it('hull of scattered translated small boxes forms convex envelope', () => {
      const boxes = [
        box(1, 1, 1),
        translate(box(1, 1, 1), [50, 0, 0]) as Shape3D,
        translate(box(1, 1, 1), [0, 50, 0]) as Shape3D,
        translate(box(1, 1, 1), [0, 0, 50]) as Shape3D,
      ];
      const result = hull(boxes);
      expect(isOk(result)).toBe(true);
      const solid = unwrap(result);
      expect(isSolid(solid)).toBe(true);
      const vol = unwrap(measureVolume(solid));
      // Should form a roughly tetrahedral shape — volume well above sum of small boxes (4)
      expect(vol).toBeGreaterThan(1000);
    });

    it('returns error when array contains a null shape', () => {
      const oc = getKernel().oc;
      const nullShape = createSolid(new oc.TopoDS_Solid()) as Shape3D;
      const result = hull([nullShape]);
      expect(isErr(result)).toBe(true);
    });

    it('respects custom tolerance option', () => {
      const b = box(10, 10, 10);
      const result = hull([b], { tolerance: 0.01 });
      expect(isOk(result)).toBe(true);
      const solid = unwrap(result);
      expect(isSolid(solid)).toBe(true);
      const vol = unwrap(measureVolume(solid));
      expect(vol).toBeCloseTo(1000, 0);
    });

    it('hull of mixed shape types (box and sphere)', () => {
      const b = box(5, 5, 5);
      const s = sphere(3);
      const result = hull([b, s]);
      expect(isOk(result)).toBe(true);
      const solid = unwrap(result);
      expect(isSolid(solid)).toBe(true);
      const vol = unwrap(measureVolume(solid));
      // Hull should be at least as large as the box
      expect(vol).toBeGreaterThanOrEqual(125);
    });
  });
});
