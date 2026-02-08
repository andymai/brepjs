import type { OcType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import { gcWithScope, localGC } from '../core/memory.js';
import { toOcPnt, toOcVec, makeOcAx1, makeOcAx2, makeOcAx3 } from '../core/occtBoundary.js';
import type { Vec3 } from '../core/types.js';
import { cast, downcast } from './cast.js';
import { type Result, ok, err, unwrap, andThen } from '../core/result.js';
import { validationError, occtError, typeCastError } from '../core/errors.js';
import type {
  AnyShape,
  Shape3D,
  Compound,
  Edge,
  Face,
  Wire,
  Solid,
  Vertex,
  Shell,
} from '../core/shapeTypes.js';
import {
  createEdge,
  createFace,
  createWire,
  createSolid,
  createCompound,
  createVertex,
  isShape3D,
  isEdge,
  isWire,
  isFace,
  isShell,
  isSolid,
} from '../core/shapeTypes.js';
import { getEdges } from './shapeFns.js';
import zip from '../utils/zip.js';

/** Create a straight edge between two 3D points. */
export const makeLine = (v1: Vec3, v2: Vec3): Edge => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const p1 = r(toOcPnt(v1));
  const p2 = r(toOcPnt(v2));
  const maker = r(new oc.BRepBuilderAPI_MakeEdge_3(p1, p2));
  const edge = createEdge(maker.Edge());
  gc();
  return edge;
};

/** Create a circular edge with the given radius, center, and normal. */
export const makeCircle = (
  radius: number,
  center: Vec3 = [0, 0, 0],
  normal: Vec3 = [0, 0, 1]
): Edge => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const ax = r(makeOcAx2(center, normal));

  const circleGp = r(new oc.gp_Circ_2(ax, radius));
  const edgeMaker = r(new oc.BRepBuilderAPI_MakeEdge_8(circleGp));
  const shape = createEdge(edgeMaker.Edge());
  gc();

  return shape;
};

/**
 * Create an elliptical edge with the given radii.
 *
 * @param xDir - Optional direction for the major axis.
 * @returns An error if `minorRadius` exceeds `majorRadius`.
 */
export const makeEllipse = (
  majorRadius: number,
  minorRadius: number,
  center: Vec3 = [0, 0, 0],
  normal: Vec3 = [0, 0, 1],
  xDir?: Vec3
): Result<Edge> => {
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
};

/**
 * Create a helical wire with the given pitch, height, and radius.
 *
 * @param pitch - Vertical distance per full turn.
 * @param lefthand - Wind the helix in the left-hand direction.
 */
export const makeHelix = (
  pitch: number,
  height: number,
  radius: number,
  center: Vec3 = [0, 0, 0],
  dir: Vec3 = [0, 0, 1],
  lefthand = false
): Wire => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();
  let myDir = 2 * Math.PI;
  if (lefthand) {
    myDir = -2 * Math.PI;
  }

  const geomLine = r(
    new oc.Geom2d_Line_3(r(new oc.gp_Pnt2d_3(0.0, 0.0)), r(new oc.gp_Dir2d_4(myDir, pitch)))
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
};

/**
 * Create a circular arc edge passing through three points.
 *
 * @param v1 - Start point.
 * @param v2 - Mid point (on the arc).
 * @param v3 - End point.
 */
export const makeThreePointArc = (v1: Vec3, v2: Vec3, v3: Vec3): Edge => {
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
};

/**
 * Create an elliptical arc edge between two angles.
 *
 * @param startAngle - Start angle in radians.
 * @param endAngle - End angle in radians.
 * @param xDir - Optional direction for the major axis.
 * @returns An error if `minorRadius` exceeds `majorRadius`.
 */
export const makeEllipseArc = (
  majorRadius: number,
  minorRadius: number,
  startAngle: number,
  endAngle: number,
  center: Vec3 = [0, 0, 0],
  normal: Vec3 = [0, 0, 1],
  xDir?: Vec3
): Result<Edge> => {
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
};

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
export const makeBSplineApproximation = function makeBSplineApproximation(
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
};

/**
 * Create a Bezier curve edge from control points.
 *
 * @param points - Two or more control points defining the curve.
 * @returns Ok with the edge, or Err if fewer than 2 points are provided.
 */
export const makeBezierCurve = (points: Vec3[]): Result<Edge> => {
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
};

