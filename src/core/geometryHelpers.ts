import {
  createNamedPlane,
  Plane,
  type PlaneName,
  type Point,
  Transformation,
  Vector,
} from './geometry.js';
import { localGC } from './memory.js';
import { unwrap } from './result.js';
import type { OcType } from '../kernel/types.js';

export const makePlaneFromFace = (
  face: { pointOnSurface: (u: number, v: number) => Vector; normalAt: (p: Vector) => Vector },
  originOnSurface: [number, number] = [0, 0]
): Plane => {
  const [r, gc] = localGC();
  const originPoint = r(face.pointOnSurface(...originOnSurface));
  const normal = r(face.normalAt(originPoint));
  const v = r(new Vector([0, 0, 1]));
  let xd = v.cross(normal);
  if (xd.Length < 1e-8) {
    xd.delete();
    xd = new Vector([1, 0, 0]);
  }
  r(xd);

  const plane = new Plane(originPoint, xd, normal);
  gc();
  return plane;
};

function makePlane(plane: Plane): Plane;
function makePlane(plane?: PlaneName, origin?: Point | number): Plane;
function makePlane(plane: Plane | PlaneName = 'XY', origin: Point | number = [0, 0, 0]): Plane {
  if (plane instanceof Plane) {
    return plane.clone();
  } else {
    return unwrap(createNamedPlane(plane, origin));
  }
}

export { makePlane };

export function rotate(
  shape: OcType,
  angle: number,
  position: Point = [0, 0, 0],
  direction: Point = [0, 0, 1]
): OcType {
  const [r, gc] = localGC();
  const transformation = r(new Transformation());
  transformation.rotate(angle, position, direction);
  const newShape = transformation.transform(shape);
  gc();
  return newShape;
}

export function translate(shape: OcType, vector: Point): OcType {
  const [r, gc] = localGC();
  const transformation = r(new Transformation());
  transformation.translate(vector);
  const newShape = transformation.transform(shape);
  gc();
  return newShape;
}

export function mirror(
  shape: OcType,
  inputPlane?: Plane | PlaneName | Point,
  origin?: Point
): OcType {
  const [r, gc] = localGC();
  const transformation = r(new Transformation());
  transformation.mirror(inputPlane, origin);
  const newShape = transformation.transform(shape);
  gc();
  return newShape;
}

export function scale(shape: OcType, center: Point, scaleFactor: number): OcType {
  const [r, gc] = localGC();
  const transformation = r(new Transformation());
  transformation.scale(center, scaleFactor);
  const newShape = transformation.transform(shape);
  gc();
  return newShape;
}
