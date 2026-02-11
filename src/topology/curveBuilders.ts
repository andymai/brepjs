/**
 * Curve construction helpers — lines, arcs, circles, ellipses, splines, and wire assembly.
 */

import type { OcType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import { localGC } from '../core/memory.js';
import { toOcPnt, toOcVec, makeOcAx2, makeOcAx3 } from '../core/occtBoundary.js';
import type { Vec3 } from '../core/types.js';
import { type Result, ok, err } from '../core/result.js';
import { validationError, occtError } from '../core/errors.js';
import type { Edge, Wire } from '../core/shapeTypes.js';
import { createEdge, createWire, isEdge, isWire } from '../core/shapeTypes.js';

/** Create a straight edge between two 3D points. */
export function makeLine(v1: Vec3, v2: Vec3): Edge {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const p1 = r(toOcPnt(v1));
  const p2 = r(toOcPnt(v2));
  const maker = r(new oc.BRepBuilderAPI_MakeEdge_3(p1, p2));
  const edge = createEdge(maker.Edge());
  gc();
  return edge;
}

/** Create a circular edge with the given radius, center, and normal. */
export function makeCircle(
  radius: number,
  center: Vec3 = [0, 0, 0],
  normal: Vec3 = [0, 0, 1]
): Edge {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const ax = r(makeOcAx2(center, normal));
  const circleGp = r(new oc.gp_Circ_2(ax, radius));
  const edgeMaker = r(new oc.BRepBuilderAPI_MakeEdge_8(circleGp));
  const shape = createEdge(edgeMaker.Edge());
  gc();

  return shape;
}

/**
 * Create an elliptical edge with the given radii.
 *
 * @param xDir - Optional direction for the major axis.
 * @returns An error if `minorRadius` exceeds `majorRadius`.
 */
export function makeEllipse(
  majorRadius: number,
  minorRadius: number,
  center: Vec3 = [0, 0, 0],
  normal: Vec3 = [0, 0, 1],
  xDir?: Vec3
): Result<Edge> {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const ax = r(makeOcAx2(center, normal, xDir));

  if (minorRadius > majorRadius) {
    gc();
    return err(
      validationError('ELLIPSE_RADII', 'The minor radius must be smaller than the major one')
    );
  }
  const ellipseGp = r(new oc.gp_Elips_2(ax, majorRadius, minorRadius));
  const edgeMaker = r(new oc.BRepBuilderAPI_MakeEdge_12(ellipseGp));
  const shape = createEdge(edgeMaker.Edge());
  gc();

  return ok(shape);
}

/**
 * Create a helical wire with the given pitch, height, and radius.
 *
 * @param pitch - Vertical distance per full turn.
 * @param lefthand - Wind the helix in the left-hand direction.
 */
export function makeHelix(
  pitch: number,
  height: number,
  radius: number,
  center: Vec3 = [0, 0, 0],
  dir: Vec3 = [0, 0, 1],
  lefthand = false
): Wire {
  const oc = getKernel().oc;
  const [r, gc] = localGC();
  const angularStep = lefthand ? -2 * Math.PI : 2 * Math.PI;

  const geomLine = r(
    new oc.Geom2d_Line_3(r(new oc.gp_Pnt2d_3(0.0, 0.0)), r(new oc.gp_Dir2d_4(angularStep, pitch)))
  );

  const nTurns = height / pitch;
  const uStart = r(geomLine.Value(0.0));
  const uStop = r(geomLine.Value(nTurns * Math.sqrt((2 * Math.PI) ** 2 + pitch ** 2)));
  const geomSeg = r(new oc.GCE2d_MakeSegment_1(uStart, uStop));

  // We do not GC this surface (or it can break for some reason)
  const geomSurf = new oc.Geom_CylindricalSurface_1(r(makeOcAx3(center, dir)), radius);

  const e = r(
    new oc.BRepBuilderAPI_MakeEdge_30(
      r(new oc.Handle_Geom2d_Curve_2(geomSeg.Value().get())),
      r(new oc.Handle_Geom_Surface_2(geomSurf))
    )
  ).Edge();

  const w = r(new oc.BRepBuilderAPI_MakeWire_2(e)).Wire();
  oc.BRepLib.BuildCurves3d_2(w);

  gc();

  return createWire(w);
}

/**
 * Create a circular arc edge passing through three points.
 *
 * @param v1 - Start point.
 * @param v2 - Mid point (on the arc).
 * @param v3 - End point.
 */
export function makeThreePointArc(v1: Vec3, v2: Vec3, v3: Vec3): Edge {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const p1 = r(toOcPnt(v1));
  const p2 = r(toOcPnt(v2));
  const p3 = r(toOcPnt(v3));
  const arcMaker = r(new oc.GC_MakeArcOfCircle_4(p1, p2, p3));
  const circleGeom = r(arcMaker.Value());

  const curve = r(new oc.Handle_Geom_Curve_2(circleGeom.get()));
  const edgeMaker = r(new oc.BRepBuilderAPI_MakeEdge_24(curve));
  const edge = createEdge(edgeMaker.Edge());
  gc();
  return edge;
}

/**
 * Create an elliptical arc edge between two angles.
 *
 * @param startAngle - Start angle in radians.
 * @param endAngle - End angle in radians.
 * @param xDir - Optional direction for the major axis.
 * @returns An error if `minorRadius` exceeds `majorRadius`.
 */
export function makeEllipseArc(
  majorRadius: number,
  minorRadius: number,
  startAngle: number,
  endAngle: number,
  center: Vec3 = [0, 0, 0],
  normal: Vec3 = [0, 0, 1],
  xDir?: Vec3
): Result<Edge> {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const ax = r(makeOcAx2(center, normal, xDir));
  if (minorRadius > majorRadius) {
    gc();
    return err(
      validationError('ELLIPSE_RADII', 'The minor radius must be smaller than the major one')
    );
  }

  const ellipseGp = r(new oc.gp_Elips_2(ax, majorRadius, minorRadius));
  const edgeMaker = r(new oc.BRepBuilderAPI_MakeEdge_13(ellipseGp, startAngle, endAngle));
  const shape = createEdge(edgeMaker.Edge());
  gc();

  return ok(shape);
}

/** Configuration for {@link makeBSplineApproximation}. */
export interface BSplineApproximationOptions {
  /** Maximum allowed distance between the curve and the input points. */
  tolerance?: number;
  /** Maximum B-spline degree. */
  degMax?: number;
  /** Minimum B-spline degree. */
  degMin?: number;
  /** Optional `[weight1, weight2, weight3]` smoothing weights, or `null` to disable. */
  smoothing?: null | [number, number, number];
}

/**
 * Create a B-spline edge that approximates a set of 3D points.
 *
 * @returns An error if the OCCT approximation algorithm fails.
 */
export function makeBSplineApproximation(
  points: Vec3[],
  { tolerance = 1e-3, smoothing = null, degMax = 6, degMin = 1 }: BSplineApproximationOptions = {}
): Result<Edge> {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const pnts = r(new oc.TColgp_Array1OfPnt_2(1, points.length));

  points.forEach((point, index) => {
    pnts.SetValue(index + 1, r(toOcPnt(point)));
  });

  let splineBuilder: OcType;

  if (smoothing) {
    splineBuilder = r(
      new oc.GeomAPI_PointsToBSpline_5(
        pnts,
        smoothing[0],
        smoothing[1],
        smoothing[2],
        degMax,

        oc.GeomAbs_Shape.GeomAbs_C2,
        tolerance
      )
    );
  } else {
    splineBuilder = r(
      new oc.GeomAPI_PointsToBSpline_2(
        pnts,
        degMin,
        degMax,

        oc.GeomAbs_Shape.GeomAbs_C2,
        tolerance
      )
    );
  }

  if (!splineBuilder.IsDone()) {
    gc();
    return err(occtError('BSPLINE_FAILED', 'B-spline approximation failed'));
  }

  const splineGeom = r(splineBuilder.Curve());

  const curve = r(new oc.Handle_Geom_Curve_2(splineGeom.get()));
  const edge = createEdge(new oc.BRepBuilderAPI_MakeEdge_24(curve).Edge());
  gc();
  return ok(edge);
}

/**
 * Create a Bezier curve edge from control points.
 *
 * @param points - Two or more control points defining the curve.
 * @returns Ok with the edge, or Err if fewer than 2 points are provided.
 */
export function makeBezierCurve(points: Vec3[]): Result<Edge> {
  if (points.length < 2) {
    return err(
      validationError(
        'BEZIER_MIN_POINTS',
        `Need at least 2 points for a Bezier curve, got ${points.length}`,
        undefined,
        {
          pointCount: points.length,
        }
      )
    );
  }
  const oc = getKernel().oc;
  const [r, gc] = localGC();
  const arrayOfPoints = r(new oc.TColgp_Array1OfPnt_2(1, points.length));
  points.forEach((p, i) => {
    arrayOfPoints.SetValue(i + 1, r(toOcPnt(p)));
  });
  const bezCurve = new oc.Geom_BezierCurve_1(arrayOfPoints);

  const curve = r(new oc.Handle_Geom_Curve_2(bezCurve));
  const edgeMaker = r(new oc.BRepBuilderAPI_MakeEdge_24(curve));
  const edge = createEdge(edgeMaker.Edge());
  gc();
  return ok(edge);
}

/**
 * Create a circular arc edge tangent to a direction at the start point.
 *
 * @param startTgt - Tangent direction at the start point.
 */
export function makeTangentArc(startPoint: Vec3, startTgt: Vec3, endPoint: Vec3): Edge {
  const oc = getKernel().oc;
  const [r, gc] = localGC();
  const circleGeom = r(
    new oc.GC_MakeArcOfCircle_5(
      r(toOcPnt(startPoint)),
      r(toOcVec(startTgt)),
      r(toOcPnt(endPoint))
    ).Value()
  );

  const curve = r(new oc.Handle_Geom_Curve_2(circleGeom.get()));
  const edge = createEdge(r(new oc.BRepBuilderAPI_MakeEdge_24(curve)).Edge());
  gc();
  return edge;
}

/**
 * Assemble edges and/or wires into a single connected wire.
 *
 * @returns An error if the edges cannot form a valid wire (e.g. disconnected).
 */
export function assembleWire(listOfEdges: (Edge | Wire)[]): Result<Wire> {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const wireBuilder = r(new oc.BRepBuilderAPI_MakeWire_1());
  listOfEdges.forEach((e) => {
    if (isEdge(e)) {
      wireBuilder.Add_1(e.wrapped);
    }
    if (isWire(e)) {
      wireBuilder.Add_2(e.wrapped);
    }
  });

  const progress = r(new oc.Message_ProgressRange_1());
  wireBuilder.Build(progress);
  const res = wireBuilder.Error();
  if (res !== oc.BRepBuilderAPI_WireError.BRepBuilderAPI_WireDone) {
    const errorNames = new Map([
      [oc.BRepBuilderAPI_WireError.BRepBuilderAPI_EmptyWire, 'empty wire'],
      [oc.BRepBuilderAPI_WireError.BRepBuilderAPI_NonManifoldWire, 'non manifold wire'],
      [oc.BRepBuilderAPI_WireError.BRepBuilderAPI_DisconnectedWire, 'disconnected wire'],
    ]);
    gc();
    return err(
      occtError(
        'WIRE_BUILD_FAILED',
        `Failed to build the wire, ${errorNames.get(res) || 'unknown error'}`
      )
    );
  }

  const wire = createWire(wireBuilder.Wire());
  gc();
  return ok(wire);
}