/**
 * Create a circular arc edge tangent to a direction at the start point.
 *
 * @param startTgt - Tangent direction at the start point.
 */
export const makeTangentArc = (startPoint: Vec3, startTgt: Vec3, endPoint: Vec3): Edge => {
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
};

/**
 * Assemble edges and/or wires into a single connected wire.
 *
 * @returns An error if the edges cannot form a valid wire (e.g. disconnected).
 */
export const assembleWire = (listOfEdges: (Edge | Wire)[]): Result<Wire> => {
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
};

/**
 * Create a planar face from a closed wire, optionally with hole wires.
 *
 * @returns An error if the wire is non-planar or the face cannot be built.
 */
export const makeFace = (wire: Wire, holes?: Wire[]): Result<Face> => {
  const oc = getKernel().oc;
  const faceBuilder = new oc.BRepBuilderAPI_MakeFace_15(wire.wrapped, false);
  holes?.forEach((hole) => {
    faceBuilder.Add(hole.wrapped);
  });
  if (!faceBuilder.IsDone()) {
    faceBuilder.delete();
    return err(
      occtError('FACE_BUILD_FAILED', 'Failed to build the face. Your wire might be non planar.')
    );
  }
  const face = faceBuilder.Face();
  faceBuilder.delete();

  return ok(createFace(face));
};

/**
 * Create a face bounded by a wire on an existing face's underlying surface.
 *
 * @param originFace - Face whose surface geometry is reused.
 * @param wire - Wire that defines the boundary on that surface.
 */
export const makeNewFaceWithinFace = (originFace: Face, wire: Wire): Face => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();
  const surface = r(oc.BRep_Tool.Surface_2(originFace.wrapped));
  const faceBuilder = r(new oc.BRepBuilderAPI_MakeFace_21(surface, wire.wrapped, true));
  const face = faceBuilder.Face();
  gc();

  return createFace(face);
};

/**
 * Create a non-planar face from a wire using surface filling.
 *
 * @returns An error if the filling algorithm fails to produce a face.
 */
export const makeNonPlanarFace = (wire: Wire): Result<Face> => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const faceBuilder = r(
    new oc.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 1e-2, 0.1, 8, 9)
  );
  getEdges(wire).forEach((edge) => {
    faceBuilder.Add_1(
      edge.wrapped,

      oc.GeomAbs_Shape.GeomAbs_C0,
      true
    );
  });

  const progress = r(new oc.Message_ProgressRange_1());
  faceBuilder.Build(progress);

  return andThen(cast(faceBuilder.Shape()), (newFace) => {
    gc();
    if (!isFace(newFace)) {
      return err(occtError('FACE_BUILD_FAILED', 'Failed to create a face'));
    }
    return ok(newFace);
  });
};

/**
 * Creates a cylinder with the given radius and height.
 *
 * @category Solids
 */
export const makeCylinder = (
  radius: number,
  height: number,
  location: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1]
): Solid => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const axis = r(makeOcAx2(location, direction));
  const cylinder = r(new oc.BRepPrimAPI_MakeCylinder_3(axis, radius, height));
  const solid = createSolid(cylinder.Shape());
  gc();
  return solid;
};

/**
 * Creates a sphere with the given radius.
 *
 * @category Solids
 */
export const makeSphere = (radius: number): Solid => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const sphereMaker = r(new oc.BRepPrimAPI_MakeSphere_1(radius));
  const sphere = createSolid(sphereMaker.Shape());
  gc();
  return sphere;
};

/**
 * Creates a cone (or frustum) with the given radii and height.
 *
 * @category Solids
 */
export const makeCone = (
  radius1: number,
  radius2: number,
  height: number,
  location: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1]
): Solid => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const axis = r(makeOcAx2(location, direction));
  const coneMaker = r(new oc.BRepPrimAPI_MakeCone_3(axis, radius1, radius2, height));
  const solid = createSolid(coneMaker.Shape());
  gc();
  return solid;
};

/**
 * Creates a torus with the given major and minor radii.
 *
 * @category Solids
 */
export const makeTorus = (
  majorRadius: number,
  minorRadius: number,
  location: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1]
): Solid => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const axis = r(makeOcAx2(location, direction));
  const torusMaker = r(new oc.BRepPrimAPI_MakeTorus_5(axis, majorRadius, minorRadius));
  const solid = createSolid(torusMaker.Shape());
  gc();
  return solid;
};

