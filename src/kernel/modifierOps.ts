/**
 * Shape modification operations for OCCT.
 *
 * Provides fillet, chamfer, shell, and offset operations
 * for modifying existing 3D shapes.
 *
 * Used by OCCTAdapter - re-exported for backward compatibility.
 */

import type { OpenCascadeInstance, OcShape } from './types.js';

export type FilletRadiusSpec =
  | number
  | [number, number]
  | ((edge: OcShape) => number | [number, number]);

/**
 * Applies a fillet (rounded edge) to selected edges of a shape.
 * Supports constant radius, variable radius [r1, r2], and per-edge callbacks.
 */
export function fillet(
  oc: OpenCascadeInstance,
  shape: OcShape,
  edges: OcShape[],
  radius: FilletRadiusSpec
): OcShape {
  const builder = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
  for (const edge of edges) {
    const r = typeof radius === 'function' ? radius(edge) : radius;
    if (typeof r === 'number') {
      if (r > 0) builder.Add_2(r, edge);
    } else {
      const [r1, r2] = r;
      if (r1 > 0 && r2 > 0) builder.Add_3(r1, r2, edge);
    }
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
 * Thickens a surface (face/shell) into a solid by offsetting it.
 * Uses the simple offset approach (BRepOffsetAPI_MakeThickSolid.MakeThickSolidBySimple).
 */
export function thicken(oc: OpenCascadeInstance, shape: OcShape, thickness: number): OcShape {
  const builder = new oc.BRepOffsetAPI_MakeThickSolid();
  builder.MakeThickSolidBySimple(shape, thickness);
  const progress = new oc.Message_ProgressRange_1();
  builder.Build(progress);
  const result = builder.Shape();
  builder.delete();
  progress.delete();
  return result;
}

/**
 * Applies a chamfer with distance + angle to selected edges of a shape.
 *
 * Each edge requires a face that contains it, so the shape's faces are iterated
 * to find a containing face for each edge.
 */
export function chamferDistAngle(
  oc: OpenCascadeInstance,
  shape: OcShape,
  edges: OcShape[],
  distance: number,
  angleDeg: number
): OcShape {
  const builder = new oc.BRepFilletAPI_MakeChamfer(shape);
  const angleRad = (angleDeg * Math.PI) / 180;

  // Collect faces as properly downcast TopoDS_Face instances
  const faces: OcShape[] = [];
  const faceExplorer = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  while (faceExplorer.More()) {
    faces.push(oc.TopoDS.Face_1(faceExplorer.Current()));
    faceExplorer.Next();
  }
  faceExplorer.delete();

  for (const edge of edges) {
    // Find a face containing this edge
    let containingFace: OcShape | null = null;
    for (const face of faces) {
      const edgeExplorer = new oc.TopExp_Explorer_2(
        face,
        oc.TopAbs_ShapeEnum.TopAbs_EDGE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
      );
      let found = false;
      while (edgeExplorer.More()) {
        if (edgeExplorer.Current().IsSame(edge)) {
          found = true;
          break;
        }
        edgeExplorer.Next();
      }
      edgeExplorer.delete();
      if (found) {
        containingFace = face;
        break;
      }
    }
    if (containingFace && distance > 0) {
      // Edge must also be downcast to TopoDS_Edge for the AddDA binding
      builder.AddDA(distance, angleRad, oc.TopoDS.Edge_1(edge), containingFace);
    }
  }

  const result = builder.Shape();
  builder.delete();
  return result;
}

/**
 * Offsets a 2D wire by the given distance.
 * joinType: the raw OCCT GeomAbs_JoinType enum value.
 */
export function offsetWire2D(
  oc: OpenCascadeInstance,
  wire: OcShape,
  offsetVal: number,
  joinType?: number
): OcShape {
  // Default to GeomAbs_Arc if no joinType provided
  const jt = joinType ?? oc.GeomAbs_JoinType.GeomAbs_Arc;
  const offsetter = new oc.BRepOffsetAPI_MakeOffset_3(wire, jt, false);
  offsetter.Perform(offsetVal, 0);
  const result = offsetter.Shape();
  offsetter.delete();
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
