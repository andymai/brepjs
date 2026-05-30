/**
 * Validation and repair for the manifold adapter.
 *
 * Manifold's invariant is watertight, 2-manifold output: every native op
 * produces a valid solid by construction. Validation therefore reports valid
 * for any non-empty solid with a clean status, and the heal/fix operations are
 * identities — there is nothing to repair in a manifold mesh. Vertex merge and
 * degenerate-edge removal report zero changes for the same reason.
 * @module
 */

import type { KernelRepairOps } from '@/kernel/interfaces/repairOps.js';
import type { KernelShape } from '@/kernel/types.js';
import type { ManifoldModule } from './helpers.js';
import type { ManifoldShape } from './meshHandle.js';

function isWellFormed(shape: KernelShape): boolean {
  const ms = shape as ManifoldShape | null;
  const solid = ms?.manifold;
  if (!solid) return false;
  if (typeof solid.isEmpty === 'function' && solid.isEmpty()) return false;
  if (typeof solid.status === 'function') {
    const status = solid.status();
    const code = typeof status === 'number' ? status : Number(status?.value ?? status);
    if (!Number.isNaN(code) && code !== 0) return false;
  }
  return true;
}

export function makeRepairOps(_module: ManifoldModule): KernelRepairOps {
  return {
    isValid: (shape) => isWellFormed(shape),
    isValidStrict: (shape) => isWellFormed(shape),
    healSolid: (shape) => (isWellFormed(shape) ? shape : null),
    healFace: (shape) => shape,
    healWire: (wire) => wire,
    mergeCoincidentVertices: () => 0,
    removeDegenerateEdges: () => 0,
    fixFaceOrientations: () => 0,
    fixShape: (shape) => shape,
    fixSelfIntersection: (wire) => wire,
  };
}
