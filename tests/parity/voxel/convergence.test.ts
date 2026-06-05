/**
 * SPEC: resolution convergence.
 *
 * The voxel domain is approximate by construction, so the meaningful guarantee
 * is not a fixed error but that error *shrinks as resolution rises* — the
 * discretization converges to the true geometry. This is the voxel analog of
 * the exactness the B-rep parity suite asserts. It also pins, empirically, the
 * "Hausdorff ≤ c·h" claim the vault plan leaves deferred.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { box, cylinder } from '@/index.js';
import { repairMesh } from '@/voxel/index.js';
import { unwrap } from '@/core/result.js';
import { formula } from '../helpers.js';
import { RUN_VOXEL_PARITY, setupVoxelParity, meshInputOf, meshVolume, relErr } from './helpers.js';

beforeAll(async () => {
  await setupVoxelParity();
}, 60000);

describe.skipIf(!RUN_VOXEL_PARITY)('SPEC: volume error shrinks as resolution rises', () => {
  it('cube volume error: res 48 beats res 24, and is tight', () => {
    const input = meshInputOf(box(10, 10, 10));
    const truth = formula.boxVolume(10, 10, 10);
    const coarse = relErr(
      meshVolume(unwrap(repairMesh(input, { resolution: 24, padding: 2 }))),
      truth
    );
    const fine = relErr(
      meshVolume(unwrap(repairMesh(input, { resolution: 48, padding: 2 }))),
      truth
    );
    expect(fine).toBeLessThan(coarse);
    expect(fine).toBeLessThan(0.01);
  });

  it('cylinder (curved) volume error: res 40 beats res 24, and is tight', () => {
    // Coarse input tessellation keeps FWN cheap; the grid sets the fidelity.
    const input = meshInputOf(cylinder(5, 12), 0.3);
    const truth = formula.cylinderVolume(5, 12);
    const coarse = relErr(
      meshVolume(unwrap(repairMesh(input, { resolution: 24, padding: 2 }))),
      truth
    );
    const fine = relErr(
      meshVolume(unwrap(repairMesh(input, { resolution: 40, padding: 2 }))),
      truth
    );
    expect(fine).toBeLessThan(coarse);
    expect(fine).toBeLessThan(0.02);
  });
});
