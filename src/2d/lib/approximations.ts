import type { OcType } from '../../kernel/types.js';
import { findCurveType } from '../../core/definitionMaps.js';
import { unwrap } from '../../core/result.js';
import { bug } from '../../core/errors.js';
import { getKernel } from '../../kernel/index.js';
import { gcWithScope } from '../../core/memory.js';
import { Curve2D } from './Curve2D.js';
import { samePoint } from './vectorOperations.js';

/**
 * Approximate a 2D curve as a B-spline via `Geom2dConvert_ApproxCurve`.
 *
 * @param adaptor - A `Geom2dAdaptor_Curve` wrapping the source curve.
 * @param tolerance - Maximum deviation from the original curve.
 * @param continuity - Required geometric continuity of the result.
 * @param maxSegments - Maximum number of B-spline spans.
 *
 * @example
 * ```ts
 * const bspline = approximateAsBSpline(curve.adaptor(), 1e-4, 'C1');
 * ```
 */
export const approximateAsBSpline = (
  adaptor: OcType,
  tolerance = 1e-4,
  continuity: 'C0' | 'C1' | 'C2' | 'C3' = 'C0',
  maxSegments = 200
): Curve2D => {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const continuities: Record<string, OcType> = {
    C0: oc.GeomAbs_Shape.GeomAbs_C0,
    C1: oc.GeomAbs_Shape.GeomAbs_C1,
    C2: oc.GeomAbs_Shape.GeomAbs_C2,
    C3: oc.GeomAbs_Shape.GeomAbs_C3,
  };

  const convert = r(
    new oc.Geom2dConvert_ApproxCurve_2(
      adaptor.ShallowCopy(),
      tolerance,
      continuities[continuity],
      maxSegments,
      3
    )
  );

  return new Curve2D(convert.Curve());
};

/**
 * Decompose a B-spline curve into an array of Bezier arcs.
 *
 * @param adaptor - A `Geom2dAdaptor_Curve` whose type must be `BSPLINE_CURVE`.
 * @returns An array of Bezier `Curve2D` segments covering the original B-spline.
 */
export const BSplineToBezier = (adaptor: OcType): Curve2D[] => {
  if (unwrap(findCurveType(adaptor.GetType())) !== 'BSPLINE_CURVE')
    bug('BSplineToBezier', 'You can only convert a Bspline');

  const handle = adaptor.BSpline();

  const oc = getKernel().oc;
  const convert = new oc.Geom2dConvert_BSplineCurveToBezierCurve_1(handle);

  function* bezierCurves(): Generator<Curve2D> {
    const nArcs = convert.NbArcs();
    if (!nArcs) return;

    for (let i = 1; i <= nArcs; i++) {
      const arc = convert.Arc(i);
      yield new Curve2D(arc);
    }
  }

  const curves = Array.from(bezierCurves());
  convert.delete();
  return curves;
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
  const r = gcWithScope();

  return curves.flatMap((curve) => {
    const adaptor = r(curve.adaptor());
    const curveType = unwrap(findCurveType(adaptor.GetType()));

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
      const b = adaptor.Bezier().get();
      const deg = b.Degree();

      if ([1, 2, 3].includes(deg)) {
        return curve;
      }
    }

    if (curveType === 'BSPLINE_CURVE') {
      const c = BSplineToBezier(adaptor);
      return approximateAsSvgCompatibleCurve(c, options);
    }

    const bspline = approximateAsBSpline(
      adaptor,
      options.tolerance,
      options.continuity,
      options.maxSegments
    );
    return approximateAsSvgCompatibleCurve(BSplineToBezier(r(bspline.adaptor())), options);
  });
}
