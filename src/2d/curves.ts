/**
 * 2D/3D curve conversions and transformations.
 * Ported from replicad's curves.ts.
 */

import type { OcType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import { GCWithScope, localGC, WrappingObj } from '../core/memory.js';
import type { Plane } from '../core/geometry.js';
import { makeAx2 } from '../core/geometry.js';
import type { Face } from '../topology/shapes.js';
import { Edge } from '../topology/shapes.js';
import type { Point2D } from './lib/index.js';
import { axis2d, pnt, vec, BoundingBox2d, Curve2D } from './lib/index.js';

export const curvesBoundingBox = (curves: Curve2D[]): BoundingBox2d => {
  const oc = getKernel().oc;
  const boundBox = new oc.Bnd_Box2d();

  curves.forEach((c: Curve2D) => {
    oc.BndLib_Add2dCurve.Add_3(c.wrapped, 1e-6, boundBox);
  });

  return new BoundingBox2d(boundBox);
};

export function curvesAsEdgesOnPlane(curves: Curve2D[], plane: Plane): Edge[] {
  const [r, gc] = localGC();
  const ax = r(makeAx2(plane.origin, plane.zDir, plane.xDir));

  const oc = getKernel().oc;

  const edges = curves.map((curve: Curve2D) => {
    const curve3d = oc.GeomLib.To3d(ax, curve.wrapped);
    return new Edge(new oc.BRepBuilderAPI_MakeEdge_24(curve3d).Edge());
  });

  gc();
  return edges;
}

export const curvesAsEdgesOnSurface = (curves: Curve2D[], geomSurf: OcType): Edge[] => {
  const [r, gc] = localGC();
  const oc = getKernel().oc;

  const modifiedCurves = curves.map((curve: Curve2D) => {
    const edgeBuilder = r(new oc.BRepBuilderAPI_MakeEdge_30(curve.wrapped, geomSurf));
    return new Edge(edgeBuilder.Edge());
  });

  gc();
  return modifiedCurves;
};

export const transformCurves = (curves: Curve2D[], transformation: OcType): Curve2D[] => {
  const oc = getKernel().oc;

  const modifiedCurves = curves.map((curve: Curve2D) => {
    if (!transformation) return curve.clone();
    return new Curve2D(oc.GeomLib.GTransform(curve.wrapped, transformation));
  });

  return modifiedCurves;
};

export class Transformation2D extends WrappingObj<OcType> {
  transformCurves(curves: Curve2D[]): Curve2D[] {
    return transformCurves(curves, this.wrapped);
  }
}

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
  return new Transformation2D(transform);
};

export const translationTransform2d = (translation: Point2D): Transformation2D => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const rotation = new oc.gp_Trsf2d_1();
  rotation.SetTranslation_1(r(vec(translation)));

  const transform = new oc.gp_GTrsf2d_2(rotation);
  gc();
  return new Transformation2D(transform);
};

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
  return new Transformation2D(transform);
};

export const rotateTransform2d = (angle: number, center: Point2D = [0, 0]): Transformation2D => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const rotation = new oc.gp_Trsf2d_1();
  rotation.SetRotation(r(pnt(center)), angle);

  const transform = new oc.gp_GTrsf2d_2(rotation);
  gc();
  return new Transformation2D(transform);
};

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
  return new Transformation2D(transform);
};

export type ScaleMode = 'original' | 'bounds' | 'native';

export function curvesAsEdgesOnFace(
  curves: Curve2D[],
  face: Face,
  scale: ScaleMode = 'original'
): Edge[] {
  const [r, gc] = localGC();

  const oc = getKernel().oc;
  let geomSurf = r(oc.BRep_Tool.Surface_2(face.wrapped));

  const bounds = face.UVBounds;

  let transformation: OcType = null;
  const uAxis = r(axis2d([0, 0], [0, 1]));
  const _vAxis = r(axis2d([0, 0], [1, 0]));

  if (scale === 'original' && face.geomType !== 'PLANE') {
    if (face.geomType !== 'CYLINDRE')
      throw new Error('Only planar and cylindrical faces can be unwrapped for sketching');

    const cylinder = r(geomSurf.get().Cylinder());
    if (!cylinder.Direct()) {
      geomSurf = geomSurf.get().UReversed();
    }
    const radius = cylinder.Radius();
    const affinity = stretchTransform2d(1 / radius, [0, 1]);
    transformation = affinity.wrapped;
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
  return edges;
}

export function edgeToCurve(e: Edge, face: Face): Curve2D {
  const oc = getKernel().oc;
  const r = GCWithScope();

  const adaptor = r(new oc.BRepAdaptor_Curve2d_2(e.wrapped, face.wrapped));

  const trimmed = new oc.Geom2d_TrimmedCurve(
    adaptor.Curve(),
    adaptor.FirstParameter(),
    adaptor.LastParameter(),
    true,
    true
  );

  if (e.orientation === 'backward') {
    trimmed.Reverse();
  }

  return new Curve2D(new oc.Handle_Geom2d_Curve_2(trimmed));
}
