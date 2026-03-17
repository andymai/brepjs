/**
 * Immutable shape transforms — translate, rotate, scale, mirror, applyMatrix.
 * All functions return new shapes without disposing inputs.
 */

import { getKernel } from '../kernel/index.js';
import type { Vec3, MatrixInput } from '../core/types.js';
import type { AnyShape, Dimension } from '../core/shapeTypes.js';
import { castShape } from '../core/shapeTypes.js';
import { HASH_CODE_MAX, DEG2RAD } from '../core/constants.js';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { validationError, BrepErrorCode } from '../core/errors.js';
import {
  collectInputFaceHashes,
  propagateAllMetadata,
  propagateMetadataByHash,
} from './metadata/metadataPropagation.js';

// ---------------------------------------------------------------------------
// Basic transforms
// ---------------------------------------------------------------------------

/** Translate a shape by a vector. Returns a new shape. */
export function translate<T extends AnyShape<Dimension>>(shape: T, v: Vec3): T {
  const inputFaceHashes = collectInputFaceHashes([shape]);
  const { shape: resultShape, evolution } = getKernel().translateWithHistory(
    shape.wrapped,
    v[0],
    v[1],
    v[2],
    inputFaceHashes,
    HASH_CODE_MAX
  );
  const result = castShape(resultShape) as T;
  propagateAllMetadata(evolution, [shape], result);
  return result;
}

/** Rotate a shape around an axis. Angle is in degrees. Returns a new shape. */
export function rotate<T extends AnyShape<Dimension>>(
  shape: T,
  angle: number,
  position: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1]
): T {
  const inputFaceHashes = collectInputFaceHashes([shape]);
  const { shape: resultShape, evolution } = getKernel().rotateWithHistory(
    shape.wrapped,
    angle * DEG2RAD,
    inputFaceHashes,
    HASH_CODE_MAX,
    direction,
    position
  );
  const result = castShape(resultShape) as T;
  propagateAllMetadata(evolution, [shape], result);
  return result;
}

/** Mirror a shape through a plane defined by origin and normal. Returns a new shape. */
export function mirror<T extends AnyShape<Dimension>>(
  shape: T,
  planeNormal: Vec3 = [0, 1, 0],
  planeOrigin: Vec3 = [0, 0, 0]
): T {
  const inputFaceHashes = collectInputFaceHashes([shape]);
  const { shape: resultShape, evolution } = getKernel().mirrorWithHistory(
    shape.wrapped,
    planeOrigin,
    planeNormal,
    inputFaceHashes,
    HASH_CODE_MAX
  );
  const result = castShape(resultShape) as T;
  propagateAllMetadata(evolution, [shape], result);
  return result;
}

/** Scale a shape uniformly. Returns a new shape. */
export function scale<T extends AnyShape<Dimension>>(
  shape: T,
  factor: number,
  center: Vec3 = [0, 0, 0]
): T {
  const inputFaceHashes = collectInputFaceHashes([shape]);
  const { shape: resultShape, evolution } = getKernel().scaleWithHistory(
    shape.wrapped,
    center,
    factor,
    inputFaceHashes,
    HASH_CODE_MAX
  );
  const result = castShape(resultShape) as T;
  propagateAllMetadata(evolution, [shape], result);
  return result;
}

