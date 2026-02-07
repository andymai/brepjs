import type { OcType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import { gcWithScope, localGC } from '../core/memory.js';
import type { Plane } from '../core/planeTypes.js';
import { makeOcAx2 } from '../core/occtBoundary.js';
import type { Face, Edge } from '../core/shapeTypes.js';
import { createEdge } from '../core/shapeTypes.js';
import { uvBounds, faceGeomType } from '../topology/faceFns.js';
import { getOrientation } from '../topology/curveFns.js';
import { type Result, ok, err } from '../core/result.js';
import { validationError } from '../core/errors.js';
import type { Point2D } from './lib/index.js';
import { axis2d, pnt, vec, BoundingBox2d, Curve2D } from './lib/index.js';

/** Compute the 2D bounding box enclosing all given curves. */
export const curvesBoundingBox = (curves: Curve2D[]): BoundingBox2d => {
  const oc = getKernel().oc;
  const boundBox = new oc.Bnd_Box2d();

  curves.forEach((c: Curve2D) => {
    oc.BndLib_Add2dCurve.Add_3(c.wrapped, 1e-6, boundBox);
  });

  return new BoundingBox2d(boundBox);
};

/** Convert 2D curves to 3D edges by projecting them onto a plane. */
export function curvesAsEdgesOnPlane(curves: Curve2D[], plane: Plane): Edge[] {
  const [r, gc] = localGC();
  const ax = r(makeOcAx2(plane.origin, plane.zDir, plane.xDir));

  const oc = getKernel().oc;

  const edges = curves.map((curve: Curve2D) => {
    const curve3d = r(oc.GeomLib.To3d(ax, curve.wrapped));
    const edgeBuilder = r(new oc.BRepBuilderAPI_MakeEdge_24(curve3d));
    return createEdge(edgeBuilder.Edge());
  });

  gc();
  return edges;
}

/** Convert 2D curves to 3D edges by mapping them onto a parametric surface. */
export const curvesAsEdgesOnSurface = (curves: Curve2D[], geomSurf: OcType): Edge[] => {
  const [r, gc] = localGC();
  const oc = getKernel().oc;

  const modifiedCurves = curves.map((curve: Curve2D) => {
    const edgeBuilder = r(new oc.BRepBuilderAPI_MakeEdge_30(curve.wrapped, geomSurf));
    return createEdge(edgeBuilder.Edge());
  });

  gc();
  return modifiedCurves;
};

/** Apply an OCCT `gp_GTrsf2d` transformation to an array of 2D curves. */
export const transformCurves = (curves: Curve2D[], transformation: OcType): Curve2D[] => {
  const oc = getKernel().oc;

  const modifiedCurves = curves.map((curve: Curve2D) => {
    if (!transformation) return curve.clone();
    return new Curve2D(oc.GeomLib.GTransform(curve.wrapped, transformation));
  });

  return modifiedCurves;
};

/**
 * Raw OCCT `gp_GTrsf2d` — replaces the old `Transformation2D` WrappingObj class.
 * Callers are responsible for lifetime management.
 */
export type Transformation2D = OcType;

/** Create a 2D affinity (non-uniform scale) transformation along a direction. */
export const stretchTransform2d = (
  ratio: number,
  direction: Point2D,
  origin: Point2D = [0, 0]
): Transformation2D => {
  const oc = getKernel().oc;
  const ax = axis2d(origin, direction);
  const transform = new oc.gp_GTrsf2d_1();
  transform.SetAffinity(ax, ratio);

  ax.delete();
  return transform;
};

/** Create a 2D translation transformation. */
export const translationTransform2d = (translation: Point2D): Transformation2D => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const rotation = new oc.gp_Trsf2d_1();
  rotation.SetTranslation_1(r(vec(translation)));

  const transform = new oc.gp_GTrsf2d_2(rotation);
  gc();
  return transform;
};

/**
 * Create a 2D mirror transformation.
 *
 * @param mode - `'center'` mirrors around a point; `'axis'` mirrors across a line.
 */
