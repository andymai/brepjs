/**
 * Curve construction operations for OCCT.
 *
 * Provides BSpline interpolation and approximation from point sets.
 */

import type { OpenCascadeInstance, OcShape, OcType } from './types.js';

export interface InterpolateOptions {
  periodic?: boolean;
  tolerance?: number;
}

export interface ApproximateOptions {
  tolerance?: number;
  degMin?: number;
  degMax?: number;
  smoothing?: [number, number, number] | null;
}

/**
 * Interpolate a BSpline curve through the given points.
 *
 * Uses GeomAPI_PointsToBSpline with tight tolerance as a high-fidelity
 * approximation, since GeomAPI_Interpolate requires TColgp_HArray1OfPnt
 * which may not be available in all WASM builds.
 */
export function interpolatePoints(
  oc: OpenCascadeInstance,
  points: [number, number, number][],
  options: InterpolateOptions = {}
): OcShape {
  const { tolerance = 1e-8 } = options;

  // Use high-precision approximation to effectively interpolate
  const pnts = new oc.TColgp_Array1OfPnt_2(1, points.length);
  let idx = 1;
  for (const pt of points) {
    const pnt = new oc.gp_Pnt_3(pt[0], pt[1], pt[2]);
    pnts.SetValue(idx++, pnt);
    pnt.delete();
  }

  const splineBuilder = new oc.GeomAPI_PointsToBSpline_2(
    pnts,
    3,
    8,
    oc.GeomAbs_Shape.GeomAbs_C2,
    tolerance
  );
  pnts.delete();

  if (!splineBuilder.IsDone()) {
    splineBuilder.delete();
    throw new Error('Interpolation failed — GeomAPI_PointsToBSpline did not converge');
  }

  const curve: OcType = splineBuilder.Curve();
  const geomHandle = new oc.Handle_Geom_Curve_2(curve.get());
  const builder = new oc.BRepBuilderAPI_MakeEdge_24(geomHandle);
  const edge = builder.Edge();

  builder.delete();
  splineBuilder.delete();
  return edge;
}

/**
 * Approximate a BSpline curve through the given points.
 * Uses GeomAPI_PointsToBSpline.
 */
export function approximatePoints(
  oc: OpenCascadeInstance,
  points: [number, number, number][],
  options: ApproximateOptions = {}
): OcShape {
  const { tolerance = 1e-3, degMin = 1, degMax = 6, smoothing = null } = options;

  const pnts = new oc.TColgp_Array1OfPnt_2(1, points.length);
  let idx = 1;
  for (const pt of points) {
    const pnt = new oc.gp_Pnt_3(pt[0], pt[1], pt[2]);
    pnts.SetValue(idx++, pnt);
    pnt.delete();
  }

  let splineBuilder: OcType;
  if (smoothing) {
    splineBuilder = new oc.GeomAPI_PointsToBSpline_5(
      pnts,
      smoothing[0],
      smoothing[1],
      smoothing[2],
      degMax,
      oc.GeomAbs_Shape.GeomAbs_C2,
      tolerance
    );
  } else {
    splineBuilder = new oc.GeomAPI_PointsToBSpline_2(
      pnts,
      degMin,
      degMax,
      oc.GeomAbs_Shape.GeomAbs_C2,
      tolerance
    );
  }

  pnts.delete();

  if (!splineBuilder.IsDone()) {
    splineBuilder.delete();
    throw new Error('Approximation failed — GeomAPI_PointsToBSpline did not converge');
  }

  const curve = splineBuilder.Curve();
  const geomHandle = new oc.Handle_Geom_Curve_2(curve.get());
  const builder = new oc.BRepBuilderAPI_MakeEdge_24(geomHandle);
  const edge = builder.Edge();

  builder.delete();
  splineBuilder.delete();
  return edge;
}