/** Resize a shape to exact target dimensions with optional auto-proportional scaling. */
export function resize<T extends AnyShape<Dimension>>(
  shape: T,
  dimensions: [number | undefined, number | undefined, number | undefined],
  options?: { auto?: boolean }
): Result<T> {
  const bbox = getKernel().boundingBox(shape.wrapped);
  const size: [number, number, number] = [
    bbox.max[0] - bbox.min[0],
    bbox.max[1] - bbox.min[1],
    bbox.max[2] - bbox.min[2],
  ];

  const auto = options?.auto === true;

  function factor(dim: number | undefined, sz: number, baseFactor: number): number {
    if (dim !== undefined && sz > 1e-12) return dim / sz;
    if (dim === undefined && auto) return baseFactor;
    return 1;
  }

  // Find auto-proportional factor from first defined dimension
  let autoFactor = 1;
  if (auto) {
    if (dimensions[0] !== undefined && size[0] > 1e-12) autoFactor = dimensions[0] / size[0];
    else if (dimensions[1] !== undefined && size[1] > 1e-12) autoFactor = dimensions[1] / size[1];
    else if (dimensions[2] !== undefined && size[2] > 1e-12) autoFactor = dimensions[2] / size[2];
  }

  const factors: [number, number, number] = [
    factor(dimensions[0], size[0], autoFactor),
    factor(dimensions[1], size[1], autoFactor),
    factor(dimensions[2], size[2], autoFactor),
  ];

  // Check if all factors are approximately equal (uniform scale)
  // Use relative tolerance since kernel bounding box has floating-point noise
  const isUniform =
    Math.abs(factors[0] - factors[1]) < 1e-6 && Math.abs(factors[1] - factors[2]) < 1e-6;

  if (!isUniform) {
    return err(
      validationError(
        BrepErrorCode.VALIDATION_FAILED,
        'resize: non-uniform scaling is not supported (WASM build lacks BRepBuilderAPI_GTransform).',
        undefined,
        undefined,
        'Use auto: true to scale proportionally, or set all three dimensions to achieve uniform scaling.'
      )
    );
  }

  return ok(scale(shape, factors[0]));
}

// ---------------------------------------------------------------------------
// Matrix transform (OpenSCAD multmatrix equivalent)
// ---------------------------------------------------------------------------

/**
 * Parse a MatrixInput into a 3x3 linear part and translation vector.
 * Validates the bottom row of a Matrix4x4.
 */
function parseMatrixInput(input: MatrixInput): Result<{
  linear: readonly [number, number, number, number, number, number, number, number, number];
  translation: readonly [number, number, number];
}> {
  if ('linear' in input) {
    return ok({ linear: input.linear, translation: input.translation });
  }

  const [r0, r1, r2, r3] = input;
  const TOL = 1e-10;
  if (
    Math.abs(r3[0]) > TOL ||
    Math.abs(r3[1]) > TOL ||
    Math.abs(r3[2]) > TOL ||
    Math.abs(r3[3] - 1) > TOL
  ) {
    return err(
      validationError(
        BrepErrorCode.VALIDATION_FAILED,
        `applyMatrix: invalid bottom row [${String(r3[0])}, ${String(r3[1])}, ${String(r3[2])}, ${String(r3[3])}]. Must be [0, 0, 0, 1] for an affine transform.`
      )
    );
  }

  return ok({
    linear: [r0[0], r0[1], r0[2], r1[0], r1[1], r1[2], r2[0], r2[1], r2[2]],
    translation: [r0[3], r1[3], r2[3]],
  });
}

/** Determinant of a 3x3 matrix given as 9 row-major values. */
function det3x3(
  m: readonly [number, number, number, number, number, number, number, number, number]
): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

/**
 * Check if a 3x3 matrix is orthogonal (possibly with uniform scale).
 * M is orthogonal-with-scale if M^T * M = s^2 * I for some scalar s.
 */
function isOrthogonalMatrix(
  m: readonly [number, number, number, number, number, number, number, number, number]
): boolean {
  const TOL = 1e-8;

  // Compute M^T * M directly: (M^T*M)[i][j] = col_i · col_j
  // Columns of M (row-major): col0 = [m[0],m[3],m[6]], col1 = [m[1],m[4],m[7]], col2 = [m[2],m[5],m[8]]
  const d00 = m[0] * m[0] + m[3] * m[3] + m[6] * m[6];
  const d11 = m[1] * m[1] + m[4] * m[4] + m[7] * m[7];
  const d22 = m[2] * m[2] + m[5] * m[5] + m[8] * m[8];
  const d01 = m[0] * m[1] + m[3] * m[4] + m[6] * m[7];
  const d02 = m[0] * m[2] + m[3] * m[5] + m[6] * m[8];
  const d12 = m[1] * m[2] + m[4] * m[5] + m[7] * m[8];

  // Off-diagonal must be ≈ 0
  if (Math.abs(d01) > TOL) return false;
  if (Math.abs(d02) > TOL) return false;
  if (Math.abs(d12) > TOL) return false;

  // Diagonal elements must be equal (uniform scale)
  if (Math.abs(d00 - d11) > TOL) return false;
  if (Math.abs(d00 - d22) > TOL) return false;

  return true;
}

