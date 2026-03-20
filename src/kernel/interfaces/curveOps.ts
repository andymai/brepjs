/**
 * KernelCurveOps — curve geometry queries, adaptor, and NURBS manipulation.
 *
 * Covers curve type identification, parameter evaluation, tangent computation,
 * periodicity queries, B-spline degree/knot manipulation, Bezier pole
 * extraction, and curve adaptor creation. Analogous to OCCT's
 * BRepAdaptor_Curve and Geom_BSplineCurve packages.
 *
 * @see {@link KernelSurfaceOps} for surface geometry queries.
 */

import type { KernelShape, KernelType } from '@/kernel/types.js';

export interface KernelCurveOps {
  // --- Edge / curve queries ---
  /** Get the geometric curve type (LINE, CIRCLE, BSPLINE, etc.). */
  curveType(shape: KernelShape): string;
  curveParameters(shape: KernelShape): [number, number];
  /** Evaluate a point at a raw parameter value on a curve. */
  curvePointAtParam(shape: KernelShape, param: number): [number, number, number];
  curveTangent(
    shape: KernelShape,
    param: number
  ): { point: [number, number, number]; tangent: [number, number, number] };
  /** Check if a curve is closed. */
  curveIsClosed(shape: KernelShape): boolean;
  /** Check if a curve is periodic. */
  curveIsPeriodic(shape: KernelShape): boolean;
  /** Get the period of a periodic curve. */
  curvePeriod(shape: KernelShape): number;

  // --- Curve construction (interpolation/approximation) ---
  interpolatePoints(
    points: [number, number, number][],
    options?: { periodic?: boolean; tolerance?: number }
  ): KernelShape;
  approximatePoints(
    points: [number, number, number][],
    options?: {
      tolerance?: number;
      degMin?: number;
      degMax?: number;
      smoothing?: [number, number, number] | null;
    }
  ): KernelShape;

  // --- NURBS curve operations ---
  /** Elevate the degree of a NURBS edge curve. */
  curveDegreeElevate(edge: KernelShape, elevateBy: number): KernelShape;
  /** Insert a knot into a NURBS edge curve. */
  curveKnotInsert(edge: KernelShape, knot: number, times: number): KernelShape;
  /** Remove a knot from a NURBS edge curve. */
  curveKnotRemove(edge: KernelShape, knot: number, tolerance: number): KernelShape;
  /** Split a NURBS edge curve at a parameter. Returns two edges. */
  curveSplit(edge: KernelShape, param: number): [KernelShape, KernelShape];

  // --- Curve adaptor ---
  /** Create a BRepAdaptor for curve evaluation (CompCurve for wires, Curve for edges). */
  createCurveAdaptor(shape: KernelShape): KernelType;

  // --- Bezier pole extraction (3D) ---
  /** Get the second-to-last Bezier control pole of a 3D edge curve. */
  getBezierPenultimatePole(edge: KernelShape): [number, number, number] | null;
}
