import { bug } from '@/core/errors.js';
import { getKernel2D } from '@/kernel/index.js';
import { Curve2D } from './curve2D.js';
import { samePoint } from './vectorOperations.js';

/**
 * Approximate a 2D curve as a B-spline via the kernel's
 * `approximateCurve2dAsBSpline` method.
 *
 * @param curve - The source `Curve2D` to approximate.
 * @param tolerance - Maximum deviation from the original curve.
 * @param continuity - Required geometric continuity of the result.
 * @param maxSegments - Maximum number of B-spline spans.
 *
 * @example
 * ```ts
 * const bspline = approximateAsBSpline(curve, 1e-4, 'C1');
 * ```
 */
export const approximateAsBSpline = (
  curve: Curve2D,
  tolerance = 1e-4,
  continuity: 'C0' | 'C1' | 'C2' | 'C3' = 'C0',
  maxSegments = 200
): Curve2D => {
  const kernel = getKernel2D();
  const handle = kernel.approximateCurve2dAsBSpline(
    curve.wrapped,
    tolerance,
    continuity,
    maxSegments
  );
  return new Curve2D(handle);
};

/**
 * Decompose a B-spline curve into an array of Bezier arcs.
 *
 * @param curve - A `Curve2D` whose type must be `BSPLINE_CURVE`.
 * @returns An array of Bezier `Curve2D` segments covering the original B-spline.
 */
export const BSplineToBezier = (curve: Curve2D): Curve2D[] => {
  if (curve.geomType !== 'BSPLINE_CURVE') bug('BSplineToBezier', 'You can only convert a Bspline');

  const kernel = getKernel2D();
  const handles = kernel.decomposeBSpline2dToBeziers(curve.wrapped);
  return handles.map((h) => new Curve2D(h));
};

/** Options for SVG-compatible curve approximation. */
export interface ApproximationOptions {
  /** Maximum deviation from the original curve. */
  tolerance?: number;
  /** Required geometric continuity. */
  continuity?: 'C0' | 'C1' | 'C2' | 'C3';
  /** Maximum number of B-spline spans. */
  maxSegments?: number;
}

/**
 * Convert an array of curves to SVG-compatible primitives (lines, arcs, and
 * degree-1/2/3 Bezier curves).
 *
 * Higher-degree B-splines are decomposed into Bezier arcs and recursively
 * processed. Full circles/ellipses are split at the midpoint so they can be
 * represented as two SVG arcs.
 *
 * @example
 * ```ts
 * const svgCurves = approximateAsSvgCompatibleCurve(curves, { tolerance: 1e-5 });
 * ```
 */
export function approximateAsSvgCompatibleCurve(
  curves: Curve2D[],
  options: ApproximationOptions = {
    tolerance: 1e-4,
    continuity: 'C0',
    maxSegments: 300,
  }
): Curve2D[] {
  const kernel = getKernel2D();

  return curves.flatMap((curve) => {
    const curveType = curve.geomType;

    if (
      curveType === 'ELLIPSE' ||
      (curveType === 'CIRCLE' && samePoint(curve.firstPoint, curve.lastPoint))
    ) {
      return curve.splitAt([0.5]);
    }

    if (['LINE', 'ELLIPSE', 'CIRCLE'].includes(curveType)) {
      return curve;
    }

    if (curveType === 'BEZIER_CURVE') {
      const deg = kernel.getCurve2dBezierDegree(curve.wrapped);

      if (deg !== null && [1, 2, 3].includes(deg)) {
        return curve;
      }
    }

    if (curveType === 'BSPLINE_CURVE') {
      const c = BSplineToBezier(curve);
      return approximateAsSvgCompatibleCurve(c, options);
    }

    const bspline = approximateAsBSpline(
      curve,
      options.tolerance,
      options.continuity,
      options.maxSegments
    );
    return approximateAsSvgCompatibleCurve(BSplineToBezier(bspline), options);
  });
}
