import type { Plane, PlaneName, PlaneInput } from './planeTypes.js';
import { createPlane, resolvePlane } from './planeOps.js';
import type { Vec3, PointInput } from './types.js';
import { toVec3 } from './types.js';
import { vecCross, vecLength, vecNormalize } from './vecOps.js';
import { localGC } from './memory.js';
import type { OcType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import { toOcPnt, toOcVec, makeOcAx1, makeOcAx2 } from './occtBoundary.js';
import { DEG2RAD } from './constants.js';

/**
 * Derive a {@link Plane} from a face's surface geometry.
 *
 * @param face - Object exposing `pointOnSurface` and `normalAt` (e.g. a Face shape).
 * @param originOnSurface - UV coordinates on the face surface used as the plane origin.
 * @default originOnSurface `[0, 0]`
 */
export const makePlaneFromFace = (
  face: { pointOnSurface: (u: number, v: number) => Vec3; normalAt: (p?: Vec3) => Vec3 },
  originOnSurface: [number, number] = [0, 0]
): Plane => {
  const originPoint = face.pointOnSurface(...originOnSurface);
  const normal = face.normalAt(originPoint);
  const ref: Vec3 = [0, 0, 1];
  let xd = vecCross(ref, normal);
  if (vecLength(xd) < 1e-8) {
    xd = [1, 0, 0];
  }
  xd = vecNormalize(xd);

  return createPlane(originPoint, xd, normal);
};

/**
 * Create or copy a {@link Plane}.
 *
 * When called with a `Plane` object, returns a shallow copy.
 * When called with a `PlaneName` string (or no arguments), resolves the named
 * plane with an optional origin offset.
 *
 * @param plane - A `Plane` object to copy, or a `PlaneName` string to resolve.
 * @param origin - Origin point or scalar offset along the plane normal.
 * @default plane `'XY'`
 */
function makePlane(plane: Plane): Plane;
function makePlane(plane?: PlaneName, origin?: PointInput | number): Plane;
function makePlane(plane?: PlaneInput, origin?: PointInput | number): Plane {
  if (plane && typeof plane !== 'string') {
    // Already a Plane object - return a copy
    return { ...plane };
  } else {
    return resolvePlane(plane ?? 'XY', origin);
  }
}

export { makePlane };

/**
 * Rotate an OCCT shape around an axis.
 *
 * @param shape - Raw OCCT shape to rotate.
 * @param angle - Rotation angle in **degrees**.
 * @param position - Point on the rotation axis.
 * @param direction - Direction vector of the rotation axis.
 * @returns A new rotated OCCT shape (the original is not modified).
 */
export function rotate(
  shape: OcType,
  angle: number,
  position: PointInput = [0, 0, 0],
  direction: PointInput = [0, 0, 1]
): OcType {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const posVec = toVec3(position);
  const dirVec = toVec3(direction);
  const ax = r(makeOcAx1(posVec, dirVec));

  const trsf = r(new oc.gp_Trsf_1());
  trsf.SetRotation_1(ax, angle * DEG2RAD);

  const transformer = r(new oc.BRepBuilderAPI_Transform_2(shape, trsf, true));
  const newShape = transformer.ModifiedShape(shape);

  gc();
  return newShape;
}

/**
 * Translate an OCCT shape by a displacement vector.
 *
 * @param shape - Raw OCCT shape to translate.
 * @param vector - Translation vector `[dx, dy, dz]`.
 * @returns A new translated OCCT shape.
 */
export function translate(shape: OcType, vector: PointInput): OcType {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const vecArr = toVec3(vector);
  const ocVec = r(toOcVec(vecArr));

  const trsf = r(new oc.gp_Trsf_1());
  trsf.SetTranslation_1(ocVec);

  const transformer = r(new oc.BRepBuilderAPI_Transform_2(shape, trsf, true));
  const newShape = transformer.ModifiedShape(shape);

  gc();
  return newShape;
}

/**
 * Mirror an OCCT shape across a plane.
 *
 * The mirror plane can be specified as a `PlaneName`, a `Plane` object,
 * or a direction vector (used as the plane normal). Defaults to the YZ plane.
 *
 * @param shape - Raw OCCT shape to mirror.
 * @param inputPlane - Mirror plane specification.
 * @param origin - Override origin for the mirror plane.
 * @returns A new mirrored OCCT shape.
 */
export function mirror(
  shape: OcType,
  inputPlane?: PlaneInput | PointInput,
  origin?: PointInput
): OcType {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  let originVec: Vec3;
  let directionVec: Vec3;

  if (typeof inputPlane === 'string') {
    // PlaneName
    const plane = resolvePlane(inputPlane, origin);
    originVec = plane.origin;
    directionVec = plane.zDir;
  } else if (
    inputPlane &&
    typeof inputPlane === 'object' &&
    'origin' in inputPlane &&
    'zDir' in inputPlane
  ) {
    // Plane object
    originVec = origin ? toVec3(origin) : inputPlane.origin;
    directionVec = inputPlane.zDir;
  } else if (inputPlane) {
    // Point (direction)
    originVec = origin ? toVec3(origin) : [0, 0, 0];
    directionVec = toVec3(inputPlane as PointInput);
  } else {
    // Default: YZ plane
    const plane = resolvePlane('YZ', origin);
    originVec = plane.origin;
    directionVec = plane.zDir;
  }

  const mirrorAxis = r(makeOcAx2(originVec, directionVec));

  const trsf = r(new oc.gp_Trsf_1());
  trsf.SetMirror_3(mirrorAxis);

  const transformer = r(new oc.BRepBuilderAPI_Transform_2(shape, trsf, true));
  const newShape = transformer.ModifiedShape(shape);

  gc();
  return newShape;
}

/**
 * Scale an OCCT shape uniformly around a center point.
 *
 * @param shape - Raw OCCT shape to scale.
 * @param center - Center of scaling.
 * @param scaleFactor - Uniform scale factor (> 0).
 * @returns A new scaled OCCT shape.
 */
export function scale(shape: OcType, center: PointInput, scaleFactor: number): OcType {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const centerVec = toVec3(center);
  const pnt = r(toOcPnt(centerVec));

  const trsf = r(new oc.gp_Trsf_1());
  trsf.SetScale(pnt, scaleFactor);

  const transformer = r(new oc.BRepBuilderAPI_Transform_2(shape, trsf, true));
  const newShape = transformer.ModifiedShape(shape);

  gc();
  return newShape;
}
