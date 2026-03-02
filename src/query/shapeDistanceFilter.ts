/**
 * Shared distance-from-point filter used by edge, face, and vertex finders.
 */

import type { Vec3 } from '../core/types.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { getKernel } from '../kernel/index.js';
import type { Predicate } from './finderCore.js';

/**
 * Create a predicate that checks whether a shape element's minimum distance
 * from `point` equals `distance` (within `tolerance`).
 *
 * Uses the kernel's `distance()` method to compute minimum distance,
 * with a vertex constructed at the reference point.
 */
export function distanceFromPointFilter<T extends AnyShape>(
  distance: number,
  point: Vec3,
  tolerance: number
): Predicate<T> {
  // Create a vertex at the reference point for distance calculations.
  const kernel = getKernel();
  const vtx = kernel.makeVertex(point[0], point[1], point[2]);

  return (element: T): boolean => {
    const d = kernel.distance(vtx, element.wrapped).value;
    return Math.abs(d - distance) < tolerance;
  };
}
