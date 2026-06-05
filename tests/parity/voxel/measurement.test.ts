/**
 * SPEC: voxel measurement parity.
 *
 * Voxelizing a primitive (FWN sign → Surface Nets contour, via `repairMesh`)
 * and measuring the resulting mesh must recover the closed-form volume and
 * bounding box within the resolution-bound tolerance. Area runs looser because
 * Surface Nets inflates surface area. References are closed-form math, never
 * kernel output (see ../README.md).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { box, cylinder } from '@/index.js';
import { repairMesh } from '@/voxel/index.js';
import { unwrap } from '@/core/result.js';
import { formula } from '../helpers.js';
import {
  RUN_VOXEL_PARITY,
  setupVoxelParity,
  meshInputOf,
  meshVolume,
  meshArea,
  meshBbox,
  relErr,
  voxelSize,
  VOXEL,
} from './helpers.js';

beforeAll(async () => {
  await setupVoxelParity();
}, 60000);

describe.skipIf(!RUN_VOXEL_PARITY)(
  'SPEC: voxel volume = closed-form, within resolution tolerance',
  () => {
    it.each([
      [10, 10, 10],
      [20, 10, 6],
      [8, 14, 5],
    ])('repair(box(%i,%i,%i)).volume ≈ w·d·h', (w, d, h) => {
      const out = unwrap(
        repairMesh(meshInputOf(box(w, d, h)), {
          resolution: VOXEL.resolution,
          padding: VOXEL.padding,
        })
      );
      expect(relErr(meshVolume(out), formula.boxVolume(w, d, h))).toBeLessThan(VOXEL.volTol);
    });

    it('repair(cylinder(r,h)).volume ≈ π·r²·h', () => {
      // Coarse input tessellation keeps the FWN sign cost low; grid resolution,
      // not input density, sets the output fidelity.
      const out = unwrap(
        repairMesh(meshInputOf(cylinder(5, 12), 0.3), {
          resolution: VOXEL.resolution,
          padding: VOXEL.padding,
        })
      );
      expect(relErr(meshVolume(out), formula.cylinderVolume(5, 12))).toBeLessThan(VOXEL.volTol);
    });
  }
);

describe.skipIf(!RUN_VOXEL_PARITY)('SPEC: voxel bounding box = primitive extent', () => {
  it('repair(box) recovers the exact axis-aligned extent', () => {
    const [w, d, h] = [12, 8, 6];
    const out = unwrap(
      repairMesh(meshInputOf(box(w, d, h)), {
        resolution: VOXEL.resolution,
        padding: VOXEL.padding,
      })
    );
    const bb = meshBbox(out);
    const tol = VOXEL.bboxVoxels * voxelSize(Math.max(w, d, h));
    // box(w,d,h) spans [0,w]×[0,d]×[0,h] (origin corner).
    for (const [actual, expected] of [
      [bb.min[0], 0],
      [bb.min[1], 0],
      [bb.min[2], 0],
      [bb.max[0], w],
      [bb.max[1], d],
      [bb.max[2], h],
    ] as const) {
      expect(Math.abs(actual - expected)).toBeLessThan(tol);
    }
  });
});

describe.skipIf(!RUN_VOXEL_PARITY)(
  'SPEC: voxel area ≈ closed-form (loose — Surface Nets inflates area)',
  () => {
    it('repair(box).area is within the inflated-area band', () => {
      const [w, d, h] = [10, 10, 10];
      const out = unwrap(
        repairMesh(meshInputOf(box(w, d, h)), {
          resolution: VOXEL.resolution,
          padding: VOXEL.padding,
        })
      );
      expect(relErr(meshArea(out), formula.boxArea(w, d, h))).toBeLessThan(VOXEL.areaTol);
    });
  }
);
