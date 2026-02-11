/**
 * Solid and primitive construction helpers — boxes, cylinders, spheres, cones,
 * tori, ellipsoids, vertices, compounds, and offsets.
 */

import type { OcType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import { gcWithScope } from '../core/disposal.js';
import { toOcPnt, makeOcAx1, makeOcAx2 } from '../core/occtBoundary.js';
import type { Vec3 } from '../core/types.js';
import { type Result, ok, err, andThen, unwrap } from '../core/result.js';
import { typeCastError } from '../core/errors.js';
import type {
  AnyShape,
  Shape3D,
  Compound,
  Face,
  Vertex,
  Shell,
  Solid,
} from '../core/shapeTypes.js';
import {
  createSolid,
  createCompound,
  createVertex,
  isShape3D,
  isSolid,
} from '../core/shapeTypes.js';
import { cast, downcast } from './cast.js';
import { weldShapes } from './shapeUtils.js';

/**
 * Creates a cylinder with the given radius and height.
 *
 * @category Solids
 */
export function makeCylinder(
  radius: number,
  height: number,
  location: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1]
): Solid {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const axis = r(makeOcAx2(location, direction));
  const cylinder = r(new oc.BRepPrimAPI_MakeCylinder_3(axis, radius, height));
  return createSolid(cylinder.Shape());
}

/**
 * Creates a sphere with the given radius.
 *
 * @category Solids
 */
export function makeSphere(radius: number): Solid {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const sphereMaker = r(new oc.BRepPrimAPI_MakeSphere_1(radius));
  return createSolid(sphereMaker.Shape());
}

/**
 * Creates a cone (or frustum) with the given radii and height.
 *
 * @category Solids
 */
export function makeCone(
  radius1: number,
  radius2: number,
  height: number,
  location: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1]
): Solid {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const axis = r(makeOcAx2(location, direction));
  const coneMaker = r(new oc.BRepPrimAPI_MakeCone_3(axis, radius1, radius2, height));
  return createSolid(coneMaker.Shape());
}

/**
 * Creates a torus with the given major and minor radii.
 *
 * @category Solids
 */
export function makeTorus(
  majorRadius: number,
  minorRadius: number,
  location: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1]
): Solid {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const axis = r(makeOcAx2(location, direction));
  const torusMaker = r(new oc.BRepPrimAPI_MakeTorus_5(axis, majorRadius, minorRadius));
  return createSolid(torusMaker.Shape());
}

// ---------------------------------------------------------------------------
// Ellipsoid internals
// ---------------------------------------------------------------------------

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

/** Convert an OCCT 2D array of points into a nested JS array. */
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
 * The algorithm creates a unit BSpline sphere surface, transforms its
 * control-point poles with an affinity matrix to match the requested
 * axis half-lengths, then sews the result into a solid.
 *
 * @category Solids
 */
export function makeEllipsoid(aLength: number, bLength: number, cLength: number): Solid {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const sphere = r(new oc.gp_Sphere_1());
  sphere.SetRadius(1);

  const sphericalSurface = r(new oc.Geom_SphericalSurface_2(sphere));
  const baseSurface = oc.GeomConvert.SurfaceToBSplineSurface(sphericalSurface.UReversed()).get();

  try {
    const poles = convertToJSArray(baseSurface.Poles_2());
    const ellipsoidTrsf = makeEllipsoidTransform(aLength, bLength, cLength);

    poles.forEach((columns, rowIdx) => {
      columns.forEach((value, colIdx) => {
        const newPoint = ellipsoidTrsf.applyToPoint(value);
        baseSurface.SetPole_1(rowIdx + 1, colIdx + 1, newPoint);
        newPoint.delete();
      });
    });
    ellipsoidTrsf.transform.delete();

    const shell = unwrap(
      cast(r(new oc.BRepBuilderAPI_MakeShell_2(baseSurface.UReversed(), false)).Shell())
    ) as Shell;

    return unwrap(makeSolid([shell]));
  } finally {
    baseSurface.delete();
  }
}

/**
 * Creates a box with the given corner points.
 *
 * @category Solids
 */
export function makeBox(corner1: Vec3, corner2: Vec3): Solid {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const p1 = r(toOcPnt(corner1));
  const p2 = r(toOcPnt(corner2));
  const boxMaker = r(new oc.BRepPrimAPI_MakeBox_4(p1, p2));
  return createSolid(boxMaker.Solid());
}

/** Create a vertex at a 3D point. */
export function makeVertex(point: Vec3): Vertex {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const pnt = r(toOcPnt(point));
  const vertexMaker = r(new oc.BRepBuilderAPI_MakeVertex(pnt));
  return createVertex(vertexMaker.Vertex());
}

/**
 * Create an offset shape from a face.
 *
 * @param offset - Signed offset distance (positive = outward).
 * @param tolerance - Geometric tolerance for the offset algorithm.
 * @returns An error if the result is not a valid 3D shape.
 */
export function makeOffset(face: Face, offset: number, tolerance = 1e-6): Result<Shape3D> {
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
}

/**
 * Build a compound from multiple shapes.
 *
 * @param shapeArray - Shapes to group into a single compound.
 * @returns A new Compound containing all input shapes.
 */
export function makeCompound(shapeArray: AnyShape[]): Compound {
  const oc = getKernel().oc;
  const builder = new oc.TopoDS_Builder();
  const compound = new oc.TopoDS_Compound();
  builder.MakeCompound(compound);

  for (const s of shapeArray) {
    builder.Add(compound, s.wrapped);
  }

  builder.delete();
  return createCompound(compound);
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
  const shell = weldShapes(facesOrShells);
  return andThen(cast(r(new oc.ShapeFix_Solid_1()).SolidFromShell(shell.wrapped)), (solid) => {
    if (!isSolid(solid))
      return err(typeCastError('SOLID_BUILD_FAILED', 'Could not make a solid of faces and shells'));
    return ok(solid);
  });
}
