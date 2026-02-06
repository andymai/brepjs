import type { OcType } from '../../kernel/types.js';
import { getKernel } from '../../kernel/index.js';
import { gcWithScope } from '../../core/disposal.js';
import { Curve2D } from './Curve2D.js';
import type { Point2D } from './definitions.js';
import { samePoint } from './vectorOperations.js';
import { type Result, ok, err } from '../../core/result.js';
import { computationError } from '../../core/errors.js';

function* pointsIteration(intersector: OcType): Generator<Point2D> {
  const nPoints = intersector.NbPoints();
  if (!nPoints) return;

  for (let i = 1; i <= nPoints; i++) {
    const point = intersector.Point(i);
    yield [point.X(), point.Y()];
  }
}

function* commonSegmentsIteration(intersector: OcType): Generator<Curve2D> {
  const nSegments = intersector.NbSegments();
  if (!nSegments) return;

  const oc = getKernel().oc;
  const r = gcWithScope();

  for (let i = 1; i <= nSegments; i++) {
    const h1 = new oc.Handle_Geom2d_Curve_1();
    const h2 = r(new oc.Handle_Geom2d_Curve_1());
    try {
      // Known OCCT bug: NbSegments() may report segments that Segment() cannot fetch.
      // This occurs with certain curve intersection configurations. We skip unfetchable
      // segments since they represent a geometry issue in OCCT, not a code error.
      // See: https://dev.opencascade.org/content/geom2dapi-intercurvecurve-nbsegments-bug
      intersector.Segment(i, h1, h2);
    } catch {
      // Skip segments that OCCT reports but cannot provide (known OCCT limitation)
      continue;
    }

    yield new Curve2D(h1);
  }
}

interface IntersectionResult {
  intersections: Point2D[];
  commonSegments: Curve2D[];
  commonSegmentsPoints: Point2D[];
}

/**
 * Compute intersection points and common segments between two 2D curves.
 *
 * Uses an early bounding-box rejection test before delegating to the OCCT
 * `Geom2dAPI_InterCurveCurve` algorithm.
 *
 * @returns `Ok` with intersection points, common segments, and the endpoints of those segments;
 *   or an error result when the OCCT intersector fails.
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

  const oc = getKernel().oc;
  const r = gcWithScope();

  const intersector = r(new oc.Geom2dAPI_InterCurveCurve_1());

  let intersections;
  let commonSegments;

  try {
    intersector.Init_1(first.wrapped, second.wrapped, precision);

    intersections = Array.from(pointsIteration(intersector));
    commonSegments = Array.from(commonSegmentsIteration(intersector));
  } catch (e) {
    return err(computationError('INTERSECTION_FAILED', 'Intersections failed between curves', e));
  }

  const segmentsAsPoints = commonSegments
    .filter((c) => samePoint(c.firstPoint, c.lastPoint, precision))
    .map((c) => c.firstPoint);

  if (segmentsAsPoints.length) {
    intersections.push(...segmentsAsPoints);
    commonSegments = commonSegments.filter((c) => !samePoint(c.firstPoint, c.lastPoint, precision));
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
  const oc = getKernel().oc;
  const r = gcWithScope();

  const intersector = r(new oc.Geom2dAPI_InterCurveCurve_1());

  let intersections;

  try {
    intersector.Init_1(curve.wrapped, curve.wrapped, precision);

    intersections = Array.from(pointsIteration(intersector));
  } catch (e) {
    return err(computationError('SELF_INTERSECTION_FAILED', 'Self intersection failed', e));
  }

  return ok(intersections);
};
