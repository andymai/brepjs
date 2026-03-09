/**
 * Curve and 1D shape functions — functional replacements for _1DShape/Curve methods.
 * All functions accept branded Edge or Wire handles and return plain values.
 */

import { getKernel } from '../kernel/index.js';
import type { Vec3 } from '../core/types.js';
import type { Dimension, Edge, Wire } from '../core/shapeTypes.js';
import { castShape } from '../core/shapeTypes.js';
import type { CurveType } from '../core/definitionMaps.js';
import { type Result, ok, err } from '../core/result.js';
import { typeCastError } from '../core/errors.js';
import { isWire as isWireGuard, isEdge } from '../core/shapeTypes.js';

// ---------------------------------------------------------------------------
// Curve properties
// ---------------------------------------------------------------------------

/**
 * Get the geometric curve type of an edge or wire (LINE, CIRCLE, BSPLINE, etc.).
 */
export function getCurveType(shape: Edge<Dimension> | Wire<Dimension>): CurveType {
  return getKernel().curveType(shape.wrapped) as CurveType;
}

/** Get the start point of a curve. */
export function curveStartPoint(shape: Edge<Dimension> | Wire<Dimension>): Vec3 {
  const [first] = getKernel().curveParameters(shape.wrapped);
  return getKernel().curvePointAtParam(shape.wrapped, first);
}

/** Get the end point of a curve. */
export function curveEndPoint(shape: Edge<Dimension> | Wire<Dimension>): Vec3 {
  const [, last] = getKernel().curveParameters(shape.wrapped);
  return getKernel().curvePointAtParam(shape.wrapped, last);
}

/**
 * Get a point at a normalized parameter position on the curve.
 * @param shape - Edge or wire to evaluate.
 * @param position - Normalized parameter (0 = start, 0.5 = midpoint, 1 = end).
 */
export function curvePointAt(shape: Edge<Dimension> | Wire<Dimension>, position = 0.5): Vec3 {
  const [first, last] = getKernel().curveParameters(shape.wrapped);
  const param = first + (last - first) * position;
  return getKernel().curvePointAtParam(shape.wrapped, param);
}

/**
 * Get the tangent vector at a normalized parameter position on the curve.
 * @param shape - Edge or wire to evaluate.
 * @param position - Normalized parameter (0 = start, 0.5 = midpoint, 1 = end).
 */
export function curveTangentAt(shape: Edge<Dimension> | Wire<Dimension>, position = 0.5): Vec3 {
  const [first, last] = getKernel().curveParameters(shape.wrapped);
  const param = first + (last - first) * position;
  return getKernel().curveTangent(shape.wrapped, param).tangent;
}

/** Get the arc length of an edge or wire. */
export function curveLength(shape: Edge<Dimension> | Wire<Dimension>): number {
  return getKernel().length(shape.wrapped);
}

/** Check if the curve is closed. */
export function curveIsClosed(shape: Edge<Dimension> | Wire<Dimension>): boolean {
  return getKernel().curveIsClosed(shape.wrapped);
}

/** Check if the curve is periodic. */
export function curveIsPeriodic(shape: Edge<Dimension> | Wire<Dimension>): boolean {
  return getKernel().curveIsPeriodic(shape.wrapped);
}

/** Get the period of a periodic curve. */
export function curvePeriod(shape: Edge<Dimension> | Wire<Dimension>): number {
  return getKernel().curvePeriod(shape.wrapped);
}

/** Get the topological orientation of an edge or wire. */
export function getOrientation(shape: Edge<Dimension> | Wire<Dimension>): 'forward' | 'backward' {
  const orient = getKernel().shapeOrientation(shape.wrapped);
  return orient === 'forward' ? 'forward' : 'backward';
}

/** Flip the orientation of an edge or wire. Returns a new shape with the same dimension. */
export function flipOrientation<D extends Dimension>(shape: Edge<D> | Wire<D>): Edge<D> | Wire<D> {
  return castShape<D>(getKernel().reverseShape(shape.wrapped)) as Edge<D> | Wire<D>;
}

