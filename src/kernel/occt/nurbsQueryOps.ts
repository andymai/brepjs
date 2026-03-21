/**
 * NURBS read-only introspection operations for OCCT.
 *
 * Extracts BSpline curve and surface data from edges and faces via
 * BRepAdaptor and Geom_BSplineCurve / Geom_BSplineSurface.
 */

import type {
  KernelInstance,
  KernelShape,
  NurbsCurveData,
  NurbsSurfaceData,
} from '@/kernel/types.js';

/**
 * Extract NURBS curve data from a BSpline or Bezier edge.
 * Returns null for non-BSpline curve types (line, circle, etc.).
 */
export function getNurbsCurveData(oc: KernelInstance, edge: KernelShape): NurbsCurveData | null {
  const adaptor = new oc.BRepAdaptor_Curve_2(edge);
  try {
    const curveTypeVal = adaptor.GetType();
    const curveIdx =
      typeof curveTypeVal === 'number' ? curveTypeVal : Number(curveTypeVal?.value ?? curveTypeVal);
    const ct = oc.GeomAbs_CurveType;
    const bsplineCurveIdx =
      typeof ct.GeomAbs_BSplineCurve === 'number'
        ? ct.GeomAbs_BSplineCurve
        : Number(ct.GeomAbs_BSplineCurve?.value ?? ct.GeomAbs_BSplineCurve);
    const bezierCurveIdx =
      typeof ct.GeomAbs_BezierCurve === 'number'
        ? ct.GeomAbs_BezierCurve
        : Number(ct.GeomAbs_BezierCurve?.value ?? ct.GeomAbs_BezierCurve);
    if (curveIdx !== bsplineCurveIdx && curveIdx !== bezierCurveIdx) {
      return null;
    }

    // For Bezier curves, OCCT can convert to BSpline via adaptor.BSpline()
    const bsplineHandle = adaptor.BSpline();
    const bspline = bsplineHandle.get();

    const degree = bspline.Degree();
    const nbPoles = bspline.NbPoles();
    const nbKnots = bspline.NbKnots();
    const isPeriodic = bspline.IsPeriodic();
    const isRational = bspline.IsRational();

    // Extract poles (1-based indexing)
    const poles: [number, number, number][] = [];
    for (let i = 1; i <= nbPoles; i++) {
      const pnt = bspline.Pole(i);
      poles.push([pnt.X(), pnt.Y(), pnt.Z()]);
      pnt.delete();
    }

    // Extract weights (1-based indexing)
    const weights: number[] = [];
    for (let i = 1; i <= nbPoles; i++) {
      weights.push(bspline.Weight(i));
    }

    // Extract knots and multiplicities (1-based indexing)
    const knots: number[] = [];
    const multiplicities: number[] = [];
    for (let i = 1; i <= nbKnots; i++) {
      knots.push(bspline.Knot(i));
      multiplicities.push(bspline.Multiplicity(i));
    }

    const result = {
      degree,
      poles,
      weights,
      knots,
      multiplicities,
      isPeriodic,
      isRational,
    };
    bsplineHandle.delete();
    return result;
  } catch {
    return null;
  } finally {
    adaptor.delete();
  }
}

/**
 * Extract NURBS surface data from a BSpline face.
 * Returns null for non-BSpline surface types (plane, cylinder, Bezier, etc.).
 */
// brepjs-patterns-disable: max-function-lines
export function getNurbsSurfaceData(
  oc: KernelInstance,
  face: KernelShape
): NurbsSurfaceData | null {
  const adaptor = new oc.BRepAdaptor_Surface_2(face, false);
  try {
    const surfTypeVal = adaptor.GetType();
    const surfIdx =
      typeof surfTypeVal === 'number' ? surfTypeVal : Number(surfTypeVal?.value ?? surfTypeVal);
    const st = oc.GeomAbs_SurfaceType;
    const bsplineIdx =
      typeof st.GeomAbs_BSplineSurface === 'number'
        ? st.GeomAbs_BSplineSurface
        : Number(st.GeomAbs_BSplineSurface?.value ?? st.GeomAbs_BSplineSurface);
    if (surfIdx !== bsplineIdx) {
      return null;
    }

    const bsplineHandle = adaptor.BSpline();
    const bspline = bsplineHandle.get();

    const degreeU = bspline.UDegree();
    const degreeV = bspline.VDegree();
    const nbPolesU = bspline.NbUPoles();
    const nbPolesV = bspline.NbVPoles();
    const isPeriodicU = bspline.IsUPeriodic();
    const isPeriodicV = bspline.IsVPeriodic();
    const isRational = bspline.IsURational() || bspline.IsVRational();

    // Extract poles (1-based, row-major: poles[uIdx][vIdx])
    const poles: [number, number, number][][] = [];
    const weights: number[][] = [];
    for (let u = 1; u <= nbPolesU; u++) {
      const poleRow: [number, number, number][] = [];
      const weightRow: number[] = [];
      for (let v = 1; v <= nbPolesV; v++) {
        const pnt = bspline.Pole(u, v);
        poleRow.push([pnt.X(), pnt.Y(), pnt.Z()]);
        pnt.delete();
        weightRow.push(bspline.Weight(u, v));
      }
      poles.push(poleRow);
      weights.push(weightRow);
    }

    // Extract U knots and multiplicities (1-based)
    const nbUKnots = bspline.NbUKnots();
    const knotsU: number[] = [];
    const multiplicitiesU: number[] = [];
    for (let i = 1; i <= nbUKnots; i++) {
      knotsU.push(bspline.UKnot(i));
      multiplicitiesU.push(bspline.UMultiplicity(i));
    }

    // Extract V knots and multiplicities (1-based)
    const nbVKnots = bspline.NbVKnots();
    const knotsV: number[] = [];
    const multiplicitiesV: number[] = [];
    for (let i = 1; i <= nbVKnots; i++) {
      knotsV.push(bspline.VKnot(i));
      multiplicitiesV.push(bspline.VMultiplicity(i));
    }

    const result = {
      degreeU,
      degreeV,
      nbPolesU,
      nbPolesV,
      poles,
      weights,
      knotsU,
      knotsV,
      multiplicitiesU,
      multiplicitiesV,
      isPeriodicU,
      isPeriodicV,
      isRational,
    };
    bsplineHandle.delete();
    return result;
  } catch {
    return null;
  } finally {
    adaptor.delete();
  }
}
