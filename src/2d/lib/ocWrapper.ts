import type { KernelType } from '../../kernel/types.js';
import { getKernel2D } from '../../kernel/index.js';
import type { Point2D } from './definitions.js';

/** Create an kernel `gp_Pnt2d` from a `Point2D`. */
export const pnt = ([x, y]: Point2D): KernelType => {
  return getKernel2D().createPoint2d(x, y);
};

/** Create an kernel `gp_Vec2d` from a `Point2D`. */
export const vec = ([x, y]: Point2D): KernelType => {
  return getKernel2D().createVector2d(x, y);
};

/** Create an kernel `gp_Ax2d` (2D axis) from a point and a direction. */
export const axis2d = (point: Point2D, direction: Point2D): KernelType => {
  return getKernel2D().createAxis2d(point[0], point[1], direction[0], direction[1]);
};
