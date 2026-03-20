import type { KernelType } from '@/kernel/types.js';
import { getKernel } from '@/kernel/index.js';
import type { Plane } from '@/core/planeTypes.js';
import type { Face, Edge } from '@/core/shapeTypes.js';
import { createEdge } from '@/core/shapeTypes.js';
import { uvBounds, faceGeomType } from '@/topology/faceFns.js';
import { getOrientation } from '@/topology/curveFns.js';
import { type Result, ok, err } from '@/core/result.js';
import { validationError } from '@/core/errors.js';
import type { Point2D } from './lib/index.js';
import { BoundingBox2d, Curve2D } from './lib/index.js';

/** Compute the 2D bounding box enclosing all given curves. */
export const curvesBoundingBox = (curves: Curve2D[]): BoundingBox2d => {
  const kernel = getKernel();
  const boundBox = kernel.createBoundingBox2d();
  curves.forEach((c: Curve2D) => {
    kernel.addCurveToBBox2d(boundBox, c.wrapped, 1e-6);
  });
  return new BoundingBox2d(boundBox);
};

/** Convert 2D curves to 3D edges by projecting them onto a plane. */
export function curvesAsEdgesOnPlane(curves: Curve2D[], plane: Plane): Edge[] {
  const kernel = getKernel();
  return curves.map((curve: Curve2D) =>
    createEdge(
      kernel.liftCurve2dToPlane(curve.wrapped, [...plane.origin], [...plane.zDir], [...plane.xDir])
    )
  );
}

/** Convert 2D curves to 3D edges by mapping them onto a parametric surface. */
export const curvesAsEdgesOnSurface = (curves: Curve2D[], geomSurf: KernelType): Edge[] => {
  const kernel = getKernel();
  return curves.map((curve: Curve2D) =>
    createEdge(kernel.buildEdgeOnSurface(curve.wrapped, geomSurf))
  );
};

/** Apply an opaque gp_GTrsf2d transformation to an array of 2D curves. */
export const transformCurves = (
  curves: Curve2D[],
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- KernelType is any but null is a valid sentinel
  transformation: KernelType | null
): Curve2D[] => {
  const kernel = getKernel();
  return curves.map((curve: Curve2D) => {
    if (!transformation) return curve.clone();
    return new Curve2D(kernel.transformCurve2dGeneral(curve.wrapped, transformation));
  });
};

/**
 * Raw kernel `gp_GTrsf2d` handle.
 * Callers are responsible for lifetime management.
 */
export type Transformation2D = KernelType;

/** Create a 2D affinity (non-uniform scale) transformation along a direction. */
export const stretchTransform2d = (
  ratio: number,
  direction: Point2D,
  origin: Point2D = [0, 0]
): Transformation2D => {
  return getKernel().createAffinityGTrsf2d(origin[0], origin[1], direction[0], direction[1], ratio);
};

/** Create a 2D translation transformation. */
export const translationTransform2d = (translation: Point2D): Transformation2D => {
  return getKernel().createTranslationGTrsf2d(translation[0], translation[1]);
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
  if (mode === 'center') {
    return getKernel().createMirrorGTrsf2d(centerOrDirection[0], centerOrDirection[1], 'point');
  }
  return getKernel().createMirrorGTrsf2d(
    0,
    0,
    'axis',
    origin[0],
    origin[1],
    centerOrDirection[0],
    centerOrDirection[1]
  );
};

/** Create a 2D rotation transformation around a center point (angle in radians). */
export const rotateTransform2d = (angle: number, center: Point2D = [0, 0]): Transformation2D => {
  return getKernel().createRotationGTrsf2d(angle, center[0], center[1]);
};

/** Create a 2D uniform scale transformation around a center point. */
export const scaleTransform2d = (
  scaleFactor: number,
  center: Point2D = [0, 0]
): Transformation2D => {
  return getKernel().createScaleGTrsf2d(scaleFactor, center[0], center[1]);
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
  const kernel = getKernel();
  let geomSurf = kernel.extractSurfaceFromFace(face.wrapped);

  const bounds = uvBounds(face);

  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- KernelType is any but null is a valid sentinel
  let transformation: KernelType | null = null;

  if (scale === 'original' && faceGeomType(face) !== 'PLANE') {
    if (faceGeomType(face) !== 'CYLINDRE')
      return err(
        validationError(
          'UNSUPPORTED_FACE_TYPE',
          'Only planar and cylindrical faces can be unwrapped for sketching'
        )
      );

    const cylData = kernel.getSurfaceCylinderData(geomSurf);
    if (!cylData) {
      return err(
        validationError(
          'UNSUPPORTED_FACE_TYPE',
          'Could not extract cylinder data from face surface'
        )
      );
    }
    if (!cylData.isDirect) {
      geomSurf = kernel.reverseSurfaceU(geomSurf);
    }
    transformation = stretchTransform2d(1 / cylData.radius, [0, 1]);
  }

  if (scale === 'bounds') {
    const uAxis = kernel.createAxis2d(0, 0, 0, 1);
    const vAxis = kernel.createAxis2d(0, 0, 1, 0);

    transformation = kernel.createIdentityGTrsf2d();
    kernel.setGTrsf2dTranslationPart(transformation, 0, 0); // ensure identity state

    // Apply u-axis affinity
    const uAffinity = kernel.createAffinityGTrsf2d(0, 0, 0, 1, bounds.uMax - bounds.uMin);
    kernel.multiplyGTrsf2d(transformation, uAffinity);
    uAffinity.delete();

    if (bounds.uMin !== 0) {
      const trans = kernel.createIdentityGTrsf2d();
      kernel.setGTrsf2dTranslationPart(trans, 0, -bounds.uMin);
      kernel.multiplyGTrsf2d(transformation, trans);
      trans.delete();
    }

    // Apply v-axis affinity
    const vAffinity = kernel.createAffinityGTrsf2d(0, 0, 1, 0, bounds.vMax - bounds.vMin);
    kernel.multiplyGTrsf2d(transformation, vAffinity);
    vAffinity.delete();

    if (bounds.vMin !== 0) {
      const trans = kernel.createIdentityGTrsf2d();
      kernel.setGTrsf2dTranslationPart(trans, 0, -bounds.vMin);
      kernel.multiplyGTrsf2d(transformation, trans);
      trans.delete();
    }

    uAxis.delete();
    vAxis.delete();
  }

  const modifiedCurves = transformCurves(curves, transformation);
  const edges = curvesAsEdgesOnSurface(modifiedCurves, geomSurf);

  if (transformation) transformation.delete();

  return ok(edges);
}

/** Extract the 2D parametric curve of an edge on a face's surface. */
export function edgeToCurve(e: Edge, face: Face): Curve2D {
  const kernel = getKernel();
  const handle = kernel.extractCurve2dFromEdge(e.wrapped, face.wrapped);
  const curve = new Curve2D(handle);
  if (getOrientation(e) === 'backward') {
    kernel.reverseCurve2d(curve.wrapped);
  }
  return curve;
}