/**
 * Apply a 4x4 affine transformation matrix to a shape.
 * Equivalent to OpenSCAD's `multmatrix`.
 *
 * Uses the fast `kernel transform` path for orthogonal matrices (rotation, uniform scale, mirror)
 * and the general `gp_GTrsf` path for non-orthogonal transforms (shear, non-uniform scale).
 */
export function applyMatrix<T extends AnyShape<Dimension>>(
  shape: T,
  matrix: MatrixInput
): Result<T> {
  const parsed = parseMatrixInput(matrix);
  if (!parsed.ok) return parsed;
  const { linear, translation } = parsed.value;

  const d = det3x3(linear);
  if (Math.abs(d) < 1e-12) {
    return err(
      validationError(
        BrepErrorCode.VALIDATION_FAILED,
        'applyMatrix: singular matrix (determinant ≈ 0). Cannot apply a non-invertible transform.'
      )
    );
  }

  const orthogonal = isOrthogonalMatrix(linear);

  if (orthogonal) {
    const inputFaceHashes = collectInputFaceHashes([shape]);
    const { shape: resultShape, evolution } = getKernel().generalTransformWithHistory(
      shape.wrapped,
      linear,
      translation,
      true,
      inputFaceHashes,
      HASH_CODE_MAX
    );
    const result = castShape(resultShape) as T;
    propagateAllMetadata(evolution, [shape], result);
    return ok(result);
  }

  // General path: gp_GTrsf for non-orthogonal transforms
  // Requires BRepBuilderAPI_GTransform in the WASM build (see build-config/*.yml)
  /* v8 ignore start -- untestable until WASM is rebuilt with BRepBuilderAPI_GTransform */
  const resultShape = getKernel().generalTransformNonOrthogonal(shape.wrapped, linear, translation);
  const result = castShape(resultShape) as T;
  propagateMetadataByHash([shape], result);
  return ok(result);
  /* v8 ignore stop */
}

// ---------------------------------------------------------------------------
// Composed transform + copy
// ---------------------------------------------------------------------------

/** A single transform operation: translate or rotate. */
export type TransformOp =
  | { readonly type: 'translate'; readonly v: Vec3 }
  | {
      readonly type: 'rotate';
      readonly angle: number;
      readonly axis?: Vec3;
      readonly center?: Vec3;
    };

/** A kernel transform with a cleanup function. Call `cleanup()` when done. */
export interface ComposedTransform {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel WASM type
  readonly trsf: any;
  readonly cleanup: () => void;
}

/**
 * Compose multiple translate/rotate operations into a single kernel transform.
 * Operations are applied in order (first element applied first).
 * Call `.cleanup()` on the result when done to free the kernel object.
 */
export function composeTransforms(ops: readonly TransformOp[]): ComposedTransform {
  const kernelOps = ops.map((op) => {
    if (op.type === 'translate') {
      return { type: 'translate' as const, x: op.v[0], y: op.v[1], z: op.v[2] };
    }
    return {
      type: 'rotate' as const,
      angle: op.angle,
      axis: op.axis,
      center: op.center,
    };
  });
  const { handle, dispose } = getKernel().composeTransform(kernelOps);
  return { trsf: handle, cleanup: dispose };
}

/**
 * Clone a shape and apply a pre-composed transform in a single kernel operation.
 * Much faster than separate clone() + translate() + rotate() calls.
 */
export function transformCopy<T extends AnyShape<Dimension>>(
  shape: T,
  composed: ComposedTransform
): T {
  const inputFaceHashes = collectInputFaceHashes([shape]);
  const { shape: resultShape, evolution } = getKernel().applyComposedTransformWithHistory(
    shape.wrapped,
    composed.trsf,
    inputFaceHashes,
    HASH_CODE_MAX
  );
  const result = castShape(resultShape) as T;
  propagateAllMetadata(evolution, [shape], result);
  return result;
}