// ---------------------------------------------------------------------------
// BSpline from points
// ---------------------------------------------------------------------------

/** Options for BSpline interpolation through points. */
export interface InterpolateCurveOptions {
  /** If true, create a periodic (closed) BSpline. */
  periodic?: boolean;
  /** Fitting tolerance (default varies by kernel). */
  tolerance?: number;
}

/** Options for BSpline approximation through points. */
export interface ApproximateCurveOptions {
  /** Maximum deviation from the input points. */
  tolerance?: number;
  /** Minimum BSpline degree. */
  degMin?: number;
  /** Maximum BSpline degree. */
  degMax?: number;
  /** Smoothing weights `[weight1, weight2, weight3]` or null to disable. */
  smoothing?: [number, number, number] | null;
}

/**
 * Interpolate a smooth BSpline curve that passes exactly through the given points.
 *
 * @param points - At least 2 points defining the curve path.
 * @param options - Interpolation options.
 * @returns An Edge representing the interpolated curve.
 */
export function interpolateCurve(
  points: Vec3[],
  options: InterpolateCurveOptions = {}
): Result<Edge> {
  if (points.length < 2) {
    return err(typeCastError('INTERPOLATE_MIN_POINTS', 'Interpolation requires at least 2 points'));
  }

  try {
    const result = getKernel().interpolatePoints(points as [number, number, number][], options);
    const cast = castShape(result);
    if (!isEdge(cast)) {
      return err(typeCastError('INTERPOLATE_NOT_EDGE', 'Interpolation did not produce an edge'));
    }
    return ok(cast);
  } catch (e) {
    return err(
      typeCastError(
        'INTERPOLATE_FAILED',
        `Interpolation failed: ${e instanceof Error ? e.message : String(e)}`
      )
    );
  }
}

/**
 * Approximate a BSpline curve that passes near the given points.
 *
 * @param points - At least 2 points defining the curve path.
 * @param options - Approximation options.
 * @returns An Edge representing the approximated curve.
 */
export function approximateCurve(
  points: Vec3[],
  options: ApproximateCurveOptions = {}
): Result<Edge> {
  if (points.length < 2) {
    return err(typeCastError('APPROXIMATE_MIN_POINTS', 'Approximation requires at least 2 points'));
  }

  try {
    const result = getKernel().approximatePoints(points as [number, number, number][], options);
    const cast = castShape(result);
    if (!isEdge(cast)) {
      return err(typeCastError('APPROXIMATE_NOT_EDGE', 'Approximation did not produce an edge'));
    }
    return ok(cast);
  } catch (e) {
    return err(
      typeCastError(
        'APPROXIMATE_FAILED',
        `Approximation failed: ${e instanceof Error ? e.message : String(e)}`
      )
    );
  }
}

// ---------------------------------------------------------------------------
// 2D wire offset
// ---------------------------------------------------------------------------

/**
 * Offset a wire in 2D. Returns a new wire. Does NOT dispose the input.
 *
 * @param wire - The wire to offset.
 * @param offset - Offset distance (positive = outward, negative = inward).
 * @param kind - Join type for offset corners ('arc', 'intersection', or 'tangent').
 * @returns Ok with the offset wire, or Err if the operation fails.
 */
export function offsetWire2D(
  wire: Wire<Dimension>,
  offset: number,
  kind: 'arc' | 'intersection' | 'tangent' | 'chamfer' = 'arc'
): Result<Wire> {
  const joinMap: Record<string, 'arc' | 'intersection' | 'tangent'> = {
    arc: 'arc',
    intersection: 'intersection',
    tangent: 'tangent',
    chamfer: 'intersection', // sharp/miter corners
  };
  const resultShape = getKernel().offsetWire2D(wire.wrapped, offset, joinMap[kind]);
  const wrapped = castShape(resultShape);

  if (!isWireGuard(wrapped)) {
    wrapped[Symbol.dispose]();
    return err(typeCastError('OFFSET_NOT_WIRE', 'Offset did not produce a Wire'));
  }
  return ok(wrapped);
}
