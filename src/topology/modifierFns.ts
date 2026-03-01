/**
 * Functional modifier operations — fillet, chamfer, shell, thicken, offset.
 *
 * These are standalone functions that operate on branded shape types
 * and return Result values.
 */

import { getKernel } from '../kernel/index.js';
import type { Edge, Face, Shell, Solid, Shape3D } from '../core/shapeTypes.js';
import { castShape, isShape3D } from '../core/shapeTypes.js';
import { type Result, ok, err, isErr } from '../core/result.js';
import { occtError, validationError, BrepErrorCode } from '../core/errors.js';
import { DisposalScope } from '../core/disposal.js';
import { getEdges, propagateOrigins } from './shapeFns.js';
import { propagateFaceTags } from './faceTagFns.js';
import { propagateColors } from './colorFns.js';

// ---------------------------------------------------------------------------
// Pre-validation
// ---------------------------------------------------------------------------

function validateNotNull(
  shape: { wrapped: { IsNull(): boolean } },
  label: string
): Result<undefined> {
  if (shape.wrapped.IsNull()) {
    return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, `${label} is a null shape`));
  }
  return ok(undefined);
}

/**
 * Thickens a surface (face or shell) into a solid by offsetting it.
 *
 * Takes a planar or non-planar surface shape and creates a solid
 * by offsetting it by the given thickness. Positive thickness offsets
 * along the surface normal; negative thickness offsets against it.
 */
export function thicken(shape: Face | Shell, thickness: number): Result<Solid> {
  const check = validateNotNull(shape, 'thicken: shape');
  if (isErr(check)) return check;

  try {
    const oc = getKernel().oc;
    using scope = new DisposalScope();
    const builder = scope.register(new oc.BRepOffsetAPI_MakeThickSolid());
    builder.MakeThickSolidBySimple(shape.wrapped, thickness);
    const progress = scope.register(new oc.Message_ProgressRange_1());
    builder.Build(progress);

    const resultOc = builder.Shape();
    const cast = castShape(resultOc) as Solid;
    propagateOrigins(builder, [shape], cast);
    propagateFaceTags(builder, [shape], cast);
    propagateColors(builder, [shape], cast);
    return ok(cast);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(occtError('THICKEN_FAILED', `Thicken operation failed: ${raw}`, e));
  }
}

// ---------------------------------------------------------------------------
// Fillet
// ---------------------------------------------------------------------------

/**
 * Apply a fillet (rounded edge) to selected edges of a 3D shape.
 *
 * @param shape - The shape to modify.
 * @param edges - Edges to fillet. Pass `undefined` to fillet all edges.
 * @param radius - Constant radius, variable radius `[r1, r2]`, or per-edge callback.
 */
export function fillet(
  shape: Shape3D,
  edges: ReadonlyArray<Edge> | undefined,
  radius: number | [number, number] | ((edge: Edge) => number | [number, number] | null)
): Result<Shape3D> {
  const check = validateNotNull(shape, 'fillet: shape');
  if (isErr(check)) return check;
  if (typeof radius === 'number' && radius <= 0) {
    return err(
      validationError(
        'INVALID_FILLET_RADIUS',
        'Fillet radius must be positive',
        undefined,
        undefined,
        'Provide a positive radius value greater than 0'
      )
    );
  }
  if (Array.isArray(radius) && (radius[0] <= 0 || radius[1] <= 0)) {
    return err(
      validationError(
        'INVALID_FILLET_RADIUS',
        'Fillet radii must both be positive',
        undefined,
        undefined,
        'Both radius values must be greater than 0'
      )
    );
  }

  const selectedEdges = edges ?? getEdges(shape);
  if (selectedEdges.length === 0) {
    return err(
      validationError(
        BrepErrorCode.FILLET_NO_EDGES,
        'No edges found for fillet',
        undefined,
        undefined,
        'Check that the shape has edges, or adjust your edge finder criteria'
      )
    );
  }

  try {
    const oc = getKernel().oc;
    using scope = new DisposalScope();
    const builder = scope.register(
      new oc.BRepFilletAPI_MakeFillet(shape.wrapped, oc.ChFi3d_FilletShape.ChFi3d_Rational)
    );

    for (const edge of selectedEdges) {
      const rad = typeof radius === 'function' ? (radius(edge) ?? 0) : radius;
      if (typeof rad === 'number') {
        if (rad > 0) builder.Add_2(rad, edge.wrapped);
      } else {
        const [r1, r2] = rad;
        if (r1 > 0 && r2 > 0) builder.Add_3(r1, r2, edge.wrapped);
      }
    }

    const resultOc = builder.Shape();
    const cast = castShape(resultOc);
    if (!isShape3D(cast)) {
      return err(occtError(BrepErrorCode.FILLET_NOT_3D, 'Fillet result is not a 3D shape'));
    }
    propagateOrigins(builder, [shape], cast);
    propagateFaceTags(builder, [shape], cast);
    propagateColors(builder, [shape], cast);
    return ok(cast);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      occtError('FILLET_FAILED', `Fillet operation failed: ${raw}`, e, {
        operation: 'fillet',
        edgeCount: selectedEdges.length,
        radius,
      })
    );
  }
}