/** Build a gp_GTrsf that scales a unit sphere into an ellipsoid. */
function makeEllipsoidTransform(
  x: number,
  y: number,
  z: number
): { transform: OcType; applyToPoint: (p: OcType) => OcType } {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const xyRatio = Math.sqrt((x * y) / z);
  const xzRatio = x / xyRatio;
  const yzRatio = y / xyRatio;

  const ax1 = r(makeOcAx1([0, 0, 0], [0, 1, 0]));
  const ax2 = r(makeOcAx1([0, 0, 0], [0, 0, 1]));
  const ax3 = r(makeOcAx1([0, 0, 0], [1, 0, 0]));

  const transform = new oc.gp_GTrsf_1();
  transform.SetAffinity_1(ax1, xzRatio);
  const xy = r(new oc.gp_GTrsf_1());
  xy.SetAffinity_1(ax2, xyRatio);
  const yz = r(new oc.gp_GTrsf_1());
  yz.SetAffinity_1(ax3, yzRatio);

  transform.Multiply(xy);
  transform.Multiply(yz);

  return {
    transform,
    applyToPoint(p: OcType): OcType {
      const r2 = gcWithScope();
      const coords = r2(p.XYZ());
      transform.Transforms_1(coords);
      return new oc.gp_Pnt_2(coords);
    },
  };
}

function convertToJSArray(arrayOfPoints: OcType): OcType[][] {
  const newArray: OcType[][] = [];

  for (let row = arrayOfPoints.LowerRow(); row <= arrayOfPoints.UpperRow(); row++) {
    const rowArr: OcType[] = [];
    newArray.push(rowArr);
    for (let c = arrayOfPoints.LowerCol(); c <= arrayOfPoints.UpperCol(); c++) {
      const pnt = arrayOfPoints.Value(row, c);
      rowArr.push(pnt);
    }
  }

  return newArray;
}

/**
 * Creates an ellipsoid with the given axis lengths.
 *
 * @category Solids
 */
export const makeEllipsoid = (aLength: number, bLength: number, cLength: number): Solid => {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const sphere = r(new oc.gp_Sphere_1());
  sphere.SetRadius(1);

  const sphericalSurface = r(new oc.Geom_SphericalSurface_2(sphere));

  const baseSurface = oc.GeomConvert.SurfaceToBSplineSurface(sphericalSurface.UReversed()).get();

  try {
    const poles = convertToJSArray(baseSurface.Poles_2());
    const ellipsoid = makeEllipsoidTransform(aLength, bLength, cLength);

    poles.forEach((columns, rowIdx) => {
      columns.forEach((value, colIdx) => {
        const newPoint = ellipsoid.applyToPoint(value);
        baseSurface.SetPole_1(rowIdx + 1, colIdx + 1, newPoint);
        newPoint.delete();
      });
    });
    ellipsoid.transform.delete();
    const shell = unwrap(
      cast(r(new oc.BRepBuilderAPI_MakeShell_2(baseSurface.UReversed(), false)).Shell())
    ) as Shell;

    return unwrap(makeSolid([shell]));
  } finally {
    baseSurface.delete();
  }
};

/**
 * Creates a box with the given corner points.
 *
 * @category Solids
 */
export const makeBox = (corner1: Vec3, corner2: Vec3): Solid => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const p1 = r(toOcPnt(corner1));
  const p2 = r(toOcPnt(corner2));
  const boxMaker = r(new oc.BRepPrimAPI_MakeBox_4(p1, p2));
  const box = createSolid(boxMaker.Solid());
  gc();
  return box;
};

/** Create a vertex at a 3D point. */
export const makeVertex = (point: Vec3): Vertex => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const pnt = r(toOcPnt(point));
  const vertexMaker = r(new oc.BRepBuilderAPI_MakeVertex(pnt));
  const vertex = vertexMaker.Vertex();
  gc();

  return createVertex(vertex);
};

/**
 * Create an offset shape from a face.
 *
 * @param offset - Signed offset distance (positive = outward).
 * @param tolerance - Geometric tolerance for the offset algorithm.
 * @returns An error if the result is not a valid 3D shape.
 */
