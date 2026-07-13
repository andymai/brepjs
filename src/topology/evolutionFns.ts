/**
 * Evolution-tracking variants of boolean and modifier operations.
 *
 * These functions mirror the standard fuse/cut/intersect/fillet/chamfer/shell
 * operations but additionally return the ShapeEvolution data, enabling
 * persistent face selections, constraint tracking, and custom face-level logic.
 */

import { getKernel } from '@/kernel/index.js';
import type { Edge, Face, Shape3D } from '@/core/shapeTypes.js';
import type { ValidSolid } from '@/core/validityTypes.js';
import { castShape, castResultShape, disposeDowncastSource, isShape3D } from '@/core/shapeTypes.js';
import { HASH_CODE_MAX } from '@/core/constants.js';
import { type Result, ok, err, isErr } from '@/core/result.js';
import { validationError, typeCastError, kernelError, BrepErrorCode } from '@/core/errors.js';
import type { BooleanOptions, KernelShape, ShapeEvolution, KernelType } from '@/kernel/types.js';
import { getEdges } from './shapeFns.js';
import { collectInputFaceHashes, propagateAllMetadata } from './metadata/metadataPropagation.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of an operation with face evolution tracking. */
export interface EvolutionResult<T> {
  readonly shape: T;
  readonly evolution: ShapeEvolution;
}

// ---------------------------------------------------------------------------
// Pre-validation (inlined from booleanFns.ts to keep change self-contained)
// ---------------------------------------------------------------------------

function validateShape3D(shape: Shape3D, label: string): Result<undefined> {
  if (getKernel().isNull(shape.wrapped)) {
    return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, `${label} is a null shape`));
  }
  return ok(undefined);
}

function validateNotNull(
  shape: { wrapped: { IsNull(): boolean } },
  label: string
): Result<undefined> {
  if (getKernel().isNull(shape.wrapped)) {
    return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, `${label} is a null shape`));
  }
  return ok(undefined);
}

function castToShape3D(
  shape: KernelType,
  errorCode: string,
  errorMsg: string,
  suggestion?: string
): Result<Shape3D> {
  const wrapped = castShape(shape);
  if (!isShape3D(wrapped)) {
    const shapeType = shape.ShapeType();
    const typeNames = [
      'COMPOUND',
      'COMPSOLID',
      'SOLID',
      'SHELL',
      'FACE',
      'WIRE',
      'EDGE',
      'VERTEX',
      'SHAPE',
    ];
    const typeName = typeNames[shapeType] ?? `UNKNOWN(${shapeType})`;
    wrapped[Symbol.dispose]();
    return err(
      typeCastError(
        errorCode,
        `${errorMsg}. Got ${typeName} instead.`,
        undefined,
        undefined,
        suggestion
      )
    );
  }
  disposeDowncastSource(shape, wrapped);
  return ok(wrapped);
}

// ---------------------------------------------------------------------------
// Edge callback resolution (inlined from modifierFns.ts)
// ---------------------------------------------------------------------------

/** Kernel-compatible callback type: looks up value by raw kernel shape hash. */
type KernelHashCallback<V> = (ocShape: KernelShape) => V;

function resolveEdgeCallback(
  selectedEdges: ReadonlyArray<Edge>,
  callbackFn: (edge: Edge) => number | [number, number] | null
): { edges: Edge[]; kernelParam: KernelHashCallback<number | [number, number]> } | null {
  const filteredEdges: Edge[] = [];
  const hashToValue = new Map<number, number | [number, number]>();

  for (const edge of selectedEdges) {
    const val = callbackFn(edge) ?? 0;
    if (typeof val === 'number' && val <= 0) continue;
    if (Array.isArray(val) && (val[0] <= 0 || val[1] <= 0)) continue;
    filteredEdges.push(edge);
    hashToValue.set(getKernel().hashCode(edge.wrapped, HASH_CODE_MAX), val);
  }
  if (filteredEdges.length === 0) return null;

  const kernelParam: KernelHashCallback<number | [number, number]> = (ocEdge) => {
    const v = hashToValue.get(getKernel().hashCode(ocEdge, HASH_CODE_MAX));
    return v ?? 1;
  };
  return { edges: filteredEdges, kernelParam };
}

