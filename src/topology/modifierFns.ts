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
import { kernelCall } from '../core/kernelCall.js';
import { getEdges } from './shapeFns.js';

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
  return kernelCall(
    () => getKernel().thicken(shape.wrapped, thickness),
    'THICKEN_FAILED',
    'Thicken operation failed'
  ) as Result<Solid>;
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
        'NO_EDGES',
        'No edges found for fillet',
        undefined,
        undefined,
        'Check that the shape has edges, or adjust your edge finder criteria'
      )
    );
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

  return kernelCall(
    () => getKernel().offset(shape.wrapped, distance, tolerance),
    'OFFSET_FAILED',
    'Offset operation failed'
  ) as Result<Shape3D>;
}
