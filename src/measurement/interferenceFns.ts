/**
 * Interference detection between shapes.
 *
 * Uses the kernel distance API to detect collisions, contact,
 * and proximity between shape pairs.
 */

import { getKernel } from '../kernel/index.js';
import type { Vec3 } from '../core/types.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { type Result, ok, unwrap } from '../core/result.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InterferenceResult {
  /** True if shapes are touching or overlapping (distance ≈ 0). */
  readonly hasInterference: boolean;
  /** Minimum distance between the shapes. 0 if touching/overlapping. */
  readonly minDistance: number;
  /** Closest point on the first shape. */
  readonly pointOnShape1: Vec3;
  /** Closest point on the second shape. */
  readonly pointOnShape2: Vec3;
}

export interface InterferencePair {
  /** Index of first shape in the input array. */
  readonly i: number;
  /** Index of second shape in the input array. */
  readonly j: number;
  /** Interference result for this pair. */
  readonly result: InterferenceResult;
}

// ---------------------------------------------------------------------------
// Core detection
// ---------------------------------------------------------------------------

/**
 * Check for interference (collision/contact) between two shapes.
 *
 * Returns detailed proximity information including the minimum distance
 * and closest points. Shapes are considered interfering when their
 * minimum distance is within the given tolerance.
 */
export function checkInterference(
  shape1: AnyShape,
  shape2: AnyShape,
  tolerance = 1e-6
): Result<InterferenceResult> {
  const dist = getKernel().distance(shape1.wrapped, shape2.wrapped);

  return ok({
    hasInterference: dist.value <= tolerance,
    minDistance: dist.value,
    pointOnShape1: dist.point1,
    pointOnShape2: dist.point2,
  });
}

// ---------------------------------------------------------------------------
// Batch detection
// ---------------------------------------------------------------------------

/**
 * Check all pairs in an array of shapes for interference.
 *
 * Returns only pairs that have interference (distance within tolerance).
 * For N shapes, checks N*(N-1)/2 unique pairs.
 */
export function checkAllInterferences(
  shapes: ReadonlyArray<AnyShape>,
  tolerance = 1e-6
): InterferencePair[] {
  const pairs: InterferencePair[] = [];

  shapes.forEach((si, i) => {
    for (let j = i + 1; j < shapes.length; j++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- j is bounds-checked
      const result = unwrap(checkInterference(si, shapes[j]!, tolerance));
      if (result.hasInterference) {
        pairs.push({ i, j, result });
      }
    }
  });

  return pairs;
}
