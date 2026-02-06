/**
 * Functional modifier operations — fillet, chamfer, shell, thicken, offset.
 *
 * These are standalone functions that operate on branded shape types
 * and return Result values.
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape, Edge, Face, Shape3D } from '../core/shapeTypes.js';
import { castShape, isShape3D } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { occtError, validationError } from '../core/errors.js';
import { getEdges } from './shapeFns.js';

/**
 * Thickens a surface (face or shell) into a solid by offsetting it.
 *
 * Takes a planar or non-planar surface shape and creates a solid
 * by offsetting it by the given thickness. Positive thickness offsets
 * along the surface normal; negative thickness offsets against it.
 */
export function thickenSurface(shape: AnyShape, thickness: number): Result<AnyShape> {
  try {
    const kernel = getKernel();
    const resultOc = kernel.thicken(shape.wrapped, thickness);
    return ok(castShape(resultOc));
  } catch (e) {
    return err(
      occtError(
        'THICKEN_FAILED',
        `Thicken operation failed: ${e instanceof Error ? e.message : String(e)}`
      )
    );
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
 * @param radius - Constant radius or per-edge callback.
 */
export function filletShape(
  shape: Shape3D,
  edges: ReadonlyArray<Edge> | undefined,
  radius: number | ((edge: Edge) => number | null)
): Result<Shape3D> {
  if (typeof radius === 'number' && radius <= 0) {
    return err(validationError('INVALID_FILLET_RADIUS', 'Fillet radius must be positive'));
  }

  const selectedEdges = edges ?? getEdges(shape);
  if (selectedEdges.length === 0) {
    return err(validationError('NO_EDGES', 'No edges found for fillet'));
  }

  try {
    const kernel = getKernel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel expects OcShape callback
    const kernelRadius: any =
      typeof radius === 'function'
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel expects OcShape callback
          (ocEdge: any) => {
            const edgeWrapped = castShape(ocEdge) as Edge;
            return radius(edgeWrapped) ?? 0;
          }
        : radius;

    const result = kernel.fillet(
      shape.wrapped,
      selectedEdges.map((e) => e.wrapped),
      kernelRadius
    );

    const cast = castShape(result);
    if (!isShape3D(cast)) {
      return err(occtError('FILLET_RESULT_NOT_3D', 'Fillet result is not a 3D shape'));
    }
    return ok(cast);
  } catch (e) {
    return err(occtError('FILLET_FAILED', 'Fillet operation failed', e));
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
 * @param distance - Chamfer distance or per-edge callback.
 */
export function chamferShape(
  shape: Shape3D,
  edges: ReadonlyArray<Edge> | undefined,
  distance: number | ((edge: Edge) => number | null)
): Result<Shape3D> {
  if (typeof distance === 'number' && distance <= 0) {
    return err(validationError('INVALID_CHAMFER_DISTANCE', 'Chamfer distance must be positive'));
  }

  const selectedEdges = edges ?? getEdges(shape);
  if (selectedEdges.length === 0) {
    return err(validationError('NO_EDGES', 'No edges found for chamfer'));
  }

  try {
    const kernel = getKernel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel expects OcShape callback
    const kernelDistance: any =
      typeof distance === 'function'
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel expects OcShape callback
          (ocEdge: any) => {
            const edgeWrapped = castShape(ocEdge) as Edge;
            return distance(edgeWrapped) ?? 0;
          }
        : distance;

    const result = kernel.chamfer(
      shape.wrapped,
      selectedEdges.map((e) => e.wrapped),
      kernelDistance
    );

    const cast = castShape(result);
    if (!isShape3D(cast)) {
      return err(occtError('CHAMFER_RESULT_NOT_3D', 'Chamfer result is not a 3D shape'));
    }
    return ok(cast);
  } catch (e) {
    return err(occtError('CHAMFER_FAILED', 'Chamfer operation failed', e));
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
export function shellShape(
  shape: Shape3D,
  faces: ReadonlyArray<Face>,
  thickness: number,
  tolerance = 1e-3
): Result<Shape3D> {
  if (thickness <= 0) {
    return err(validationError('INVALID_THICKNESS', 'Shell thickness must be positive'));
  }
  if (faces.length === 0) {
    return err(validationError('NO_FACES', 'At least one face must be specified for shell'));
  }

  try {
    const result = getKernel().shell(
      shape.wrapped,
      faces.map((f) => f.wrapped),
      thickness,
      tolerance
    );

    const cast = castShape(result);
    if (!isShape3D(cast)) {
      return err(occtError('SHELL_RESULT_NOT_3D', 'Shell result is not a 3D shape'));
    }
    return ok(cast);
  } catch (e) {
    return err(occtError('SHELL_FAILED', 'Shell operation failed', e));
  }
}

// ---------------------------------------------------------------------------
// Offset
// ---------------------------------------------------------------------------

/**
 * Offset all faces of a shape by a given distance.
 *
 * @param shape - The shape to offset.
 * @param distance - Offset distance (positive = outward, negative = inward).
 * @param tolerance - Offset tolerance (default 1e-6).
 */
export function offsetShape(shape: AnyShape, distance: number, tolerance = 1e-6): Result<AnyShape> {
  if (distance === 0) {
    return err(validationError('ZERO_OFFSET', 'Offset distance cannot be zero'));
  }

  try {
    const result = getKernel().offset(shape.wrapped, distance, tolerance);
    return ok(castShape(result));
  } catch (e) {
    return err(occtError('OFFSET_FAILED', 'Offset operation failed', e));
  }
}
