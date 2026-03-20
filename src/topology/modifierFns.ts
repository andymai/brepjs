/**
 * Functional modifier operations — fillet, chamfer, shell, thicken, offset, draft.
 *
 * These are standalone functions that operate on branded shape types
 * and return Result values.
 */

import { getKernel } from '@/kernel/index.js';
import type { Edge, Face, Shell, Solid, Shape3D } from '@/core/shapeTypes.js';
import { castShape, isShape3D } from '@/core/shapeTypes.js';
import { HASH_CODE_MAX } from '@/core/constants.js';
import { type Result, ok, err, isErr } from '@/core/result.js';
import { kernelError, validationError, BrepErrorCode } from '@/core/errors.js';
import { getEdges } from './shapeFns.js';
import { collectInputFaceHashes, propagateAllMetadata } from './metadata/metadataPropagation.js';
import type { Vec3 } from '@/core/types.js';
import type { DraftAngle } from './apiTypes.js';

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
    const cast = castShape(resultShape) as Solid;
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
    // Pre-filter edges when using a callback: skip null/zero results
    let filteredEdges: Edge[];
    let kernelRadius:
      | number
      | [number, number]
      | ((edge: { HashCode(max: number): number }) => number | [number, number]);

    if (typeof radius === 'function') {
      filteredEdges = [];
      const radMap = new Map<Edge, number | [number, number]>();
      for (const edge of selectedEdges) {
        const rad = radius(edge) ?? 0;
        if (typeof rad === 'number' && rad <= 0) continue;
        if (Array.isArray(rad) && (rad[0] <= 0 || rad[1] <= 0)) continue;
        filteredEdges.push(edge);
        radMap.set(edge, rad);
      }
      // Build a lookup by hash for the kernel callback
      const hashToRad = new Map<number, number | [number, number]>();
      for (const [edge, rad] of radMap) {
        hashToRad.set(getKernel().hashCode(edge.wrapped, HASH_CODE_MAX), rad);
      }
      kernelRadius = (ocEdge) => {
        const r = hashToRad.get(ocEdge.HashCode(HASH_CODE_MAX));
        // Default to 1 (should not happen due to pre-filtering)
        return r ?? 1;
      };
    } else {
      filteredEdges = [...selectedEdges];
      kernelRadius = radius;
    }

    if (filteredEdges.length === 0) {
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

    const inputFaceHashes = collectInputFaceHashes([shape]);
    const { shape: resultShape, evolution } = getKernel().filletWithHistory(
      shape.wrapped,
      filteredEdges.map((e) => e.wrapped),
      kernelRadius,
      inputFaceHashes,
      HASH_CODE_MAX
    );
    const cast = castShape(resultShape);
    if (!isShape3D(cast)) {
      return err(kernelError(BrepErrorCode.FILLET_NOT_3D, 'Fillet result is not a 3D shape'));
    }
    propagateAllMetadata(evolution, [shape], cast);
    return ok(cast);
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
    // Pre-filter edges when using a callback: skip null/zero results
    let filteredEdges: Edge[];
    let kernelDistance:
      | number
      | [number, number]
      | ((edge: { HashCode(max: number): number }) => number | [number, number]);

    if (typeof distance === 'function') {
      filteredEdges = [];
      const distMap = new Map<Edge, number | [number, number]>();
      for (const edge of selectedEdges) {
        const d = distance(edge) ?? 0;
        if (typeof d === 'number' && d <= 0) continue;
        if (Array.isArray(d) && (d[0] <= 0 || d[1] <= 0)) continue;
        filteredEdges.push(edge);
        distMap.set(edge, d);
      }
      const hashToDist = new Map<number, number | [number, number]>();
      for (const [edge, d] of distMap) {
        hashToDist.set(getKernel().hashCode(edge.wrapped, HASH_CODE_MAX), d);
      }
      kernelDistance = (ocEdge) => {
        const d = hashToDist.get(ocEdge.HashCode(HASH_CODE_MAX));
        return d ?? 1;
      };
    } else {
      filteredEdges = [...selectedEdges];
      kernelDistance = distance;
    }

    if (filteredEdges.length === 0) {
      return err(
        validationError(
          BrepErrorCode.CHAMFER_NO_EDGES,
          'No edges with positive distance for chamfer'
        )
      );
    }

    const inputFaceHashes = collectInputFaceHashes([shape]);
    const { shape: resultShape, evolution } = getKernel().chamferWithHistory(
      shape.wrapped,
      filteredEdges.map((e) => e.wrapped),
      kernelDistance,
      inputFaceHashes,
      HASH_CODE_MAX
    );
    const cast = castShape(resultShape);
    if (!isShape3D(cast)) {
      return err(kernelError(BrepErrorCode.CHAMFER_NOT_3D, 'Chamfer result is not a 3D shape'));
    }
    propagateAllMetadata(evolution, [shape], cast);
    return ok(cast);
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
    const inputFaceHashes = collectInputFaceHashes([shape]);
    const { shape: resultShape, evolution } = getKernel().shellWithHistory(
      shape.wrapped,
      faces.map((f) => f.wrapped),
      thickness,
      inputFaceHashes,
      HASH_CODE_MAX,
      tolerance
    );
    const cast = castShape(resultShape);
    if (!isShape3D(cast)) {
      return err(kernelError('SHELL_RESULT_NOT_3D', 'Shell result is not a 3D shape'));
    }
    propagateAllMetadata(evolution, [shape], cast);
    return ok(cast);
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
 */
export function offset(shape: Shape3D, distance: number, tolerance = 1e-6): Result<Shape3D> {
  const check = validateNotNull(shape, 'offset: shape');
  if (isErr(check)) return check;
  if (distance === 0) {
    return err(validationError('ZERO_OFFSET', 'Offset distance cannot be zero'));
  }

  try {
    const inputFaceHashes = collectInputFaceHashes([shape]);
    const { shape: resultShape, evolution } = getKernel().offsetWithHistory(
      shape.wrapped,
      distance,
      inputFaceHashes,
      HASH_CODE_MAX,
      tolerance
    );
    const cast = castShape(resultShape);
    if (!isShape3D(cast)) {
      return err(kernelError('OFFSET_RESULT_NOT_3D', 'Offset result is not a 3D shape'));
    }
    propagateAllMetadata(evolution, [shape], cast);
    return ok(cast);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(kernelError('OFFSET_FAILED', `Offset operation failed: ${raw}`, e));
  }
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

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
  shape: Shape3D,
  faces: ReadonlyArray<Face>,
  pullDirection: Vec3,
  neutralPlane: Vec3,
  angle: DraftAngle
): Result<Shape3D> {
  const check = validateNotNull(shape, 'draft: shape');
  if (isErr(check)) return check;

  if (typeof angle === 'number') {
    if (angle === 0) {
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

  try {
    let filteredFaces: Face[];
    let kernelAngle: number | ((face: { HashCode(max: number): number }) => number);

    if (typeof angle === 'function') {
      filteredFaces = [];
      const hashToAngle = new Map<number, number>();
      for (const face of faces) {
        const a = angle(face);
        if (a === null || a === 0 || Math.abs(a) >= 90) continue;
        filteredFaces.push(face);
        hashToAngle.set(getKernel().hashCode(face.wrapped, HASH_CODE_MAX), a);
      }
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
      kernelAngle = (ocFace) => {
        const a = hashToAngle.get(ocFace.HashCode(HASH_CODE_MAX));
        if (a === undefined) {
          throw new Error('draft: face hash not found — possible hash collision');
        }
        return a;
      };
    } else {
      filteredFaces = [...faces];
      kernelAngle = angle;
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
    const cast = castShape(resultShape);
    if (!isShape3D(cast)) {
      return err(kernelError(BrepErrorCode.DRAFT_NOT_3D, 'Draft result is not a 3D shape'));
    }
    propagateAllMetadata(evolution, [shape], cast);
    return ok(cast);
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
