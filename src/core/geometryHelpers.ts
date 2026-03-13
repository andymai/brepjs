import type { Plane, PlaneName, PlaneInput } from './planeTypes.js';
import { resolvePlane } from './planeOps.js';
import type { Vec3, PointInput } from './types.js';
import { toVec3 } from './types.js';
import type { KernelType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';

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
 * Mirror an kernel shape across a plane.
 *
 * The mirror plane can be specified as a `PlaneName`, a `Plane` object,
 * or a direction vector (used as the plane normal). Defaults to the YZ plane.
 *
 * @param shape - Raw kernel shape to mirror.
 * @param inputPlane - Mirror plane specification.
 * @param origin - Override origin for the mirror plane.
 * @returns A new mirrored kernel shape.
 */
export function mirror(
  shape: KernelType,
  inputPlane?: PlaneInput | PointInput,
  origin?: PointInput
): KernelType {
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

  const newShape = getKernel().mirror(shape, originVec, directionVec);

  return newShape;
}
