/**
 * Interference detection between shapes.
 *
 * Uses the kernel distance API to detect collisions, contact,
 * and proximity between shape pairs.
 */

import { getKernel } from '../kernel/index.js';
import type { Vec3 } from '../core/types.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { type Result, ok, err, unwrap } from '../core/result.js';
import { validationError, BrepErrorCode } from '../core/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a pairwise interference check between two shapes. */
export interface InterferenceResult {
  /** True if shapes are touching or overlapping (distance within tolerance). */
  readonly hasInterference: boolean;
  /** Minimum distance between the shapes. 0 when touching or overlapping. */
  readonly minDistance: number;
  /** Closest point on the first shape as [x, y, z]. */
  readonly pointOnShape1: Vec3;
  /** Closest point on the second shape as [x, y, z]. */
  readonly pointOnShape2: Vec3;
}

/** A pair of shapes that were found to interfere during batch checking. */
export interface InterferencePair {
  /** Index of the first shape in the input array. */
  readonly i: number;
  /** Index of the second shape in the input array. */
  readonly j: number;
  /** Detailed interference result for this pair. */
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
 *
 * @param shape1 - First shape.
 * @param shape2 - Second shape.
 * @param tolerance - Distance threshold below which shapes are considered interfering. Default: 1e-6.
 * @returns A `Result` wrapping the {@link InterferenceResult}.
 *
 * @example
 * ```ts
 * const result = unwrap(checkInterference(boxA, boxB));
 * if (result.hasInterference) {
 *   console.log('Collision at distance', result.minDistance);
 * }
 * ```
 */
export function checkInterference(
  shape1: AnyShape,
  shape2: AnyShape,
  tolerance = 1e-6
): Result<InterferenceResult> {
  if (shape1.wrapped.IsNull()) {
    return err(
      validationError(
        BrepErrorCode.NULL_SHAPE_INPUT,
        'checkInterference: first shape is a null shape'
      )
    );
  }
  if (shape2.wrapped.IsNull()) {
    return err(
      validationError(
        BrepErrorCode.NULL_SHAPE_INPUT,
        'checkInterference: second shape is a null shape'
      )
    );
  }
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
 *
 * @param shapes - Array of shapes to test pairwise.
 * @param tolerance - Distance threshold for interference. Default: 1e-6.
 * @returns Array of {@link InterferencePair} entries, one per colliding pair.
 *
 * @example
 * ```ts
 * const collisions = checkAllInterferences([box, sphere, cylinder]);
 * collisions.forEach(({ i, j }) => console.log(`Shape ${i} hits shape ${j}`));
 * ```
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
