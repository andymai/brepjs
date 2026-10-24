/**
 * Functional modifier operations — fillet, chamfer, shell, thicken, offset, draft.
 *
 * These are standalone functions that operate on branded shape types
 * and return Result values.
 */

import { getKernel, getKernelCapabilities } from '@/kernel/index.js';
import { isUnsupportedKernelOperationError } from '@/kernel/unsupported.js';
import { faultyEdgeIndexesOf } from '@/kernel/faultyEdges.js';
import type { Edge, Face, Shell, Solid, Shape3D, AnyShape, Dimension } from '@/core/shapeTypes.js';
import type { ValidSolid } from '@/core/validityTypes.js';
import {
  castResultShape,
  castResultShapeWithKnownType,
  disposeResultShape,
  isShape3D,
  isSolid,
} from '@/core/shapeTypes.js';
import { HASH_CODE_MAX } from '@/core/constants.js';
import { type Result, type Err, ok, err, isErr } from '@/core/result.js';
import type { BrepError } from '@/core/errors.js';
import { kernelError, unsupportedError, validationError, BrepErrorCode } from '@/core/errors.js';
import { getEdges } from './shapeFns.js';
import { getFaces, subShapeHashes } from './topologyQueryFns.js';
import {
  collectInputFaceHashes,
  propagateAllMetadata,
  propagateMetadataByHash,
} from './metadata/metadataPropagation.js';
import { checkThickResult, type ThickResultSpec } from './thickResultCheck.js';
import type { Vec3 } from '@/core/types.js';
import type { DraftAngle } from './apiTypes.js';
import type { KernelShape, ShapeEvolution } from '@/kernel/types.js';

// ---------------------------------------------------------------------------
// Pre-validation
// ---------------------------------------------------------------------------

function validateNotNull(
  shape: { wrapped: { IsNull(): boolean } },
  label: string
): Result<undefined> {
  if (getKernel().isNull(shape.wrapped)) {
    return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, `${label} is a null shape`));
  }
  return ok(undefined);
}

/**
 * Validate that a scalar or `[a, b]` pair is positive.
 * Returns an Err Result on failure, `undefined` on success.
 *
 * Function-type values (per-edge callbacks) are intentionally skipped here --
 * they are validated lazily in {@link resolveEdgeCallback} when each edge is processed.
 */
function validatePositiveParam(
  value: number | [number, number] | ((...args: never[]) => unknown),
  msgs: {
    code: string;
    scalar: string;
    pair: string;
    scalarHint: string;
    pairHint: string;
  }
): Err<BrepError> | undefined {
  if (typeof value === 'number' && value <= 0) {
    return err(validationError(msgs.code, msgs.scalar, undefined, undefined, msgs.scalarHint));
  }
  if (Array.isArray(value) && (value[0] <= 0 || value[1] <= 0)) {
    return err(validationError(msgs.code, msgs.pair, undefined, undefined, msgs.pairHint));
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Edge callback resolution (shared by fillet / chamfer)
// ---------------------------------------------------------------------------

/** Kernel-compatible callback type: looks up value by raw kernel shape hash. */
type KernelHashCallback<V> = (ocShape: KernelShape) => V;

/**
 * When the user supplies a per-edge callback, pre-filter edges and build a
 * hash-indexed lookup for the kernel. Returns `null` if no edges survive.
 */
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
    if (v === undefined) {
      throw new Error('fillet/chamfer: edge hash not found — possible hash collision');
    }
    return v;
  };
  return { edges: filteredEdges, kernelParam };
}

// ---------------------------------------------------------------------------
// Post-kernel finalization (shared by fillet / chamfer / draft + others)
// ---------------------------------------------------------------------------

/**
 * Cast a kernel result to a Shape3D, propagate metadata, and wrap in `ok()`.
 * Returns an error if the result is not a 3D shape.
 */
function finalizeShape3D(
  evolution: ShapeEvolution,
  resultShape: unknown,
  inputs: ReadonlyArray<AnyShape<Dimension>>,
  not3dCode: string,
  not3dMessage: string
): Result<Shape3D> {
  const cast = castResultShape(resultShape);
  if (!isShape3D(cast)) {
    disposeResultShape(cast);
    return err(kernelError(not3dCode, not3dMessage));
  }
  propagateAllMetadata(evolution, inputs, cast);
  return ok(cast);
}

