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
