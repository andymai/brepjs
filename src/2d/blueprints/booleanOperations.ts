/**
 * Boolean operations on 2D blueprints: fuse, cut, and intersect.
 *
 * This module is the public API. Internal logic is split across:
 * - `booleanHelpers.ts` — hashing, segment types, rotation utilities
 * - `intersectionSegments.ts` — curve intersection and segment pairing
 * - `segmentAssembly.ts` — segment selection and path assembly
 */

import Blueprint from './Blueprint.js';
import Blueprints from './Blueprints.js';
import CompoundBlueprint from './CompoundBlueprint.js';
import { booleanOperation } from './segmentAssembly.js';

// Re-export internal types and functions for backward compatibility
export type { Segment, IntersectionSegment } from './booleanHelpers.js';
export { blueprintsIntersectionSegments } from './intersectionSegments.js';

// ---------------------------------------------------------------------------
// Public boolean operations
// ---------------------------------------------------------------------------

/**
 * Compute the boolean union of two simple blueprints.
 *
 * Segments each blueprint at their intersection points, discards segments
 * inside the other shape, and reassembles the remaining curves.
 *
 * @param first - First blueprint operand.
 * @param second - Second blueprint operand.
 * @returns The fused outline, a {@link Blueprints} if the result is
 *   disjoint, or `null` if the operation produces no geometry.
 *
 * @remarks Both blueprints must be closed. For compound or multi-blueprint
 * inputs, use {@link fuse2D} instead.
 */
export function fuseBlueprints(first: Blueprint, second: Blueprint): null | Blueprint | Blueprints {
  const result = booleanOperation(first, second, {
    firstInside: 'remove',
    secondInside: 'remove',
  });

  if (result === null || result instanceof Blueprint || result instanceof Blueprints) return result;

  if (result.identical) {
    return first.clone();
  }

  if (result.firstCurveInSecond) {
    return second.clone();
  }

  if (result.secondCurveInFirst) {
    return first.clone();
  }

  return new Blueprints([first, second]);
}

/**
 * Compute the boolean difference of two simple blueprints (first minus second).
 *
 * Segments the blueprints at their intersections, keeps segments of the first
 * that are outside the second, and segments of the second that are inside the
 * first (reversed to form the boundary of the cut).
 *
 * @param first - Base blueprint to cut from.
 * @param second - Tool blueprint to subtract.
 * @returns The remaining outline, or `null` if nothing remains.
 *
 * @remarks Both blueprints must be closed. For compound inputs use {@link cut2D}.
 */
export function cutBlueprints(first: Blueprint, second: Blueprint): null | Blueprint | Blueprints {
  const result = booleanOperation(first, second, {
    firstInside: 'remove',
    secondInside: 'keep',
  });

  if (result === null || result instanceof Blueprint || result instanceof Blueprints) return result;

  if (result.identical) {
    return null;
  }

  if (result.firstCurveInSecond) {
    return null;
  }

  if (result.secondCurveInFirst) {
    return new Blueprints([new CompoundBlueprint([first, second])]);
  }

  return first.clone();
}

/**
 * Compute the boolean intersection of two simple blueprints.
 *
 * Keeps only the segments of each blueprint that lie inside the other,
 * producing the overlapping region.
 *
 * @param first - First blueprint operand.
 * @param second - Second blueprint operand.
 * @returns The intersection outline, or `null` if the blueprints do not overlap.
 *
 * @remarks Both blueprints must be closed. For compound inputs use {@link intersect2D}.
 */
export function intersectBlueprints(
  first: Blueprint,
  second: Blueprint
): null | Blueprint | Blueprints {
  const result = booleanOperation(first, second, {
    firstInside: 'keep',
    secondInside: 'keep',
  });

  if (result === null || result instanceof Blueprint || result instanceof Blueprints) return result;

  if (result.identical) {
    return first.clone();
  }

  if (result.firstCurveInSecond) {
    return first.clone();
  }

  if (result.secondCurveInFirst) {
    return second.clone();
  }

  return null;
}
