/**
 * Direction resolution utilities shared across finder modules.
 */

import type { Vec3 } from '../core/types.js';

// ---------------------------------------------------------------------------
// Direction constants
// ---------------------------------------------------------------------------

const DIRECTIONS: Record<string, Vec3> = {
  X: [1, 0, 0],
  Y: [0, 1, 0],
  Z: [0, 0, 1],
};

/** A named axis or an explicit 3D vector. */
export type DirectionInput = 'X' | 'Y' | 'Z' | Vec3;

/** Resolve a named axis or passthrough a vector. */
export function resolveDir(dir: DirectionInput): Vec3 {
  if (typeof dir === 'string') return DIRECTIONS[dir] ?? [0, 0, 1];
  return dir;
}
