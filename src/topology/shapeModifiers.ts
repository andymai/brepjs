/**
 * Shape modifier types for fillet/chamfer operations.
 */

import type { EdgeFinderFn, FaceFinderFn } from '../query/finderFns.js';
import type { Edge } from '../core/shapeTypes.js';

// ---------------------------------------------------------------------------
// Fillet / Chamfer types
// ---------------------------------------------------------------------------

/**
 * A chamfer radius specification.
 *
 * - A number for symmetric chamfer.
 * - Two distances for asymmetric chamfer (first distance for the selected face).
 * - A distance and angle for asymmetric chamfer.
 */
export type ChamferRadius =
  | number
  | {
      distances: [number, number];
      selectedFace: (f: FaceFinderFn) => FaceFinderFn;
    }
  | {
      distance: number;
      angle: number;
      selectedFace: (f: FaceFinderFn) => FaceFinderFn;
    };

export type FilletRadius = number | [number, number];

/**
 * A generic way to define radii for fillet or chamfer operations.
 */
export type RadiusOptions<R = number> =
  | ((e: Edge) => R | null)
  | R
  | { filter: EdgeFinderFn; radius: R; keep?: boolean };

/** @deprecated Use RadiusOptions instead. Will be removed in v8.0.0. */
export type RadiusConfig<R = number> = RadiusOptions<R>;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isNumber(r: unknown): r is number {
  return typeof r === 'number';
}

export function isChamferRadius(r: unknown): r is ChamferRadius {
  if (typeof r === 'number') return true;
  if (typeof r === 'object' && r !== null) {
    const obj = r as Record<string, unknown>;
    return (
      ('distances' in obj && Array.isArray(obj['distances']) && 'selectedFace' in obj) ||
      ('distance' in obj && 'angle' in obj && 'selectedFace' in obj)
    );
  }
  return false;
}

export function isFilletRadius(r: unknown): r is FilletRadius {
  if (typeof r === 'number') return true;
  if (Array.isArray(r) && r.length === 2) {
    return r.every(isNumber);
  }
  return false;
}
