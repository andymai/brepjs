import type { OcType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import { gcWithScope, localGC, WrappingObj } from '../core/memory.js';
import { toOcPnt, toOcVec, makeOcAx1, makeOcAx2, makeOcAx3 } from '../core/occtBoundary.js';
import type { Vec3 } from '../core/types.js';
import { cast, downcast } from './cast.js';
import { type Result, ok, err, unwrap, andThen } from '../core/result.js';
import { bug, validationError, occtError, typeCastError } from '../core/errors.js';
import {
  type AnyShape,
  type Shape3D,
  Edge,
  Face,
  Wire,
  Solid,
  Vertex,
  Shell,
  isShape3D,
} from './shapes.js';
import zip from '../utils/zip.js';

export const makeLine = (v1: Vec3, v2: Vec3): Edge => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const p1 = r(toOcPnt(v1));
  const p2 = r(toOcPnt(v2));
  const maker = r(new oc.BRepBuilderAPI_MakeEdge_3(p1, p2));
  const edge = new Edge(maker.Edge());
  gc();
  return edge;
};

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
  const shape = new Edge(edgeMaker.Edge());
  gc();

  return shape;
};

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
  const shape = new Edge(edgeMaker.Edge());
  gc();

  return ok(shape);
};

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

  return new Wire(w);
};

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
  const edge = new Edge(edgeMaker.Edge());
  gc();
  return edge;
};

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
  const shape = new Edge(edgeMaker.Edge());
  gc();

  return ok(shape);
};

export interface BSplineApproximationConfig {
  tolerance?: number;
  degMax?: number;
  degMin?: number;
  smoothing?: null | [number, number, number];
}

export const makeBSplineApproximation = function makeBSplineApproximation(
  points: Vec3[],
  { tolerance = 1e-3, smoothing = null, degMax = 6, degMin = 1 }: BSplineApproximationConfig = {}
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
  const edge = new Edge(new oc.BRepBuilderAPI_MakeEdge_24(curve).Edge());
  gc();
  return ok(edge);
};

export const makeBezierCurve = (points: Vec3[]): Edge => {
  if (points.length < 2) {
    bug('makeBezierCurve', `Need at least 2 points for a Bezier curve, got ${points.length}`);
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
  const edge = new Edge(edgeMaker.Edge());
  gc();
  return edge;
};

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
  const edge = new Edge(r(new oc.BRepBuilderAPI_MakeEdge_24(curve)).Edge());
  gc();
  return edge;
};

export const assembleWire = (listOfEdges: (Edge | Wire)[]): Result<Wire> => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const wireBuilder = r(new oc.BRepBuilderAPI_MakeWire_1());
  listOfEdges.forEach((e) => {
    if (e instanceof Edge) {
      wireBuilder.Add_1(e.wrapped);
    }
    if (e instanceof Wire) {
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

  const wire = new Wire(wireBuilder.Wire());
  gc();
  return ok(wire);
};

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

  return ok(new Face(face));
};

export const makeNewFaceWithinFace = (originFace: Face, wire: Wire): Face => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();
  const surface = r(oc.BRep_Tool.Surface_2(originFace.wrapped));
  const faceBuilder = r(new oc.BRepBuilderAPI_MakeFace_21(surface, wire.wrapped, true));
  const face = faceBuilder.Face();
  gc();

  return new Face(face);
};

export const makeNonPlanarFace = (wire: Wire): Result<Face> => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const faceBuilder = r(
    new oc.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 1e-2, 0.1, 8, 9)
  );
  wire.edges.forEach((edge) => {
    faceBuilder.Add_1(
      r(edge).wrapped,

      oc.GeomAbs_Shape.GeomAbs_C0,
      true
    );
  });

  const progress = r(new oc.Message_ProgressRange_1());
  faceBuilder.Build(progress);

  return andThen(cast(faceBuilder.Shape()), (newFace) => {
    gc();
    if (!(newFace instanceof Face)) {
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
  const solid = new Solid(cylinder.Shape());
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
  const sphere = new Solid(sphereMaker.Shape());
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
  const solid = new Solid(coneMaker.Shape());
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
  const solid = new Solid(torusMaker.Shape());
  gc();
  return solid;
};

class EllipsoidTransform extends WrappingObj<OcType> {
  constructor(x: number, y: number, z: number) {
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

    super(transform);
  }

  applyToPoint(p: OcType): OcType {
    const oc = getKernel().oc;
    const r = gcWithScope();

    const coords = r(p.XYZ());
    this.wrapped.Transforms_1(coords);
    return new oc.gp_Pnt_2(coords);
  }
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
    const transform = new EllipsoidTransform(aLength, bLength, cLength);

    poles.forEach((columns, rowIdx) => {
      columns.forEach((value, colIdx) => {
        const newPoint = transform.applyToPoint(value);
        baseSurface.SetPole_1(rowIdx + 1, colIdx + 1, newPoint);
        newPoint.delete();
      });
    });
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
  const box = new Solid(boxMaker.Solid());
  gc();
  return box;
};

export const makeVertex = (point: Vec3): Vertex => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const pnt = r(toOcPnt(point));
  const vertexMaker = r(new oc.BRepBuilderAPI_MakeVertex(pnt));
  const vertex = vertexMaker.Vertex();
  gc();

  return new Vertex(vertex);
};

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

export const compoundShapes = (shapeArray: AnyShape[]): AnyShape => {
  const oc = getKernel().oc;
  const builder = new oc.TopoDS_Builder();
  const compound = new oc.TopoDS_Compound();
  builder.MakeCompound(compound);

  shapeArray.forEach((s) => {
    builder.Add(compound, s.wrapped);
  });

  const newShape = unwrap(cast(compound));
  return newShape;
};

export const makeCompound = compoundShapes;

function _weld(facesOrShells: Array<Face | Shell>): AnyShape {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const shellBuilder = r(new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false));

  facesOrShells.forEach(({ wrapped }) => {
    shellBuilder.Add(wrapped);
  });

  shellBuilder.Perform(r(new oc.Message_ProgressRange_1()));

  return unwrap(cast(unwrap(downcast(shellBuilder.SewedShape()))));
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

  if (!ignoreType && !(shell instanceof Shell))
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
    if (!(solid instanceof Solid))
      return err(typeCastError('SOLID_BUILD_FAILED', 'Could not make a solid of faces and shells'));
    return ok(solid);
  });
}

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
  return new Face(newFace);
};

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
