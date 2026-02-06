import type { OcType } from '../../kernel/types.js';
import { getKernel } from '../../kernel/index.js';
import { localGC } from '../../core/memory.js';
import type { Point2D } from './definitions.js';

/** Create an OCCT `gp_Pnt2d` from a `Point2D`. */
export const pnt = ([x, y]: Point2D): OcType => {
  const oc = getKernel().oc;
  return new oc.gp_Pnt2d_3(x, y);
};

/** Create an OCCT `gp_Dir2d` from a `Point2D`. */
export const direction2d = ([x, y]: Point2D): OcType => {
  const oc = getKernel().oc;
  return new oc.gp_Dir2d_4(x, y);
};

/** Create an OCCT `gp_Vec2d` from a `Point2D`. */
export const vec = ([x, y]: Point2D): OcType => {
  const oc = getKernel().oc;
  return new oc.gp_Vec2d_4(x, y);
};

/** Create an OCCT `gp_Ax2d` (2D axis) from a point and a direction. */
export const axis2d = (point: Point2D, direction: Point2D): OcType => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();
  const axis = new oc.gp_Ax2d_2(r(pnt(point)), r(direction2d(direction)));
  gc();
  return axis;
};
