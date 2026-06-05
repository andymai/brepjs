/**
 * SPEC + INVARIANT: voxel boolean algebra.
 *
 * Field-CSG booleans (min/max SDF → Surface Nets) must obey set algebra within
 * the voxel tolerance: union/intersection/difference recover the closed-form
 * volumes, inclusion–exclusion holds, union is commutative, and intersecting
 * disjoint operands is a discoverable error (not a silently-empty mesh).
 *
 * Operands (axis-aligned boxes, 12 input triangles each → fast FWN):
 *   A = [0,10]³                      vol 1000
 *   B = [5,15]×[0,10]×[0,10]         vol 1000   (overlap [5,10]×… vol 500)
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { box, translate } from '@/index.js';
import { voxelBoolean } from '@/voxel/index.js';
import { unwrap, isErr } from '@/core/result.js';
import {
  RUN_VOXEL_PARITY,
  setupVoxelParity,
  meshInputOf,
  meshVolume,
  relErr,
  VOXEL,
} from './helpers.js';

const opts = { resolution: VOXEL.resolution, padding: VOXEL.padding };
// Two compounded voxelized volumes, so allow a touch more than the single-op band.
const BOOL_TOL = 0.04;

beforeAll(async () => {
  await setupVoxelParity();
}, 60000);

describe.skipIf(!RUN_VOXEL_PARITY)('SPEC: boolean volumes match set algebra', () => {
  const A = () => meshInputOf(box(10, 10, 10));
  const B = () => meshInputOf(translate(box(10, 10, 10), [5, 0, 0]));

  it('union(A,B) volume ≈ 1500 (1000 + 1000 − 500 overlap)', () => {
    const vol = meshVolume(unwrap(voxelBoolean(A(), B(), 'union', opts)));
    expect(relErr(vol, 1500)).toBeLessThan(BOOL_TOL);
  });

  it('intersection(A,B) volume ≈ 500 (the overlap)', () => {
    const vol = meshVolume(unwrap(voxelBoolean(A(), B(), 'intersection', opts)));
    expect(relErr(vol, 500)).toBeLessThan(BOOL_TOL);
  });

  it('difference(A,B) volume ≈ 500 (A minus the overlap)', () => {
    const vol = meshVolume(unwrap(voxelBoolean(A(), B(), 'difference', opts)));
    expect(relErr(vol, 500)).toBeLessThan(BOOL_TOL);
  });
});

describe.skipIf(!RUN_VOXEL_PARITY)('INVARIANT: boolean algebra', () => {
  const A = () => meshInputOf(box(10, 10, 10));
  const B = () => meshInputOf(translate(box(10, 10, 10), [5, 0, 0]));

  it('inclusion–exclusion: vol(A∪B) + vol(A∩B) ≈ vol(A) + vol(B)', () => {
    const volU = meshVolume(unwrap(voxelBoolean(A(), B(), 'union', opts)));
    const volI = meshVolume(unwrap(voxelBoolean(A(), B(), 'intersection', opts)));
    expect(relErr(volU + volI, 2000)).toBeLessThan(BOOL_TOL);
  });

  it('union is commutative by volume: vol(A∪B) ≈ vol(B∪A)', () => {
    const ab = meshVolume(unwrap(voxelBoolean(A(), B(), 'union', opts)));
    const ba = meshVolume(unwrap(voxelBoolean(B(), A(), 'union', opts)));
    expect(relErr(ab, ba)).toBeLessThan(0.02);
  });

  it('intersecting disjoint operands is a discoverable error', () => {
    const far = meshInputOf(translate(box(10, 10, 10), [50, 0, 0]));
    expect(isErr(voxelBoolean(A(), far, 'intersection', opts))).toBe(true);
  });
});