// ---------------------------------------------------------------------------
// Chamfer
// ---------------------------------------------------------------------------

/**
 * Apply a chamfer (beveled edge) to selected edges of a 3D shape.
 *
 * @param shape - The shape to modify.
 * @param edges - Edges to chamfer. Pass `undefined` to chamfer all edges.
 * @param distance - Symmetric distance, asymmetric `[d1, d2]`, or per-edge callback.
 */
export function chamfer(
  shape: Shape3D,
  edges: ReadonlyArray<Edge> | undefined,
  distance: number | [number, number] | ((edge: Edge) => number | [number, number] | null)
): Result<Shape3D> {
  const check = validateNotNull(shape, 'chamfer: shape');
  if (isErr(check)) return check;
  if (typeof distance === 'number' && distance <= 0) {
    return err(
      validationError(
        'INVALID_CHAMFER_DISTANCE',
        'Chamfer distance must be positive',
        undefined,
        undefined,
        'Provide a positive distance value greater than 0'
      )
    );
  }
  if (Array.isArray(distance) && (distance[0] <= 0 || distance[1] <= 0)) {
    return err(
      validationError(
        'INVALID_CHAMFER_DISTANCE',
        'Chamfer distances must both be positive',
        undefined,
        undefined,
        'Both distance values must be greater than 0'
      )
    );
  }

  const selectedEdges = edges ?? getEdges(shape);
  if (selectedEdges.length === 0) {
    return err(validationError(BrepErrorCode.CHAMFER_NO_EDGES, 'No edges found for chamfer'));
  }

  try {
    const oc = getKernel().oc;
    using scope = new DisposalScope();
    const builder = scope.register(new oc.BRepFilletAPI_MakeChamfer(shape.wrapped));

    // Build edge→face map lazily for asymmetric chamfers
    let edgeFaceMap: Map<number, { HashCode(max: number): number }> | null = null;
    function getEdgeFaceMap() {
      if (edgeFaceMap) return edgeFaceMap;
      edgeFaceMap = new Map();
      const faceExp = new oc.TopExp_Explorer_2(
        shape.wrapped,
        oc.TopAbs_ShapeEnum.TopAbs_FACE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
      );
      while (faceExp.More()) {
        const face = oc.TopoDS.Face_1(faceExp.Current());
        const edgeExp = new oc.TopExp_Explorer_2(
          face,
          oc.TopAbs_ShapeEnum.TopAbs_EDGE,
          oc.TopAbs_ShapeEnum.TopAbs_SHAPE
        );
        while (edgeExp.More()) {
          const hash = edgeExp.Current().HashCode(2147483647);
          if (!edgeFaceMap.has(hash)) {
            edgeFaceMap.set(hash, face);
          }
          edgeExp.Next();
        }
        edgeExp.delete();
        faceExp.Next();
      }
      faceExp.delete();
      return edgeFaceMap;
    }

    for (const edge of selectedEdges) {
      const d = typeof distance === 'function' ? (distance(edge) ?? 0) : distance;
      if (typeof d === 'number') {
        if (d > 0) builder.Add_2(d, edge.wrapped);
      } else {
        const [d1, d2] = d;
        if (d1 > 0 && d2 > 0) {
          const face = getEdgeFaceMap().get(edge.wrapped.HashCode(2147483647));
          if (face) {
            builder.Add_3(d1, d2, oc.TopoDS.Edge_1(edge.wrapped), face);
          }
        }
      }
    }

    const resultOc = builder.Shape();
    const cast = castShape(resultOc);
    if (!isShape3D(cast)) {
      return err(occtError(BrepErrorCode.CHAMFER_NOT_3D, 'Chamfer result is not a 3D shape'));
    }
    propagateOrigins(builder, [shape], cast);
    propagateFaceTags(builder, [shape], cast);
    propagateColors(builder, [shape], cast);
    return ok(cast);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      occtError('CHAMFER_FAILED', `Chamfer operation failed: ${raw}`, e, {
        operation: 'chamfer',
        edgeCount: selectedEdges.length,
        distance,
      })
    );
  }
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

