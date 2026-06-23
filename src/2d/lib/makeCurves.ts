import { getKernel } from '@/kernel/index.js';
import { type Result, ok, err } from '@/core/result.js';
import { computationError } from '@/core/errors.js';

import type { Point2D } from './definitions.js';

import { Curve2D } from './curve2D.js';
import {
  add2d,
  distance2d,
  normalize2d,
  samePoint,
  scalarMultiply2d,
  subtract2d,
} from './vectorOperations.js';

/**
 * Creates a 2D segment curve between two points.
 *
 * @category Planar curves
 */
export const make2dSegmentCurve = (startPoint: Point2D, endPoint: Point2D): Curve2D => {
  const curve = new Curve2D(
    getKernel().makeLine2d(startPoint[0], startPoint[1], endPoint[0], endPoint[1])
  );
  if (!samePoint(curve.firstPoint, startPoint)) {
    curve.reverse();
  }
  return curve;
};

/**
 * Creates a 2D arc curve defined by three points.
 *
 * @category Planar curves
 */
export const make2dThreePointArc = (
  startPoint: Point2D,
  midPoint: Point2D,
  endPoint: Point2D
): Curve2D => {
  const handle = getKernel().makeArc2dThreePoints(
    startPoint[0],
    startPoint[1],
    midPoint[0],
    midPoint[1],
    endPoint[0],
    endPoint[1]
  );
  let curve = new Curve2D(handle);
  if (!samePoint(curve.firstPoint, startPoint)) {
    const trimmed = getKernel().trimCurve2d(
      curve.wrapped,
      curve.lastParameter,
      curve.firstParameter
    );
    curve.delete();
    curve = new Curve2D(trimmed);
  }
  return curve;
};

/**
 * Creates a 2D tangent arc curve.
 *
 * @category Planar curves
 */
export const make2dTangentArc = (
  startPoint: Point2D,
  tangent: Point2D,
  endPoint: Point2D
): Curve2D => {
  const handle = getKernel().makeArc2dTangent(
    startPoint[0],
    startPoint[1],
    tangent[0],
    tangent[1],
    endPoint[0],
    endPoint[1]
  );
  let curve = new Curve2D(handle);
  if (!samePoint(curve.firstPoint, startPoint)) {
    const trimmed = getKernel().trimCurve2d(
      curve.wrapped,
      curve.lastParameter,
      curve.firstParameter
    );
    curve.delete();
    curve = new Curve2D(trimmed);
  }
  return curve;
};

/**
 * Creates a 2D circle curve.
 *
 * @category Planar curves
 */
export const make2dCircle = (radius: number, center: Point2D = [0, 0]): Curve2D => {
  return new Curve2D(getKernel().makeCircle2d(center[0], center[1], radius, true));
};

/**
 * Creates a 2D ellipse curve.
 *
 * @category Planar curves
 */
export const make2dEllipse = (
  majorRadius: number,
  minorRadius: number,
  xDir: Point2D = [1, 0],
  center: Point2D = [0, 0],
  direct = true
): Curve2D => {
  return new Curve2D(
    getKernel().makeEllipse2d(
      center[0],
      center[1],
      majorRadius,
      minorRadius,
      xDir[0],
      xDir[1],
      direct
    )
  );
};

/**
 * Creates a 2D ellipse arc curve.
 *
 * @category Planar curves
 */
export const make2dEllipseArc = (
  majorRadius: number,
  minorRadius: number,
  startAngle: number,
  endAngle: number,
  center: Point2D = [0, 0],
  xDir: Point2D,
  direct = true
): Curve2D => {
  return new Curve2D(
    getKernel().makeEllipseArc2d(
      center[0],
      center[1],
      majorRadius,
      minorRadius,
      startAngle,
      endAngle,
      xDir[0],
      xDir[1],
      direct
    )
  );
};

/**
 * Creates a 2D Bezier curve defined by a start point, control points, and an end point.
 *
 * @category Planar curves
 */
export const make2dBezierCurve = (
  startPoint: Point2D,
  controls: Point2D[],
  endPoint: Point2D
): Curve2D => {
  const allPoints: [number, number][] = [
    [startPoint[0], startPoint[1]],
    ...controls.map((p): [number, number] => [p[0], p[1]]),
    [endPoint[0], endPoint[1]],
  ];
  return new Curve2D(getKernel().makeBezier2d(allPoints));
};

/**
 * Create a 2D interpolated B-spline curve through the given points.
 *
 * @category Planar curves
 */
export function make2dInerpolatedBSplineCurve(
  points: Point2D[],
  {
    tolerance = 1e-3,
    smoothing = null,
    degMax = 3,
    degMin = 1,
  }: {
    tolerance?: number;
    smoothing?: null | [number, number, number];
    degMax?: number;
    degMin?: number;
  } = {}
): Result<Curve2D> {
  try {
    const pts: [number, number][] = points.map((p) => [p[0], p[1]]);
    const handle = getKernel().makeBSpline2d(pts, {
      tolerance,
      smoothing: smoothing,
      degMax,
      degMin,
      continuity: 'C2',
    });
    return ok(new Curve2D(handle));
  } catch (e) {
    return err(computationError('BSPLINE_2D_FAILED', 'B-spline approximation failed', e));
  }
}

/**
 * Create a 2D arc given its endpoints and center point.
 *
 * @category Planar curves
 */
export const make2dArcFromCenter = (
  startPoint: Point2D,
  endPoint: Point2D,
  center: Point2D,
  longArc = false
) => {
  const midChord = scalarMultiply2d(add2d(startPoint, endPoint), 0.5);
  const orientedRadius = distance2d(center, startPoint) * (longArc ? -1 : 1);
  const midChordDir = normalize2d(subtract2d(midChord, center));

  return make2dThreePointArc(
    startPoint,
    add2d(scalarMultiply2d(midChordDir, orientedRadius), center),
    endPoint
  );
};
