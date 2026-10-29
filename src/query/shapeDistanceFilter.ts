/**
 * Shared distance-from-point filter used by edge, face, and vertex finders.
 */

import type { Vec3 } from '@/core/types.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { getKernel } from '@/kernel/index.js';
import type { Predicate } from './finderCore.js';

/**
 * Create a predicate that checks whether a shape element's minimum distance
 * from `point` equals `distance` (within `tolerance`).
 *
 * Uses the kernel's `distance()` method to compute minimum distance,
 * with a vertex constructed at the reference point.
 */
export function distanceFromPointFilter<T extends AnyShape<Dimension>>(
  distance: number,
  point: Vec3,
  tolerance: number
): Predicate<T> {
  // A finder has no disposal hook, so a vertex built up front would outlive it.
  // Build one per check and release it straight away.
  return (element: T): boolean => {
    const kernel = getKernel();
    const vtx = kernel.makeVertex(point[0], point[1], point[2]);
    try {
      const d = kernel.distance(vtx, element.wrapped).value;
      return Math.abs(d - distance) < tolerance;
    } finally {
      kernel.dispose(vtx);
    }
  };
}
