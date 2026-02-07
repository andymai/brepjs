import type { Plane, PlaneName, PlaneInput } from './planeTypes.js';
import { resolvePlane } from './planeOps.js';
import type { Vec3, PointInput } from './types.js';
import { toVec3 } from './types.js';
import { localGC } from './memory.js';
import type { OcType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import { makeOcAx2 } from './occtBoundary.js';

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