// ---------------------------------------------------------------------------
// Draft callback resolution
// ---------------------------------------------------------------------------

/**
 * When the user supplies a per-face callback for draft angle, pre-filter
 * faces and build a hash-indexed lookup for the kernel.
 */
function resolveDraftCallback(
  faces: ReadonlyArray<Face>,
  angle: DraftAngle
): {
  filteredFaces: Face[];
  kernelAngle: number | ((face: KernelShape) => number);
} {
  if (typeof angle !== 'function') {
    return { filteredFaces: [...faces], kernelAngle: angle };
  }

  const filteredFaces: Face[] = [];
  const hashToAngle = new Map<number, number>();
  for (const face of faces) {
    const a = angle(face);
    if (a === null || a === 0 || Math.abs(a) >= 90) continue;
    filteredFaces.push(face);
    hashToAngle.set(getKernel().hashCode(face.wrapped, HASH_CODE_MAX), a);
  }

  const kernelAngle = (ocFace: KernelShape) => {
    const a = hashToAngle.get(getKernel().hashCode(ocFace, HASH_CODE_MAX));
    if (a === undefined) {
      throw new Error('draft: face hash not found — possible hash collision');
    }
    return a;
  };
  return { filteredFaces, kernelAngle };
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
    const inputFaceHashes = collectInputFaceHashes([shape]);
    const { shape: resultShape, evolution } = getKernel().thickenWithHistory(
      shape.wrapped,
      thickness,
      inputFaceHashes,
      HASH_CODE_MAX
    );
    const cast = castResultShape(resultShape) as Solid;
    propagateAllMetadata(evolution, [shape], cast);
    return ok(cast);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(kernelError('THICKEN_FAILED', `Thicken operation failed: ${raw}`, e));
  }
}

// ---------------------------------------------------------------------------
// Fillet
// ---------------------------------------------------------------------------

type FilletRadiusArg =
  number | [number, number] | ((edge: Edge) => number | [number, number] | null);

type FilletKernelRadius = number | [number, number] | KernelHashCallback<number | [number, number]>;

/**
 * Validate fillet inputs and resolve the user-supplied radius into a
 * kernel-ready value paired with the filtered edge list.
 */
function normalizeFilletInputs(
  shape: ValidSolid,
  edges: ReadonlyArray<Edge> | undefined,
  radius: FilletRadiusArg
): Result<{ filteredEdges: Edge[]; kernelRadius: FilletKernelRadius; selectedCount: number }> {
  const check = validateNotNull(shape, 'fillet: shape');
  if (isErr(check)) return check;
  const paramErr = validatePositiveParam(radius, {
    code: 'INVALID_FILLET_RADIUS',
    scalar: 'Fillet radius must be positive',
    pair: 'Fillet radii must both be positive',
    scalarHint: 'Provide a positive radius value greater than 0',
    pairHint: 'Both radius values must be greater than 0',
  });
  if (paramErr) return paramErr;

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
    return ok({
      filteredEdges: resolved.edges,
      kernelRadius: resolved.kernelParam,
      selectedCount: selectedEdges.length,
    });
  }

  return ok({
    filteredEdges: [...selectedEdges],
    kernelRadius: radius,
    selectedCount: selectedEdges.length,
  });
}

/**
 * Apply a fillet (rounded edge) to selected edges of a 3D shape.
 *
 * @param shape - The shape to modify.
 * @param edges - Edges to fillet. Pass `undefined` to fillet all edges.
 * @param radius - Constant radius, variable radius `[r1, r2]`, or per-edge callback.
 */
