/**
 * Transform operations for OCCT shapes.
 *
 * Provides translate, rotate, mirror, scale, and generic transform operations.
 * Used by OCCTAdapter - re-exported for backward compatibility.
 */

import type { OpenCascadeInstance, OcShape, OcType } from './types.js';

/**
 * Applies a transformation matrix to a shape.
 */
export function transform(oc: OpenCascadeInstance, shape: OcShape, trsf: OcType): OcShape {
  const transformer = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true);
  const result = transformer.ModifiedShape(shape);
  transformer.delete();
  return result;
}

/**
 * Translates a shape by the given offset.
 */
export function translate(
  oc: OpenCascadeInstance,
  shape: OcShape,
  x: number,
  y: number,
  z: number
): OcShape {
  const trsf = new oc.gp_Trsf_1();
  const vec = new oc.gp_Vec_4(x, y, z);
  trsf.SetTranslation_1(vec);
  const result = transform(oc, shape, trsf);
  trsf.delete();
  vec.delete();
  return result;
}

/**
 * Rotates a shape around an axis.
 */
export function rotate(
  oc: OpenCascadeInstance,
  shape: OcShape,
  angle: number,
  axis: [number, number, number] = [0, 0, 1],
  center: [number, number, number] = [0, 0, 0]
): OcShape {
  const trsf = new oc.gp_Trsf_1();
  const origin = new oc.gp_Pnt_3(...center);
  const dir = new oc.gp_Dir_4(...axis);
  const ax1 = new oc.gp_Ax1_2(origin, dir);
  trsf.SetRotation_1(ax1, (angle * Math.PI) / 180);
  const result = transform(oc, shape, trsf);
  trsf.delete();
  ax1.delete();
  origin.delete();
  dir.delete();
  return result;
}

/**
 * Mirrors a shape through a plane.
 */
export function mirror(
  oc: OpenCascadeInstance,
  shape: OcShape,
  origin: [number, number, number],
  normal: [number, number, number]
): OcShape {
  const trsf = new oc.gp_Trsf_1();
  const pnt = new oc.gp_Pnt_3(...origin);
  const dir = new oc.gp_Dir_4(...normal);
  const ax2 = new oc.gp_Ax2_3(pnt, dir);
  trsf.SetMirror_3(ax2);
  const result = transform(oc, shape, trsf);
  trsf.delete();
  ax2.delete();
  pnt.delete();
  dir.delete();
  return result;
}

/**
 * Scales a shape uniformly around a center point.
 */
export function scale(
  oc: OpenCascadeInstance,
  shape: OcShape,
  center: [number, number, number],
  factor: number
): OcShape {
  const trsf = new oc.gp_Trsf_1();
  const pnt = new oc.gp_Pnt_3(...center);
  trsf.SetScale(pnt, factor);
  const result = transform(oc, shape, trsf);
  trsf.delete();
  pnt.delete();
  return result;
}

/**
 * Simplifies a shape by unifying same-domain surfaces.
 */
export function simplify(oc: OpenCascadeInstance, shape: OcShape): OcShape {
  const upgrader = new oc.ShapeUpgrade_UnifySameDomain_2(shape, true, true, false);
  upgrader.Build();
  const result = upgrader.Shape();
  upgrader.delete();
  return result;
}
