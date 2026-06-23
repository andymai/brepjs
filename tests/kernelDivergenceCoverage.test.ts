/**
 * Kernel divergence coverage — operations where occt-wasm (and occt) match an
 * analytic reference but brepkit diverges. Each test passes green on the B-rep
 * reference kernels and is documented-skipped on brepkit via the divergence
 * registry (see tests/helpers/kernelDivergences.ts). Skips cite the upstream
 * andymai/brepkit issue tracking the gap.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';
import {
  cylinder,
  torus,
  sketchCircle,
  sketchRectangle,
  castShape,
  fillet,
  revolve,
  measureVolume,
  unwrap,
  isOk,
} from '@/index.js';
import type { Face } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('kernel divergence coverage', () => {
  // -------------------------------------------------------------------------
  // fillet on a cylinder's circular edge — brepkit #967
  //
  // A constant-radius fillet on the circular rim(s) of a cylinder must remove
  // only a thin band of material. occt-wasm/occt round the rims correctly; a
  // 6283 mm³ cylinder filleted r=0.5 stays ~6276. brepkit collapses it to
  // ~3978 (−37%), even though a box fillet works.
  // -------------------------------------------------------------------------
  describe('filletCylindricalEdge', () => {
    it('a small fillet on a cylinder rim removes almost no material', (ctx) => {
      skipIfDiverges(ctx, 'modifierFns.filletCylindricalEdge');
      const cyl = cylinder(10, 20);
      const raw = unwrap(measureVolume(cyl)); // π·100·20 ≈ 6283.185
      const result = fillet(cyl, 0.5);
      expect(isOk(result)).toBe(true);
      const vol = unwrap(measureVolume(unwrap(result)));
      // occt-wasm/occt: 6276.519 — a fillet of r=0.5 removes < 0.2% of the solid.
      expect(vol).toBeCloseTo(6276.519, 1);
      // Sanity: a rim round can never remove a meaningful fraction of the solid.
      expect(vol).toBeGreaterThan(raw * 0.99);
    });

    it('fillet r=2 on cylinder rims matches the analytic-grade reference', (ctx) => {
      skipIfDiverges(ctx, 'modifierFns.filletCylindricalEdge');
      const cyl = cylinder(10, 20);
      const result = fillet(cyl, 2);
      expect(isOk(result)).toBe(true);
      const vol = unwrap(measureVolume(unwrap(result)));
      // occt-wasm/occt: 6180.134 (removes ~1.6%). brepkit: 3350.585 (−46%).
      expect(vol).toBeCloseTo(6180.134, 1);
    });
  });

  // -------------------------------------------------------------------------
  // revolve of a circular profile — brepkit #968
  //
  // Revolving a circle 360° around an offset axis yields a torus. occt-wasm/occt
  // match the analytic 2π²Rr² to 9 digits; brepkit's revolved surface is an
  // inscribed polygon, undershooting by ~2%. The torus *primitive* is exact on
  // brepkit, so the loss is in the revolve sweep (cf. #965 sweep, #966 extrude).
  // -------------------------------------------------------------------------
  describe('revolveCircularProfile', () => {
    it('revolving a circle 360° produces a torus of the analytic volume', (ctx) => {
      skipIfDiverges(ctx, 'extrudeFns.revolveCircularProfile');
      const circle = sketchCircle(2, { origin: [10, 0] });
      const face = castShape(circle.face().wrapped) as Face;
      const result = revolve(face as never, {
        at: [0, 0, 0],
        axis: [0, 1, 0],
        angle: 2 * Math.PI,
      });
      expect(isOk(result)).toBe(true);
      const vol = unwrap(measureVolume(unwrap(result)));
      const analytic = 2 * Math.PI * Math.PI * 10 * 4; // 2π²·R·r², R=10 r=2

      // The torus primitive is exact on every kernel — proves the geometry is
      // representable, isolating the loss to the revolve sweep.
      expect(unwrap(measureVolume(torus(10, 2)))).toBeCloseTo(analytic, 2);

      // occt-wasm/occt: 789.5684 (== analytic). brepkit: 773.1395 (−2.08%).
      expect(vol).toBeCloseTo(analytic, 2);
    });

    it('a revolved annular washer matches the analytic volume', (ctx) => {
      skipIfDiverges(ctx, 'extrudeFns.revolveCircularProfile');
      // rect x∈[5,7], y∈[−2.5,2.5], revolve around Y → washer R_out 7, R_in 5, h 5
      const rect = sketchRectangle(2, 5, { origin: [6, 0] });
      const face = castShape(rect.face().wrapped) as Face;
      const result = revolve(face as never, {
        at: [0, 0, 0],
        axis: [0, 1, 0],
        angle: 2 * Math.PI,
      });
      expect(isOk(result)).toBe(true);
      const vol = unwrap(measureVolume(unwrap(result)));
      const analytic = Math.PI * (49 - 25) * 5; // 376.991
      // occt-wasm/occt: 376.991 (== analytic). brepkit: 376.843 (−0.039%).
      expect(vol).toBeCloseTo(analytic, 1);
    });
  });
});
