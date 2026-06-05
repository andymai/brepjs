/**
 * SPEC: voxel ↔ OCCT cross-parity.
 *
 * Where the exact B-rep kernel can build the same shape, the voxel result must
 * agree with it: the voxel boolean's enclosed volume matches OCCT's exact
 * volume within tolerance, and the two surfaces stay within a few voxels of
 * each other (symmetric Hausdorff ≤ c·h). Offsets are checked against the
 * analytic extent, since a uniform offset shifts every face by the distance.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { box, translate, fuse, measureVolume } from '@/index.js';
import { voxelBoolean, offsetMesh } from '@/voxel/index.js';
import { unwrap } from '@/core/result.js';
import { hausdorff } from '../../helpers/meshParity.js';
import {
  RUN_VOXEL_PARITY,
  setupVoxelParity,
  meshInputOf,
  kernelMeshOf,
  meshVolume,
  meshBbox,
  relErr,
  voxelSize,
  VOXEL,
} from './helpers.js';

const opts = { resolution: VOXEL.resolution, padding: VOXEL.padding };

beforeAll(async () => {
  await setupVoxelParity();
}, 60000);

describe.skipIf(!RUN_VOXEL_PARITY)('SPEC: voxel union agrees with the exact OCCT fuse', () => {
  it('volume matches OCCT, surface within a few voxels (Hausdorff)', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [5, 0, 0]);

    // Fuse once; reuse for both the exact-volume check and the Hausdorff reference.
    const fused = unwrap(fuse(a, b));
    const occtVol = unwrap(measureVolume(fused));
    const voxUnion = unwrap(voxelBoolean(meshInputOf(a), meshInputOf(b), 'union', opts));

    expect(relErr(meshVolume(voxUnion), occtVol)).toBeLessThan(0.03);

    const ref = kernelMeshOf(fused, 0.2);
    const h = hausdorff(voxUnion, ref);
    // Union spans 15mm on its longest axis; allow the surface to sit within
    // ~3 voxels of the exact B-rep (Surface Nets is staircase-ish on flats).
    expect(h).toBeLessThan(3 * voxelSize(15));
  });
});

describe.skipIf(!RUN_VOXEL_PARITY)('SPEC: uniform offset shifts every face by the distance', () => {
  it('offset(+0.6) grows the cube extent to ~[−0.6, 10.6]', () => {
    const cube = meshInputOf(box(10, 10, 10));
    const bb = meshBbox(unwrap(offsetMesh(cube, 0.6, opts)));
    const tol = VOXEL.bboxVoxels * voxelSize(11.2);
    for (const v of bb.min) expect(Math.abs(v - -0.6)).toBeLessThan(tol);
    for (const v of bb.max) expect(Math.abs(v - 10.6)).toBeLessThan(tol);
  });

  it('offset(−0.6) shrinks the cube extent to ~[0.6, 9.4]', () => {
    const cube = meshInputOf(box(10, 10, 10));
    const bb = meshBbox(unwrap(offsetMesh(cube, -0.6, opts)));
    const tol = VOXEL.bboxVoxels * voxelSize(10);
    for (const v of bb.min) expect(Math.abs(v - 0.6)).toBeLessThan(tol);
    for (const v of bb.max) expect(Math.abs(v - 9.4)).toBeLessThan(tol);
  });
});
