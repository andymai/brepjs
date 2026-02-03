/**
 * Shape modification operations for OCCT.
 *
 * Provides fillet, chamfer, shell, and offset operations
 * for modifying existing 3D shapes.
 *
 * Used by OCCTAdapter - re-exported for backward compatibility.
 */

import type { OpenCascadeInstance, OcShape } from './types.js';

/**
 * Applies a fillet (rounded edge) to selected edges of a shape.
 */
export function fillet(
  oc: OpenCascadeInstance,
  shape: OcShape,
  edges: OcShape[],
  radius: number | ((edge: OcShape) => number)
): OcShape {
  const builder = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
  for (const edge of edges) {
    const r = typeof radius === 'function' ? radius(edge) : radius;
    if (r > 0) builder.Add_2(r, edge);
  }
  const result = builder.Shape();
  builder.delete();
  return result;
}

/**
 * Applies a chamfer (beveled edge) to selected edges of a shape.
 */
export function chamfer(
  oc: OpenCascadeInstance,
  shape: OcShape,
  edges: OcShape[],
  distance: number | ((edge: OcShape) => number)
): OcShape {
  const builder = new oc.BRepFilletAPI_MakeChamfer(shape);
  for (const edge of edges) {
    const d = typeof distance === 'function' ? distance(edge) : distance;
    if (d > 0) builder.Add_2(d, edge);
  }
  const result = builder.Shape();
  builder.delete();
  return result;
}

/**
 * Creates a shell (hollow shape) by removing faces and offsetting the remaining walls.
 */
export function shell(
  oc: OpenCascadeInstance,
  shape: OcShape,
  faces: OcShape[],
  thickness: number,
  tolerance = 1e-3
): OcShape {
  const facesToRemove = new oc.TopTools_ListOfShape_1();
  for (const face of faces) {
    facesToRemove.Append_1(face);
  }
  const progress = new oc.Message_ProgressRange_1();
  const builder = new oc.BRepOffsetAPI_MakeThickSolid();
  builder.MakeThickSolidByJoin(
    shape,
    facesToRemove,
    -thickness,
    tolerance,
    oc.BRepOffset_Mode.BRepOffset_Skin,
    false,
    false,
    oc.GeomAbs_JoinType.GeomAbs_Arc,
    false,
    progress
  );
  const result = builder.Shape();
  builder.delete();
  facesToRemove.delete();
  progress.delete();
  return result;
}

/**
 * Offsets all faces of a shape by a given distance.
 */
export function offset(
  oc: OpenCascadeInstance,
  shape: OcShape,
  distance: number,
  tolerance = 1e-6
): OcShape {
  const progress = new oc.Message_ProgressRange_1();
  const builder = new oc.BRepOffsetAPI_MakeOffsetShape();
  builder.PerformByJoin(
    shape,
    distance,
    tolerance,
    oc.BRepOffset_Mode.BRepOffset_Skin,
    false,
    false,
    oc.GeomAbs_JoinType.GeomAbs_Arc,
    false,
    progress
  );
  const result = builder.Shape();
  builder.delete();
  progress.delete();
  return result;
}