// ---------------------------------------------------------------------------
// Boolean evolution variants
// ---------------------------------------------------------------------------

/**
 * Fuse two 3D shapes together (boolean union), returning both the result
 * shape and the face evolution data.
 *
 * @param a - The first operand.
 * @param b - The second operand.
 * @param options - Boolean operation options.
 * @returns Ok with the fused shape and evolution, or Err on failure.
 */
export function fuseWithEvolution(
  a: ValidSolid,
  b: ValidSolid,
  options?: BooleanOptions
): Result<EvolutionResult<ValidSolid>>;
export function fuseWithEvolution(
  a: Shape3D,
  b: Shape3D,
  options?: BooleanOptions
): Result<EvolutionResult<Shape3D>>;
export function fuseWithEvolution(
  a: Shape3D,
  b: Shape3D,
  { optimisation = 'none', simplify = false, signal, fuzzyValue }: BooleanOptions = {}
): Result<EvolutionResult<Shape3D>> {
  if (signal?.aborted) throw signal.reason;
  const checkA = validateShape3D(a, 'fuseWithEvolution: first operand');
  if (isErr(checkA)) return checkA;
  const checkB = validateShape3D(b, 'fuseWithEvolution: second operand');
  if (isErr(checkB)) return checkB;
  const inputFaceHashes = collectInputFaceHashes([a, b]);
  const { shape: resultShape, evolution } = getKernel().fuseWithHistory(
    a.wrapped,
    b.wrapped,
    inputFaceHashes,
    HASH_CODE_MAX,
    { optimisation, simplify, fuzzyValue }
  );
  const fuseResult = castToShape3D(
    resultShape,
    'FUSE_NOT_3D',
    'Fuse did not produce a 3D shape',
    'Common causes: overlapping coplanar faces, zero-thickness geometry, or non-manifold input. Try autoHeal() on inputs first.'
  );
  if (fuseResult.ok) {
    propagateAllMetadata(evolution, [a, b], fuseResult.value);
    return ok({ shape: fuseResult.value, evolution });
  }
  return fuseResult;
}

/**
 * Cut a tool shape from a base shape (boolean subtraction), returning both
 * the result shape and the face evolution data.
 *
 * @param base - The shape to cut from.
 * @param tool - The shape to subtract.
 * @param options - Boolean operation options.
 * @returns Ok with the cut shape and evolution, or Err on failure.
 */
export function cutWithEvolution(
  base: ValidSolid,
  tool: ValidSolid,
  options?: BooleanOptions
): Result<EvolutionResult<ValidSolid>>;
export function cutWithEvolution(
  base: Shape3D,
  tool: Shape3D,
  options?: BooleanOptions
): Result<EvolutionResult<Shape3D>>;
export function cutWithEvolution(
  base: Shape3D,
  tool: Shape3D,
  { optimisation = 'none', simplify = false, signal, fuzzyValue }: BooleanOptions = {}
): Result<EvolutionResult<Shape3D>> {
  if (signal?.aborted) throw signal.reason;
  const checkBase = validateShape3D(base, 'cutWithEvolution: base');
  if (isErr(checkBase)) return checkBase;
  const checkTool = validateShape3D(tool, 'cutWithEvolution: tool');
  if (isErr(checkTool)) return checkTool;
  const inputFaceHashes = collectInputFaceHashes([base, tool]);
  const { shape: resultShape, evolution } = getKernel().cutWithHistory(
    base.wrapped,
    tool.wrapped,
    inputFaceHashes,
    HASH_CODE_MAX,
    { optimisation, simplify, fuzzyValue }
  );
  const cutResult = castToShape3D(
    resultShape,
    'CUT_NOT_3D',
    'Cut did not produce a 3D shape',
    'Common causes: tool does not fully intersect the base, or produces a zero-thickness sliver. Ensure the tool extends through the shape.'
  );
  if (cutResult.ok) {
    propagateAllMetadata(evolution, [base, tool], cutResult.value);
    return ok({ shape: cutResult.value, evolution });
  }
  return cutResult;
}

