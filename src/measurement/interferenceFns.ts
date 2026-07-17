/**
 * Interference detection between shapes.
 *
 * Uses the kernel distance API to detect collisions, contact,
 * and proximity between shape pairs.
 */

import { getKernel } from '@/kernel/index.js';
import type { Vec3 } from '@/core/types.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { type Result, ok, err, unwrap } from '@/core/result.js';
import { validationError, BrepErrorCode } from '@/core/errors.js';
import { getBounds, type Bounds3D } from '@/topology/shapeFns.js';
import { withArenaCheckpoint } from '@/core/disposal.js';
import { wasmIndex } from '@/utils/vec3.js';

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
  shape1: AnyShape<Dimension>,
  shape2: AnyShape<Dimension>,
  tolerance = 1e-6
): Result<InterferenceResult> {
  if (getKernel().isNull(shape1.wrapped)) {
    return err(
      validationError(
        BrepErrorCode.NULL_SHAPE_INPUT,
        'checkInterference: first shape is a null shape'
      )
    );
  }
  if (getKernel().isNull(shape2.wrapped)) {
    return err(
      validationError(
        BrepErrorCode.NULL_SHAPE_INPUT,
        'checkInterference: second shape is a null shape'
      )
    );
  }

  // The kernel's distance computation leaves internal scratch handles brepjs
  // holds no reference to — a per-call arena residue that compounds to O(N^2)
  // across checkAllInterferences. We return only plain data (distance + points),
  // so bulk-freeing the whole call with a checkpoint is safe and keeps the arena
  // flat even under heavy pairwise batches.
  return withArenaCheckpoint(() => {
    const dist = getKernel().distance(shape1.wrapped, shape2.wrapped);
    return ok({
      hasInterference: dist.value <= tolerance,
      minDistance: dist.value,
      pointOnShape1: dist.point1,
      pointOnShape2: dist.point2,
    });
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
  shapes: ReadonlyArray<AnyShape<Dimension>>,
  tolerance = 1e-6
): InterferencePair[] {
  const pairs: InterferencePair[] = [];

  // Pre-compute bounding boxes for cheap AABB rejection
  const boxes = shapes.map((s) => getBounds(s));

  shapes.forEach((si, i) => {
    for (let j = i + 1; j < shapes.length; j++) {
      if (aabbDisjoint(wasmIndex(boxes, i), wasmIndex(boxes, j), tolerance)) continue;
      const result = unwrap(checkInterference(si, wasmIndex(shapes, j), tolerance));
      if (result.hasInterference) {
        pairs.push({ i, j, result });
      }
    }
  });

  return pairs;
}

/** Fast AABB disjointness check — returns true if boxes are separated by more than tolerance. */
function aabbDisjoint(a: Bounds3D, b: Bounds3D, tolerance: number): boolean {
  return (
    a.xMax + tolerance < b.xMin ||
    b.xMax + tolerance < a.xMin ||
    a.yMax + tolerance < b.yMin ||
    b.yMax + tolerance < a.yMin ||
    a.zMax + tolerance < b.zMin ||
    b.zMax + tolerance < a.zMin
  );
}