export function fillet(
  shape: ValidSolid,
  edges: ReadonlyArray<Edge> | undefined,
  radius: number | [number, number] | ((edge: Edge) => number | [number, number] | null),
  { trackEvolution = true }: { trackEvolution?: boolean | undefined } = {}
): Result<ValidSolid> {
  const normalized = normalizeFilletInputs(shape, edges, radius);
  if (isErr(normalized)) return normalized;
  const { filteredEdges, kernelRadius, selectedCount } = normalized.value;

  try {
    const edgeShapes = filteredEdges.map((e) => e.wrapped);

    if (!trackEvolution) {
      const resultShape = getKernel().fillet(shape.wrapped, edgeShapes, kernelRadius);
      const cast = castResultShape(resultShape);
      if (!isShape3D(cast)) {
        disposeResultShape(cast);
        return err(kernelError(BrepErrorCode.FILLET_NOT_3D, 'Fillet result is not a 3D shape'));
      }
      return ok(cast as ValidSolid);
    }

    const inputFaceHashes = collectInputFaceHashes([shape]);
    const { shape: resultShape, evolution } = getKernel().filletWithHistory(
      shape.wrapped,
      edgeShapes,
      kernelRadius,
      inputFaceHashes,
      HASH_CODE_MAX
    );
    return finalizeShape3D(
      evolution,
      resultShape,
      [shape],
      BrepErrorCode.FILLET_NOT_3D,
      'Fillet result is not a 3D shape'
    ) as Result<ValidSolid>;
  } catch (e) {
    return err(
      edgeTreatmentError('fillet', e, filteredEdges, { edgeCount: selectedCount, radius })
    );
  }
}

// ---------------------------------------------------------------------------
// Chamfer
// ---------------------------------------------------------------------------

/**
 * `FILLET_FAILED` / `CHAMFER_FAILED`, with `metadata.failedEdges` set to the
 * edges the kernel named when it could not build them (occt-wasm 5.8+).
 */
function edgeTreatmentError(
  operation: 'fillet' | 'chamfer',
  e: unknown,
  edges: ReadonlyArray<Edge>,
  metadata: Record<string, unknown>
): BrepError {
  const raw = e instanceof Error ? e.message : String(e);
  const indexes = faultyEdgeIndexesOf(e);
  const failedEdges = indexes?.flatMap((i) => edges[i] ?? []);
  const label = operation === 'fillet' ? 'Fillet' : 'Chamfer';
  return kernelError(
    operation === 'fillet' ? 'FILLET_FAILED' : 'CHAMFER_FAILED',
    `${label} operation failed: ${raw}`,
    e,
    { operation, ...metadata, ...(failedEdges ? { failedEdges } : {}) },
    failedEdges && failedEdges.length > 0
      ? `The ${operation} could not be built on metadata.failedEdges: use a smaller size there, or leave those edges out`
      : undefined
  );
}

/**
 * Apply a chamfer (beveled edge) to selected edges of a 3D shape.
 *
 * @param shape - The shape to modify.
 * @param edges - Edges to chamfer. Pass `undefined` to chamfer all edges.
 * @param distance - Symmetric distance, asymmetric `[d1, d2]`, or per-edge callback.
 */
