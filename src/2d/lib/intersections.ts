import { getKernel2D } from '@/kernel/index.js';
import { Curve2D } from './curve2D.js';
import type { Point2D } from './definitions.js';
import { samePoint } from './vectorOperations.js';
import { type Result, ok, err } from '@/core/result.js';
import { computationError } from '@/core/errors.js';

interface IntersectionResult {
  intersections: Point2D[];
  commonSegments: Curve2D[];
  commonSegmentsPoints: Point2D[];
}

/**
 * Compute intersection points and common segments between two 2D curves.
 *
 * Uses an early bounding-box rejection test before delegating to the kernel
 * `Geom2dAPI_InterCurveCurve` algorithm.
 *
 * @returns `Ok` with intersection points, common segments, and the endpoints of those segments;
 *   or an error result when the kernel intersector fails.
 *
 * @example
 * ```ts
 * const result = intersectCurves(circle, line);
 * if (isOk(result)) {
 *   console.log(result.value.intersections); // Point2D[]
 * }
 * ```
 */
export const intersectCurves = (
  first: Curve2D,
  second: Curve2D,
  precision = 1e-9
): Result<IntersectionResult> => {
  if (first.boundingBox.isOut(second.boundingBox))
    return ok({ intersections: [], commonSegments: [], commonSegmentsPoints: [] });

  const kernel = getKernel2D();

  let intersections: Point2D[];
  let commonSegments: Curve2D[];

  try {
    const result = kernel.intersectCurves2d(first.wrapped, second.wrapped, precision);
    intersections = result.points;
    commonSegments = result.segments.map((h) => new Curve2D(h));
  } catch (e) {
    return err(computationError('INTERSECTION_FAILED', 'Intersections failed between curves', e));
  }

  // Coincident endpoints alone do not make a common segment degenerate: a
  // closed overlap — two identical circles share their whole outline — starts
  // and ends at the same point while spanning the entire curve. Demoting on
  // the endpoints alone discards that overlap before any boolean sees it, so
  // require the midpoint to sit on the endpoints too.
  const isDegenerate = (c: Curve2D): boolean => {
    if (!samePoint(c.firstPoint, c.lastPoint, precision)) return false;
    const mid = c.value((c.firstParameter + c.lastParameter) / 2);
    return samePoint(mid, c.firstPoint, precision);
  };

  const segmentsAsPoints = commonSegments.filter(isDegenerate).map((c) => c.firstPoint);

  if (segmentsAsPoints.length) {
    intersections.push(...segmentsAsPoints);
    commonSegments = commonSegments.filter((c) => !isDegenerate(c));
  }

  const commonSegmentsPoints = commonSegments.flatMap((c) => [c.firstPoint, c.lastPoint]);

  return ok({ intersections, commonSegments, commonSegmentsPoints });
};

/**
 * Find self-intersection points on a single 2D curve.
 *
 * @returns `Ok` with the array of self-intersection points, or an error result on failure.
 */
export const selfIntersections = (curve: Curve2D, precision = 1e-9): Result<Point2D[]> => {
  const kernel = getKernel2D();

  let intersections: Point2D[];

  try {
    const result = kernel.intersectCurves2d(curve.wrapped, curve.wrapped, precision);
    intersections = result.points;
    // Clean up segment handles we don't need
    for (const seg of result.segments) {
      seg.delete();
    }
  } catch (e) {
    return err(computationError('SELF_INTERSECTION_FAILED', 'Self intersection failed', e));
  }

  return ok(intersections);
};