/**
 * Create a hollow shell by removing faces and offsetting remaining walls.
 *
 * @param shape - The solid to hollow out.
 * @param faces - Faces to remove.
 * @param thickness - Wall thickness.
 * @param tolerance - Shell operation tolerance (default 1e-3).
 */
export function shell(
  shape: Shape3D,
  faces: ReadonlyArray<Face>,
  thickness: number,
  tolerance = 1e-3
): Result<Shape3D> {
  const check = validateNotNull(shape, 'shell: shape');
  if (isErr(check)) return check;
  if (thickness <= 0) {
    return err(validationError('INVALID_THICKNESS', 'Shell thickness must be positive'));
  }
  if (faces.length === 0) {
    return err(validationError('NO_FACES', 'At least one face must be specified for shell'));
  }

  try {
    const oc = getKernel().oc;
    using scope = new DisposalScope();
    const facesToRemove = scope.register(new oc.TopTools_ListOfShape_1());
    for (const face of faces) {
      facesToRemove.Append_1(face.wrapped);
    }
    const progress = scope.register(new oc.Message_ProgressRange_1());
    const builder = scope.register(new oc.BRepOffsetAPI_MakeThickSolid());
    builder.MakeThickSolidByJoin(
      shape.wrapped,
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

    const resultOc = builder.Shape();
    const cast = castShape(resultOc);
    if (!isShape3D(cast)) {
      return err(occtError('SHELL_RESULT_NOT_3D', 'Shell result is not a 3D shape'));
    }
    propagateOrigins(builder, [shape], cast);
    propagateFaceTags(builder, [shape], cast);
    propagateColors(builder, [shape], cast);
    return ok(cast);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      occtError('SHELL_FAILED', `Shell operation failed: ${raw}`, e, {
        operation: 'shell',
        faceCount: faces.length,
        thickness,
      })
    );
  }
}

// ---------------------------------------------------------------------------
// Offset
// ---------------------------------------------------------------------------

/**
 * Offset all faces of a shape by a given distance.
 *
 * @param shape - The shape to offset (must be a 3D shape with faces).
 * @param distance - Offset distance (positive = outward, negative = inward).
 * @param tolerance - Offset tolerance (default 1e-6).
 */
export function offset(shape: Shape3D, distance: number, tolerance = 1e-6): Result<Shape3D> {
  const check = validateNotNull(shape, 'offset: shape');
  if (isErr(check)) return check;
  if (distance === 0) {
    return err(validationError('ZERO_OFFSET', 'Offset distance cannot be zero'));
  }

  try {
    const oc = getKernel().oc;
    using scope = new DisposalScope();
    const progress = scope.register(new oc.Message_ProgressRange_1());
    const builder = scope.register(new oc.BRepOffsetAPI_MakeOffsetShape());
    builder.PerformByJoin(
      shape.wrapped,
      distance,
      tolerance,
      oc.BRepOffset_Mode.BRepOffset_Skin,
      false,
      false,
      oc.GeomAbs_JoinType.GeomAbs_Arc,
      false,
      progress
    );

    const resultOc = builder.Shape();
    const cast = castShape(resultOc);
    if (!isShape3D(cast)) {
      return err(occtError('OFFSET_RESULT_NOT_3D', 'Offset result is not a 3D shape'));
    }
    propagateOrigins(builder, [shape], cast);
    propagateFaceTags(builder, [shape], cast);
    propagateColors(builder, [shape], cast);
    return ok(cast);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(occtError('OFFSET_FAILED', `Offset operation failed: ${raw}`, e));
  }
}