export function chamfer(
  shape: ValidSolid,
  edges: ReadonlyArray<Edge> | undefined,
  distance: number | [number, number] | ((edge: Edge) => number | [number, number] | null)
): Result<ValidSolid> {
  const check = validateNotNull(shape, 'chamfer: shape');
  if (isErr(check)) return check;
  const paramErr = validatePositiveParam(distance, {
    code: 'INVALID_CHAMFER_DISTANCE',
    scalar: 'Chamfer distance must be positive',
    pair: 'Chamfer distances must both be positive',
    scalarHint: 'Provide a positive distance value greater than 0',
    pairHint: 'Both distance values must be greater than 0',
  });
  if (paramErr) return paramErr;

  const selectedEdges = edges ?? getEdges(shape);
  if (selectedEdges.length === 0) {
    return err(validationError(BrepErrorCode.CHAMFER_NO_EDGES, 'No edges found for chamfer'));
  }

  let filteredEdges: Edge[] = [];
  try {
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
    return finalizeShape3D(
      evolution,
      resultShape,
      [shape],
      BrepErrorCode.CHAMFER_NOT_3D,
      'Chamfer result is not a 3D shape'
    ) as Result<ValidSolid>;
  } catch (e) {
    return err(
      edgeTreatmentError('chamfer', e, filteredEdges, {
        edgeCount: selectedEdges.length,
        distance,
      })
    );
  }
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

function acceptThickResult(
  input: ValidSolid,
  cast: AnyShape,
  evolution: ShapeEvolution | undefined,
  spec: ThickResultSpec,
  propagateMetadata = true
): Result<ValidSolid> {
  let checked: Result<undefined>;
  try {
    if (isShape3D(cast) || getKernel().isNull(cast.wrapped)) {
      checked = checkThickResult(input, cast as Shape3D, evolution, spec);
    } else {
      checked = err(
        spec.operation === 'shell'
          ? kernelError('SHELL_RESULT_NOT_3D', 'Shell result is not a 3D shape')
          : kernelError('OFFSET_RESULT_NOT_3D', 'Offset result is not a 3D shape')
      );
    }
  } catch (e) {
    disposeResultShape(cast);
    throw e;
  }
  if (isErr(checked)) {
    disposeResultShape(cast);
    return checked;
  }
  if (evolution && propagateMetadata) propagateAllMetadata(evolution, [input], cast);
  return ok(cast as ValidSolid);
}

/**
 * Create a hollow shell by removing faces and offsetting remaining walls.
 *
 * @param shape - The solid to hollow out.
 * @param faces - Faces to remove.
 * @param thickness - Wall thickness.
 * @param tolerance - Shell operation tolerance (default 1e-3).
 * @returns Err `SHELL_NO_EFFECT` when the wall is too thick and the kernel
 *   hands back the input, `SHELL_INVALID_RESULT` when the result is not a
 *   usable hollow body.
 */
export function shell(
  shape: ValidSolid,
  faces: ReadonlyArray<Face>,
  thickness: number,
  tolerance = 1e-3,
  { trackEvolution = true }: { trackEvolution?: boolean | undefined } = {}
): Result<ValidSolid> {
  const check = validateNotNull(shape, 'shell: shape');
  if (isErr(check)) return check;
  if (thickness <= 0) {
    return err(validationError('INVALID_THICKNESS', 'Shell thickness must be positive'));
  }
  if (faces.length === 0) {
    return err(validationError('NO_FACES', 'At least one face must be specified for shell'));
  }

  const kernel = getKernel();
  const spec: ThickResultSpec = {
    operation: 'shell',
    distance: -thickness,
    tolerance,
    openedFaceHashes: new Set(faces.map((f) => kernel.hashCode(f.wrapped, HASH_CODE_MAX))),
  };
  try {
    // With native history the wall check needs the evolution even when the
    // caller opted out of metadata tracking.
    if (!trackEvolution && getKernelCapabilities().nativeHistory !== true) {
      const resultShape = kernel.shell(
        shape.wrapped,
        faces.map((f) => f.wrapped),
        thickness,
        tolerance
      );
      return acceptThickResult(shape, castResultShape(resultShape), undefined, spec);
    }

    const { shape: resultShape, evolution } = kernel.shellWithHistory(
      shape.wrapped,
      faces.map((f) => f.wrapped),
      thickness,
      subShapeHashes(shape, 'face'),
      HASH_CODE_MAX,
      tolerance
    );
    return acceptThickResult(shape, castResultShape(resultShape), evolution, spec, trackEvolution);
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

// ---------------------------------------------------------------------------
// Offset
// ---------------------------------------------------------------------------

/**
 * Offset all faces of a shape by a given distance.
 *
 * @param shape - The shape to offset (must be a 3D shape with faces).
 * @param distance - Offset distance (positive = outward, negative = inward).
 * @param tolerance - Offset tolerance (default 1e-6).
 * @returns Err `OFFSET_INVALID_RESULT` when the offset consumes the body or
 *   gives no usable solid.
 */
export function offset(shape: ValidSolid, distance: number, tolerance = 1e-6): Result<ValidSolid> {
  const check = validateNotNull(shape, 'offset: shape');
  if (isErr(check)) return check;
  if (Math.abs(distance) < 1e-10) {
    return err(validationError('ZERO_OFFSET', 'Offset distance cannot be zero'));
  }

  try {
    const { shape: resultShape, evolution } = getKernel().offsetWithHistory(
      shape.wrapped,
      distance,
      subShapeHashes(shape, 'face'),
      HASH_CODE_MAX,
      tolerance
    );
    return acceptThickResult(shape, castResultShape(resultShape), evolution, {
      operation: 'offset',
      distance,
      tolerance,
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(kernelError('OFFSET_FAILED', `Offset operation failed: ${raw}`, e));
  }
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

/**
 * Validate draft inputs (null shape, scalar angle bounds, faces non-empty).
 * Returns an Err Result on failure, `undefined` on success.
 */
function validateDraftInputs(
  shape: ValidSolid,
  faces: ReadonlyArray<Face>,
  angle: DraftAngle
): Err<BrepError> | undefined {
  const check = validateNotNull(shape, 'draft: shape');
  if (isErr(check)) return check;

  if (typeof angle === 'number') {
    if (Math.abs(angle) < 1e-10) {
      return err(
        validationError(
          BrepErrorCode.DRAFT_INVALID_ANGLE,
          'Draft angle cannot be zero',
          undefined,
          undefined,
          'Provide a non-zero angle in degrees'
        )
      );
    }
    if (Math.abs(angle) >= 90) {
      return err(
        validationError(
          BrepErrorCode.DRAFT_INVALID_ANGLE,
          'Draft angle must be between -90 and 90 degrees (exclusive)',
          undefined,
          undefined,
          'Typical draft angles are 1-5 degrees for injection molding'
        )
      );
    }
  }

  if (faces.length === 0) {
    return err(
      validationError(
        BrepErrorCode.DRAFT_NO_FACES,
        'No faces specified for draft',
        undefined,
        undefined,
        'Select at least one face to apply the draft angle to'
      )
    );
  }

  return undefined;
}

/**
 * Apply a draft (taper) to selected faces of a 3D shape.
 *
 * Draft tilts faces by a specified angle relative to a pull direction,
 * pivoting about a neutral plane. This is essential for injection molding
 * and casting workflows where parts must release from a mold.
 *
 * @param shape - The solid to modify.
 * @param faces - Faces to draft.
 * @param pullDirection - Mold opening direction vector.
 * @param neutralPlane - A point on the plane where faces are not displaced.
 * @param angle - Constant angle in degrees, or per-face callback returning degrees (null to skip).
 */
export function draft(
  shape: ValidSolid,
  faces: ReadonlyArray<Face>,
  pullDirection: Vec3,
  neutralPlane: Vec3,
  angle: DraftAngle
): Result<ValidSolid> {
  const inputErr = validateDraftInputs(shape, faces, angle);
  if (inputErr) return inputErr;

  try {
    const { filteredFaces, kernelAngle } = resolveDraftCallback(faces, angle);
    if (filteredFaces.length === 0) {
      return err(
        validationError(
          BrepErrorCode.DRAFT_NO_FACES,
          'No faces with valid draft angle',
          undefined,
          undefined,
          'Check that the angle callback returns non-zero values between -90 and 90 degrees'
        )
      );
    }

    const inputFaceHashes = collectInputFaceHashes([shape]);
    const { shape: resultShape, evolution } = getKernel().draftWithHistory(
      shape.wrapped,
      filteredFaces.map((f) => f.wrapped),
      [pullDirection[0], pullDirection[1], pullDirection[2]],
      [neutralPlane[0], neutralPlane[1], neutralPlane[2]],
      kernelAngle,
      inputFaceHashes,
      HASH_CODE_MAX
    );
    return finalizeShape3D(
      evolution,
      resultShape,
      [shape],
      BrepErrorCode.DRAFT_NOT_3D,
      'Draft result is not a 3D shape'
    ) as Result<ValidSolid>;
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      kernelError(BrepErrorCode.DRAFT_FAILED, `Draft operation failed: ${raw}`, e, {
        operation: 'draft',
        faceCount: faces.length,
        angle,
      })
    );
  }
}

// ---------------------------------------------------------------------------
// Variable-radius fillet
// ---------------------------------------------------------------------------

/** Specification for a radius point along a variable-radius fillet. */
export interface VariableFilletRadius {
  readonly param: number;
  readonly radius: number;
}

/**
 * Apply a variable-radius fillet to an edge.
 *
 * The radius varies along the edge according to the provided spec points.
 * Each point specifies a normalized parameter (0 = start, 1 = end) and radius.
 *
 * **Cross-kernel note:** brepkit supports arbitrary multi-point radius profiles.
 * occt-wasm supports a linear (start/end, <=2-point) profile and returns
 * UNSUPPORTED for multi-point; the opencascade.js kernel does not implement it.
 */
export function variableFillet(
  shape: ValidSolid,
  edge: Edge,
  radii: ReadonlyArray<VariableFilletRadius>
): Result<ValidSolid> {
  if (radii.length === 0) {
    return err(
      validationError(
        BrepErrorCode.VARIABLE_FILLET_FAILED,
        'radii must contain at least one radius spec'
      )
    );
  }
  for (const r of radii) {
    if (r.radius <= 0) {
      return err(
        validationError(BrepErrorCode.VARIABLE_FILLET_FAILED, 'All radius values must be positive')
      );
    }
  }

  const kernel = getKernel();
  try {
    const spec = JSON.stringify({
      edge: kernel.hashCode(edge.wrapped, HASH_CODE_MAX),
      radii: radii.map((r) => ({ param: r.param, radius: r.radius })),
    });
    const result = kernel.filletVariable(shape.wrapped, spec);
    const wrapped = castResultShape(result);
    if (!isShape3D(wrapped)) {
      disposeResultShape(wrapped);
      return err(
        kernelError(
          BrepErrorCode.VARIABLE_FILLET_FAILED,
          'Variable-radius fillet did not produce a 3D shape'
        )
      );
    }
    if (!isSolid(wrapped)) {
      disposeResultShape(wrapped);
      return err(
        kernelError(
          BrepErrorCode.VARIABLE_FILLET_FAILED,
          'Variable-radius fillet did not produce a solid'
        )
      );
    }
    return ok(wrapped as ValidSolid);
  } catch (e) {
    return err(
      kernelError(BrepErrorCode.VARIABLE_FILLET_FAILED, 'Variable-radius fillet failed', e)
    );
  }
}

// ---------------------------------------------------------------------------
// Remove faces
// ---------------------------------------------------------------------------

interface FaceSignature {
  readonly hash: number;
  readonly type: string;
  readonly area: number;
  readonly center: readonly [number, number, number];
  readonly box: readonly number[];
}

function faceSignature(face: KernelShape): FaceSignature {
  const kernel = getKernel();
  const { min, max } = kernel.boundingBox(face);
  return {
    hash: kernel.hashCode(face, HASH_CODE_MAX),
    type: kernel.surfaceType(face),
    area: kernel.area(face),
    center: kernel.surfaceCenterOfMass(face),
    box: [...min, ...max],
  };
}

const near = (a: readonly number[], b: readonly number[], tol: number): boolean =>
  a.every((v, i) => Math.abs(v - (b[i] ?? Number.NaN)) <= tol);

// Type, area, and centroid alone match a different face of the same kind (an
// r=2 x 10 hole and an r=4 x 5 collar on one axis); the bounding box tells
// them apart, as it does for a face rebuilt in place.
function sameFace(a: FaceSignature, b: FaceSignature): boolean {
  if (a.hash === b.hash) return true;
  if (a.type !== b.type || Math.abs(a.area - b.area) > 1e-6 * Math.max(1, a.area)) return false;
  const tol = 1e-6 * Math.max(1, Math.sqrt(a.area));
  return near(a.center, b.center, tol) && near(a.box, b.box, tol);
}

/**
 * Indexes of the picked faces still in `result`, as themselves or rebuilt in
 * place: where the faces around a pick cannot close its gap, defeaturing
 * hands that face back instead of failing.
 */
function keptFaceIndexes(picked: ReadonlyArray<Face>, result: Solid): number[] {
  const remaining = getFaces(result).map((f) => faceSignature(f.wrapped));
  const kept: number[] = [];
  picked.forEach((face, i) => {
    const signature = faceSignature(face.wrapped);
    if (remaining.some((other) => sameFace(signature, other))) kept.push(i);
  });
  return kept;
}

/**
 * The one solid a result holds, taking ownership of `result`: occt-wasm's
 * defeaturing returns the healed body wrapped in a compound. `undefined` (with
 * everything released) when the result holds no solid or more than one.
 */
function soleSolid(result: AnyShape): Solid | undefined {
  if (isSolid(result)) return result;
  const kernel = getKernel();
  const solids = [...kernel.iterShapes(result.wrapped, 'solid')];
  disposeResultShape(result);
  const [only, ...extra] = solids;
  for (const s of extra) kernel.dispose(s);
  if (only === undefined || extra.length > 0) {
    if (only !== undefined) kernel.dispose(only);
    return undefined;
  }
  return castResultShapeWithKnownType(only, 'solid') as Solid;
}

// A face of another shape matches nothing in the result, so without this
// check it would pass as removed (brepkit's defeature skips unknown ids).
function validateRemoveFacesInputs(
  shape: ValidSolid,
  faces: ReadonlyArray<Face>
): Err<BrepError> | undefined {
  const check = validateNotNull(shape, 'removeFaces: shape');
  if (isErr(check)) return check;
  if (faces.length === 0) {
    return err(
      validationError(
        BrepErrorCode.NO_FACES,
        'removeFaces: at least one face must be specified',
        undefined,
        undefined,
        'Pick the faces of the feature to remove'
      )
    );
  }
  const own = new Set(subShapeHashes(shape, 'face'));
  const foreign = faces.findIndex((f) => !own.has(getKernel().hashCode(f.wrapped, HASH_CODE_MAX)));
  if (foreign === -1) return undefined;
  return err(
    validationError(
      BrepErrorCode.FACE_NOT_IN_SHAPE,
      `removeFaces: face ${foreign} is not a face of the shape`,
      undefined,
      { faceIndex: foreign },
      'Pick the faces with getFaces() on the same shape passed to removeFaces'
    )
  );
}

function removeFacesKernelError(e: unknown, faceCount: number): Err<BrepError> {
  if (isUnsupportedKernelOperationError(e)) {
    const kernelId = getKernel().kernelId;
    return err(
      unsupportedError(
        BrepErrorCode.UNSUPPORTED_CAPABILITY,
        `removeFaces: the ${kernelId} kernel has no defeaturing`,
        e,
        { kernel: kernelId },
        'Use the occt-wasm kernel, which provides defeaturing'
      )
    );
  }
  const raw = e instanceof Error ? e.message : String(e);
  return err(
    kernelError(BrepErrorCode.REMOVE_FACES_FAILED, `removeFaces failed: ${raw}`, e, {
      operation: 'removeFaces',
      faceCount,
    })
  );
}

/**
 * Remove faces from a solid and close the gap with the faces around them
 * (OCCT defeaturing): a hole, pocket, boss, or fillet face disappears and its
 * neighbours extend to meet.
 *
 * @param shape - The solid to edit.
 * @param faces - Faces of `shape` to remove.
 * @returns Err `REMOVE_FACES_INCOMPLETE` (with `metadata.keptFaceIndexes`)
 *   when a picked face is still in the result because its neighbours could not
 *   close the gap, `REMOVE_FACES_FAILED` when the kernel fails or the result is
 *   not one valid solid, and `UNSUPPORTED_CAPABILITY` on a kernel without
 *   defeaturing.
 */
export function removeFaces(shape: ValidSolid, faces: ReadonlyArray<Face>): Result<ValidSolid> {
  const invalid = validateRemoveFacesInputs(shape, faces);
  if (invalid) return invalid;

  const kernel = getKernel();
  let result: Solid | undefined;
  try {
    result = soleSolid(
      castResultShape(
        kernel.defeature(
          shape.wrapped,
          faces.map((f) => f.wrapped)
        )
      )
    );
  } catch (e) {
    return removeFacesKernelError(e, faces.length);
  }

  if (result === undefined || !kernel.isValid(result.wrapped)) {
    if (result) disposeResultShape(result);
    return err(
      kernelError(
        BrepErrorCode.REMOVE_FACES_FAILED,
        'removeFaces: the result is not one valid solid',
        undefined,
        { operation: 'removeFaces', faceCount: faces.length }
      )
    );
  }

  const kept = keptFaceIndexes(faces, result);
  if (kept.length > 0) {
    disposeResultShape(result);
    return err(
      kernelError(
        BrepErrorCode.REMOVE_FACES_INCOMPLETE,
        `removeFaces: ${kept.length} of ${faces.length} face(s) could not be removed; the faces around them cannot close the gap`,
        undefined,
        { operation: 'removeFaces', keptFaceIndexes: kept },
        'Remove the whole feature, or leave out the faces listed in metadata.keptFaceIndexes'
      )
    );
  }
  propagateMetadataByHash([shape], result);
  return ok(result as ValidSolid);
}
