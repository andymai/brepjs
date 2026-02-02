import type { OcType } from '../../kernel/types.js';
import { getKernel } from '../../kernel/index.js';
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

  for (let i = 1; i <= nSegments; i++) {
    const h1 = new oc.Handle_Geom2d_Curve_1();
    const h2 = new oc.Handle_Geom2d_Curve_1();
    try {
      // There seem to be a bug in occt where it returns segments but fails to
      // fetch them.
      intersector.Segment(i, h1, h2);
    } catch {
      continue;
    }

    yield new Curve2D(h1);
    h2.delete();
  }
}

interface IntersectionResult {
  intersections: Point2D[];
  commonSegments: Curve2D[];
  commonSegmentsPoints: Point2D[];
}

export const intersectCurves = (
  first: Curve2D,
  second: Curve2D,
  precision = 1e-9
): Result<IntersectionResult> => {
  if (first.boundingBox.isOut(second.boundingBox))
    return ok({ intersections: [], commonSegments: [], commonSegmentsPoints: [] });

  const oc = getKernel().oc;
  const intersector = new oc.Geom2dAPI_InterCurveCurve_1();

  let intersections;
  let commonSegments;

  try {
    intersector.Init_1(first.wrapped, second.wrapped, precision);

    intersections = Array.from(pointsIteration(intersector));
    commonSegments = Array.from(commonSegmentsIteration(intersector));
  } catch (e) {
    console.error(first, second, e);
    return err(computationError('INTERSECTION_FAILED', 'Intersections failed between curves', e));
  } finally {
    intersector.delete();
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

export const selfIntersections = (curve: Curve2D, precision = 1e-9): Result<Point2D[]> => {
  const oc = getKernel().oc;
  const intersector = new oc.Geom2dAPI_InterCurveCurve_1();

  let intersections;

  try {
    intersector.Init_1(curve.wrapped, curve.wrapped, precision);

    intersections = Array.from(pointsIteration(intersector));
  } catch (e) {
    return err(computationError('SELF_INTERSECTION_FAILED', 'Self intersection failed', e));
  } finally {
    intersector.delete();
  }

  return ok(intersections);
};