export const mirrorTransform2d = (
  centerOrDirection: Point2D,
  origin: Point2D = [0, 0],
  mode = 'center'
): Transformation2D => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const rotation = new oc.gp_Trsf2d_1();
  if (mode === 'center') {
    rotation.SetMirror_1(r(pnt(centerOrDirection)));
  } else {
    rotation.SetMirror_2(r(axis2d(origin, centerOrDirection)));
  }

  const transform = new oc.gp_GTrsf2d_2(rotation);
  gc();
  return transform;
};

/** Create a 2D rotation transformation around a center point (angle in radians). */
export const rotateTransform2d = (angle: number, center: Point2D = [0, 0]): Transformation2D => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const rotation = new oc.gp_Trsf2d_1();
  rotation.SetRotation(r(pnt(center)), angle);

  const transform = new oc.gp_GTrsf2d_2(rotation);
  gc();
  return transform;
};

/** Create a 2D uniform scale transformation around a center point. */
export const scaleTransform2d = (
  scaleFactor: number,
  center: Point2D = [0, 0]
): Transformation2D => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const scaling = new oc.gp_Trsf2d_1();
  scaling.SetScale(r(pnt(center)), scaleFactor);

  const transform = new oc.gp_GTrsf2d_2(scaling);
  gc();
  return transform;
};

/** How to map 2D sketch coordinates onto a face's parametric UV space. */
export type ScaleMode = 'original' | 'bounds' | 'native';

/**
 * Convert 2D curves to 3D edges on a face's surface, applying UV scaling.
 *
 * @param scale - How to map 2D coordinates to the face's parametric space.
 * @returns `Err` if the face type is unsupported for the chosen scale mode.
 */
export function curvesAsEdgesOnFace(
  curves: Curve2D[],
  face: Face,
  scale: ScaleMode = 'original'
): Result<Edge[]> {
  const [r, gc] = localGC();

  const oc = getKernel().oc;
  let geomSurf = r(oc.BRep_Tool.Surface_2(face.wrapped));

  const bounds = uvBounds(face);

  let transformation: OcType = null;
  const uAxis = r(axis2d([0, 0], [0, 1]));
  const _vAxis = r(axis2d([0, 0], [1, 0]));

  if (scale === 'original' && faceGeomType(face) !== 'PLANE') {
    if (faceGeomType(face) !== 'CYLINDRE')
      return err(
        validationError(
          'UNSUPPORTED_FACE_TYPE',
          'Only planar and cylindrical faces can be unwrapped for sketching'
        )
      );

    const cylinder = r(geomSurf.get().Cylinder());
    if (!cylinder.Direct()) {
      geomSurf = geomSurf.get().UReversed();
    }
    const radius = cylinder.Radius();
    transformation = stretchTransform2d(1 / radius, [0, 1]);
  }

  if (scale === 'bounds') {
    transformation = r(new oc.gp_GTrsf2d_1());
    transformation.SetAffinity(uAxis, bounds.uMax - bounds.uMin);

    if (bounds.uMin !== 0) {
      const trans = r(new oc.gp_GTrsf2d_1());
      trans.SetTranslationPart(new oc.gp_XY_2(0, -bounds.uMin));
      transformation.Multiply(trans);
    }

    const vTransformation = r(new oc.gp_GTrsf2d_1());
    vTransformation.SetAffinity(_vAxis, bounds.vMax - bounds.vMin);
    transformation.Multiply(vTransformation);

    if (bounds.vMin !== 0) {
      const trans = r(new oc.gp_GTrsf2d_1());
      trans.SetTranslationPart(r(new oc.gp_XY_2(0, -bounds.vMin)));
      transformation.Multiply(trans);
    }
  }

  const modifiedCurves = transformCurves(curves, transformation);
  const edges = curvesAsEdgesOnSurface(modifiedCurves, geomSurf);

  gc();
  return ok(edges);
}

/** Extract the 2D parametric curve of an edge on a face's surface. */
export function edgeToCurve(e: Edge, face: Face): Curve2D {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const adaptor = r(new oc.BRepAdaptor_Curve2d_2(e.wrapped, face.wrapped));

  const trimmed = new oc.Geom2d_TrimmedCurve(
    adaptor.Curve(),
    adaptor.FirstParameter(),
    adaptor.LastParameter(),
    true,
    true
  );

  if (getOrientation(e) === 'backward') {
    trimmed.Reverse();
  }

  return new Curve2D(new oc.Handle_Geom2d_Curve_2(trimmed));
}
