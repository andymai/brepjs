import type { OcType } from '../../kernel/types.js';
import { getKernel } from '../../kernel/index.js';
import { localGC } from '../../core/memory.js';
import type { Point2D } from './definitions.js';

export const pnt = ([x, y]: Point2D): OcType => {
  const oc = getKernel().oc;
  return new oc.gp_Pnt2d_3(x, y);
};

export const direction2d = ([x, y]: Point2D): OcType => {
  const oc = getKernel().oc;
  return new oc.gp_Dir2d_4(x, y);
};

export const vec = ([x, y]: Point2D): OcType => {
  const oc = getKernel().oc;
  return new oc.gp_Vec2d_4(x, y);
};

export const axis2d = (point: Point2D, direction: Point2D): OcType => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();
  const axis = new oc.gp_Ax2d_2(r(pnt(point)), r(direction2d(direction)));
  gc();
  return axis;
};