/**
 * Compute the intersection of two shapes (boolean common), returning both
 * the result shape and the face evolution data.
 *
 * @param a - The first operand.
 * @param b - The second operand.
 * @param options - Boolean operation options.
 * @returns Ok with the intersection and evolution, or Err on failure.
 */
export function intersectWithEvolution(
  a: ValidSolid,
  b: ValidSolid,
  options?: BooleanOptions
): Result<EvolutionResult<ValidSolid>>;
export function intersectWithEvolution(
  a: Shape3D,
  b: Shape3D,
  options?: BooleanOptions
): Result<EvolutionResult<Shape3D>>;
export function intersectWithEvolution(
  a: Shape3D,
  b: Shape3D,
  { simplify = false, signal, fuzzyValue }: BooleanOptions = {}
): Result<EvolutionResult<Shape3D>> {
  if (signal?.aborted) throw signal.reason;
  const checkA = validateShape3D(a, 'intersectWithEvolution: first operand');
  if (isErr(checkA)) return checkA;
  const checkB = validateShape3D(b, 'intersectWithEvolution: second operand');
  if (isErr(checkB)) return checkB;
  const inputFaceHashes = collectInputFaceHashes([a, b]);
  const { shape: resultShape, evolution } = getKernel().intersectWithHistory(
    a.wrapped,
    b.wrapped,
    inputFaceHashes,
    HASH_CODE_MAX,
    { simplify, fuzzyValue }
  );
  const intResult = castToShape3D(
    resultShape,
    'INTERSECT_NOT_3D',
    'Intersect did not produce a 3D shape',
    'Shapes may not overlap. Verify they share a common volume before intersecting.'
  );
  if (intResult.ok) {
    propagateAllMetadata(evolution, [a, b], intResult.value);
    return ok({ shape: intResult.value, evolution });
  }
  return intResult;
}

// ---------------------------------------------------------------------------
// Modifier evolution variants
// ---------------------------------------------------------------------------

/**
 * Apply a fillet (rounded edge) to selected edges, returning both
 * the result shape and the face evolution data.
 *
 * @param shape - The shape to modify.
 * @param edges - Edges to fillet. Pass `undefined` to fillet all edges.
 * @param radius - Constant radius, variable radius `[r1, r2]`, or per-edge callback.
 */
// brepjs-patterns-disable: max-function-lines
export function filletWithEvolution(
  shape: ValidSolid,
  edges: ReadonlyArray<Edge> | undefined,
  radius: number | [number, number] | ((edge: Edge) => number | [number, number] | null)
): Result<EvolutionResult<ValidSolid>> {
  const check = validateNotNull(shape, 'filletWithEvolution: shape');
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
    let filteredEdges: Edge[];
    let kernelRadius: number | [number, number] | KernelHashCallback<number | [number, number]>;

    if (typeof radius === 'function') {
      const resolved = resolveEdgeCallback(selectedEdges, radius);
      if (!resolved) {
        return err(
          validationError(
            BrepErrorCode.FILLET_NO_EDGES,
            'No edges with positive radius for fillet',
            undefined,
            undefined,
            'Check that the radius callback returns positive values'
          )
        );
      }
      filteredEdges = resolved.edges;
      kernelRadius = resolved.kernelParam;
    } else {
      filteredEdges = [...selectedEdges];
      kernelRadius = radius;
    }

    const inputFaceHashes = collectInputFaceHashes([shape]);
    const { shape: resultShape, evolution } = getKernel().filletWithHistory(
      shape.wrapped,
      filteredEdges.map((e) => e.wrapped),
      kernelRadius,
      inputFaceHashes,
      HASH_CODE_MAX
    );
    const cast = castResultShape(resultShape);
    if (!isShape3D(cast)) {
      return err(kernelError(BrepErrorCode.FILLET_NOT_3D, 'Fillet result is not a 3D shape'));
    }
    propagateAllMetadata(evolution, [shape], cast);
    return ok({ shape: cast as ValidSolid, evolution });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      kernelError('FILLET_FAILED', `Fillet operation failed: ${raw}`, e, {
        operation: 'fillet',
        edgeCount: selectedEdges.length,
        radius,
      })
    );
  }
}

