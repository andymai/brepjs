/**
 * Interference detection between shapes.
 *
 * Uses BRepExtrema_DistShapeShape to detect collisions, contact,
 * and proximity between shape pairs.
 */

import { getKernel } from '../kernel/index.js';
import { gcWithScope } from '../core/disposal.js';
import type { Vec3 } from '../core/types.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { type Result, ok, err, unwrap } from '../core/result.js';
import { computationError } from '../core/errors.js';

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
  const oc = getKernel().oc;
  const r = gcWithScope();

  const distTool = r(new oc.BRepExtrema_DistShapeShape_1());
  distTool.LoadS1(shape1.wrapped);
  distTool.LoadS2(shape2.wrapped);
  const progress = r(new oc.Message_ProgressRange_1());
  distTool.Perform(progress);

  if (!distTool.IsDone()) {
    return err(computationError('INTERFERENCE_FAILED', 'BRepExtrema_DistShapeShape failed'));
  }

  const minDistance = distTool.Value() as number;

  const p1 = distTool.PointOnShape1(1);
  const p2 = distTool.PointOnShape2(1);

  const result: InterferenceResult = {
    hasInterference: minDistance <= tolerance,
    minDistance,
    pointOnShape1: [p1.X(), p1.Y(), p1.Z()],
    pointOnShape2: [p2.X(), p2.Y(), p2.Z()],
  };

  p1.delete();
  p2.delete();

  return ok(result);
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