export const makeOffset = (face: Face, offset: number, tolerance = 1e-6): Result<Shape3D> => {
  const oc = getKernel().oc;
  const progress = new oc.Message_ProgressRange_1();
  const offsetBuilder = new oc.BRepOffsetAPI_MakeOffsetShape();

  try {
    offsetBuilder.PerformByJoin(
      face.wrapped,
      offset,
      tolerance,

      oc.BRepOffset_Mode.BRepOffset_Skin,
      false,
      false,

      oc.GeomAbs_JoinType.GeomAbs_Arc,
      false,
      progress
    );

    return andThen(downcast(offsetBuilder.Shape()), (downcasted) =>
      andThen(cast(downcasted), (newShape) => {
        if (!isShape3D(newShape))
          return err(typeCastError('OFFSET_NOT_3D', 'Could not offset to a 3d shape'));
        return ok(newShape);
      })
    );
  } finally {
    offsetBuilder.delete();
    progress.delete();
  }
};

/**
 * Build a compound from multiple shapes.
 *
 * @param shapeArray - Shapes to group into a single compound.
 * @returns A new Compound containing all input shapes.
 */
export const makeCompound = (shapeArray: AnyShape[]): Compound => {
  const oc = getKernel().oc;
  const builder = new oc.TopoDS_Builder();
  const compound = new oc.TopoDS_Compound();
  builder.MakeCompound(compound);

  for (const s of shapeArray) {
    builder.Add(compound, s.wrapped);
  }

  builder.delete();
  return createCompound(compound);
};

function _weld(facesOrShells: Array<Face | Shell>): AnyShape {
  const sewn = getKernel().sew(facesOrShells.map((s) => s.wrapped));
  return unwrap(cast(unwrap(downcast(sewn))));
}

/**
 * Welds faces and shells into a single shell.
 *
 * @param facesOrShells - An array of faces and shells to be welded.
 * @param ignoreType - If true, the function will not check if the result is a shell.
 * @returns A shell that contains all the faces and shells.
 */
export function weldShellsAndFaces(
  facesOrShells: Array<Face | Shell>,
  ignoreType = false
): Result<Shell> {
  const shell = _weld(facesOrShells);

  if (!ignoreType && !isShell(shell))
    return err(typeCastError('WELD_NOT_SHELL', 'Could not make a shell from faces and shells'));

  return ok(shell as Shell);
}

/**
 * Welds faces and shells into a single shell and then makes a solid.
 *
 * @param facesOrShells - An array of faces and shells to be welded.
 * @returns A solid that contains all the faces and shells.
 *
 * @category Solids
 */
export function makeSolid(facesOrShells: Array<Face | Shell>): Result<Solid> {
  const r = gcWithScope();
  const oc = getKernel().oc;
  const shell = _weld(facesOrShells);
  return andThen(cast(r(new oc.ShapeFix_Solid_1()).SolidFromShell(shell.wrapped)), (solid) => {
    if (!isSolid(solid))
      return err(typeCastError('SOLID_BUILD_FAILED', 'Could not make a solid of faces and shells'));
    return ok(solid);
  });
}

/**
 * Add hole wires to an existing face.
 *
 * Orientation of the holes is automatically fixed.
 */
export const addHolesInFace = (face: Face, holes: Wire[]): Face => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const faceMaker = r(new oc.BRepBuilderAPI_MakeFace_2(face.wrapped));
  holes.forEach((wire) => {
    faceMaker.Add(wire.wrapped);
  });

  const builtFace = r(faceMaker.Face());

  const fixer = r(new oc.ShapeFix_Face_2(builtFace));
  fixer.FixOrientation_1();
  const newFace = fixer.Face();

  gc();
  return createFace(newFace);
};

/**
 * Create a polygonal face from three or more coplanar points.
 *
 * @returns An error if fewer than 3 points are provided or the face cannot be built.
 */
export const makePolygon = (points: Vec3[]): Result<Face> => {
  if (points.length < 3)
    return err(
      validationError('POLYGON_MIN_POINTS', 'You need at least 3 points to make a polygon')
    );

  const edges = zip([points, [...points.slice(1), points[0]]]).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zip returns untyped pairs
    ([p1, p2]: any) => makeLine(p1, p2)
  );
  return andThen(assembleWire(edges), (wire) => makeFace(wire));
};
