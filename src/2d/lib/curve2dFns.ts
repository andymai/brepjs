/**
 * Standalone pure functions for 2D curve operations.
 *
 * Each function wraps a corresponding {@link Curve2D} method without mutating
 * the input curve, providing a functional API for 2D geometry pipelines.
 *
 * @module
 */

import type { Point2D } from './definitions.js';
import type { BoundingBox2d } from './BoundingBox2d.js';
import type { Curve2D } from './Curve2D.js';
import type { Result } from '../../core/result.js';

/**
 * Return a reversed copy of the curve (non-mutating).
 *
 * @returns A new `Curve2D` with swapped start/end orientation.
 */
export function reverseCurve(curve: Curve2D): Curve2D {
  const cloned = curve.clone();
  cloned.reverse();
  return cloned;
}

/** Get the bounding box of a 2D curve. */
export function curve2dBoundingBox(curve: Curve2D): BoundingBox2d {
  return curve.boundingBox;
}

/** Get the first point of a 2D curve. */
export function curve2dFirstPoint(curve: Curve2D): Point2D {
  return curve.firstPoint;
}

/** Get the last point of a 2D curve. */
export function curve2dLastPoint(curve: Curve2D): Point2D {
  return curve.lastPoint;
}

/**
 * Split a curve at the given parameters or points.
 *
 * @param params - Parameter values or `Point2D` locations at which to split.
 * @returns An ordered array of sub-curves covering the original curve.
 */
export function curve2dSplitAt(
  curve: Curve2D,
  params: Point2D[] | number[],
  precision?: number
): Curve2D[] {
  return curve.splitAt(params, precision);
}

/**
 * Find the parameter on the curve closest to the given point.
 *
 * @returns `Ok(parameter)` when the point is on the curve, or an error result.
 */
export function curve2dParameter(
  curve: Curve2D,
  point: Point2D,
  precision?: number
): Result<number> {
  return curve.parameter(point, precision);
}

/**
 * Get the tangent vector at a parameter position on the curve.
 *
 * @param param - A normalized parameter (0..1) or a `Point2D` to project onto the curve.
 */
export function curve2dTangentAt(curve: Curve2D, param: number | Point2D): Point2D {
  return curve.tangentAt(param);
}

/** Check if a point lies on the curve. */
export function curve2dIsOnCurve(curve: Curve2D, point: Point2D): boolean {
  return curve.isOnCurve(point);
}

/** Compute the distance from a point to the curve. */
export function curve2dDistanceFrom(curve: Curve2D, point: Point2D): number {
  return curve.distanceFrom(point);
}