/**
 * Apply a chamfer (beveled edge) to selected edges, returning both
 * the result shape and the face evolution data.
 *
 * @param shape - The shape to modify.
 * @param edges - Edges to chamfer. Pass `undefined` to chamfer all edges.
 * @param distance - Symmetric distance, asymmetric `[d1, d2]`, or per-edge callback.
 */
// brepjs-patterns-disable: max-function-lines
export function chamferWithEvolution(
  shape: ValidSolid,
  edges: ReadonlyArray<Edge> | undefined,
  distance: number | [number, number] | ((edge: Edge) => number | [number, number] | null)
): Result<EvolutionResult<ValidSolid>> {
  const check = validateNotNull(shape, 'chamferWithEvolution: shape');
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
    let filteredEdges: Edge[];
    let kernelDistance: number | [number, number] | KernelHashCallback<number | [number, number]>;

    if (typeof distance === 'function') {
      const resolved = resolveEdgeCallback(selectedEdges, distance);
      if (!resolved) {
        return err(
          validationError(
            BrepErrorCode.CHAMFER_NO_EDGES,
            'No edges with positive distance for chamfer'
          )
        );
      }
      filteredEdges = resolved.edges;
      kernelDistance = resolved.kernelParam;
    } else {
      filteredEdges = [...selectedEdges];
      kernelDistance = distance;
    }

    const inputFaceHashes = collectInputFaceHashes([shape]);
    const { shape: resultShape, evolution } = getKernel().chamferWithHistory(
      shape.wrapped,
      filteredEdges.map((e) => e.wrapped),
      kernelDistance,
      inputFaceHashes,
      HASH_CODE_MAX
    );
    const cast = castResultShape(resultShape);
    if (!isShape3D(cast)) {
      return err(kernelError(BrepErrorCode.CHAMFER_NOT_3D, 'Chamfer result is not a 3D shape'));
    }
    propagateAllMetadata(evolution, [shape], cast);
    return ok({ shape: cast as ValidSolid, evolution });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      kernelError('CHAMFER_FAILED', `Chamfer operation failed: ${raw}`, e, {
        operation: 'chamfer',
        edgeCount: selectedEdges.length,
        distance,
      })
    );
  }
}

/**
 * Create a hollow shell by removing faces and offsetting remaining walls,
 * returning both the result shape and the face evolution data.
 *
 * @param shape - The solid to hollow out.
 * @param faces - Faces to remove.
 * @param thickness - Wall thickness.
 * @param tolerance - Shell operation tolerance (default 1e-3).
 */
export function shellWithEvolution(
  shape: ValidSolid,
  faces: ReadonlyArray<Face>,
  thickness: number,
  tolerance = 1e-3
): Result<EvolutionResult<Shape3D>> {
  const check = validateNotNull(shape, 'shellWithEvolution: shape');
  if (isErr(check)) return check;
  if (thickness <= 0) {
    return err(validationError('INVALID_THICKNESS', 'Shell thickness must be positive'));
  }
  if (faces.length === 0) {
    return err(validationError('NO_FACES', 'At least one face must be specified for shell'));
  }

  try {
    const inputFaceHashes = collectInputFaceHashes([shape]);
    const { shape: resultShape, evolution } = getKernel().shellWithHistory(
      shape.wrapped,
      faces.map((f) => f.wrapped),
      thickness,
      inputFaceHashes,
      HASH_CODE_MAX,
      tolerance
    );
    const cast = castResultShape(resultShape);
    if (!isShape3D(cast)) {
      return err(kernelError('SHELL_RESULT_NOT_3D', 'Shell result is not a 3D shape'));
    }
    propagateAllMetadata(evolution, [shape], cast);
    return ok({ shape: cast, evolution });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      kernelError('SHELL_FAILED', `Shell operation failed: ${raw}`, e, {
        operation: 'shell',
        faceCount: faces.length,
        thickness,
      })
    );
  }
}
