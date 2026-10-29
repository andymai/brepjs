/**
 * Chamfer with distance + angle — functional API.
 *
 * Provides chamferDistAngle(), which chamfers edges using one distance
 * measured along one face and one angle that determines the chamfer on the
 * other, and chamferDistAngles(), which gives each edge its own pair.
 */

import { getKernel } from '@/kernel/index.js';
import { isUnsupportedKernelOperationError } from '@/kernel/unsupported.js';
import { faultyEdgeIndexesOf } from '@/kernel/faultyEdges.js';
import type { KernelShape } from '@/kernel/types.js';
import type { Edge, Shape3D } from '@/core/shapeTypes.js';
import {
  castResultShape,
  disposeDowncastSource,
  disposeResultShape,
  isShape3D,
} from '@/core/shapeTypes.js';
import { downcast } from './cast.js';
import { type Result, type Err, ok, err, isErr } from '@/core/result.js';
import type { BrepError } from '@/core/errors.js';
import {
  BrepErrorCode,
  validationError,
  typeCastError,
  kernelError,
  unsupportedError,
} from '@/core/errors.js';

function validateDistAngle(distance: number, angleDeg: number): Err<BrepError> | undefined {
  if (distance <= 0) {
    return err(
      validationError(
        'CHAMFER_ANGLE_BAD_DISTANCE',
        `distance must be positive, got ${distance}`,
        undefined,
        {
          distance,
        }
      )
    );
  }
  if (angleDeg <= 0 || angleDeg >= 90) {
    return err(
      validationError(
        'CHAMFER_ANGLE_BAD_ANGLE',
        `angleDeg must be in range (0, 90), got ${angleDeg}`,
        undefined,
        { angleDeg }
      )
    );
  }
  return undefined;
}

/**
 * `CHAMFER_ANGLE_FAILED`, with `metadata.failedEdges` set to the edges the
 * kernel named when it could not build them (occt-wasm 5.8+).
 */
function chamferAngleFailed(
  operation: 'chamferDistAngle' | 'chamferDistAngles',
  e: unknown,
  edges: ReadonlyArray<Edge>,
  metadata: Record<string, unknown>
): Err<BrepError> {
  const failedEdges = faultyEdgeIndexesOf(e)?.flatMap((i) => edges[i] ?? []);
  return err(
    kernelError(
      'CHAMFER_ANGLE_FAILED',
      `${operation} kernel call failed: ${e instanceof Error ? e.message : String(e)}`,
      e,
      { ...metadata, ...(failedEdges ? { failedEdges } : {}) },
      failedEdges && failedEdges.length > 0
        ? 'The chamfer could not be built on metadata.failedEdges: use a smaller distance there, or leave those edges out'
        : undefined
    )
  );
}

/** Cast a fresh kernel result to a 3D shape, releasing every intermediate slot. */
function castChamferResult(raw: KernelShape): Result<Shape3D> {
  const downcastResult = downcast(raw);
  if (isErr(downcastResult)) {
    getKernel().dispose(raw);
    return downcastResult;
  }

  const wrapped = castResultShape(downcastResult.value);
  // Two downcasts chain here: `downcast(raw)` orphaned `raw` and castResultShape
  // released its own (intermediate) source, so `raw` still needs releasing.
  disposeDowncastSource(raw, wrapped);
  if (!isShape3D(wrapped)) {
    disposeResultShape(wrapped);
    return err(
      typeCastError('CHAMFER_ANGLE_NOT_3D', 'chamferDistAngle did not produce a 3D shape')
    );
  }
  return ok(wrapped);
}

/**
 * Chamfer edges of a shape using distance + angle.
 *
 * The distance is measured along the face that contains the edge, and the
 * angle (in degrees) determines how the chamfer cuts into the adjacent face.
 *
 * @param shape   - The 3D shape to chamfer.
 * @param edges   - Edges to chamfer (must not be empty).
 * @param distance - Chamfer distance along the face (must be positive).
 * @param angleDeg - Chamfer angle in degrees (must be in range (0, 90)).
 * @returns Ok with the chamfered shape, or Err on invalid input or kernel failure.
 *
 * @remarks Uses `BRepFilletAPI_MakeChamfer.AddDA(dist, angle, edge, face)` internally.
 */
export function chamferDistAngle(
  shape: Shape3D,
  edges: Edge[],
  distance: number,
  angleDeg: number
): Result<Shape3D> {
  if (edges.length === 0) {
    return err(
      validationError(
        'CHAMFER_ANGLE_NO_EDGES',
        'chamferDistAngle requires at least one edge',
        undefined,
        {
          edgeCount: 0,
        }
      )
    );
  }
  const invalid = validateDistAngle(distance, angleDeg);
  if (invalid) return invalid;

  let raw;
  try {
    const kernel = getKernel();
    const rawEdges = edges.map((e) => e.wrapped);
    raw = kernel.chamferDistAngle(shape.wrapped, rawEdges, distance, angleDeg);
  } catch (e) {
    return chamferAngleFailed('chamferDistAngle', e, edges, {
      distance,
      angleDeg,
      edgeCount: edges.length,
    });
  }
  return castChamferResult(raw);
}

/** An edge and the distance-angle chamfer to put on it. */
export interface EdgeDistAngle {
  readonly edge: Edge;
  /** Setback on the edge's reference face; must be positive. */
  readonly distance: number;
  /** Angle from the reference face in degrees, in the range (0, 90). */
  readonly angle: number;
}

function perEdgeUnsupported(kernelId: string, cause: unknown): Err<BrepError> {
  return err(
    unsupportedError(
      BrepErrorCode.UNSUPPORTED_CAPABILITY,
      `chamferDistAngles: the ${kernelId} kernel cannot give each edge its own distance and angle`,
      cause,
      { kernel: kernelId },
      'Give every edge the same { distance, angle }, or use the occt-wasm kernel (5.9.0 or later)'
    )
  );
}

/**
 * Chamfer each edge by its own distance and angle, in one operation.
 *
 * Edges that all share one distance and angle go through
 * {@link chamferDistAngle}, which every kernel provides. Different values need
 * a kernel with a per-edge distance-angle chamfer (occt-wasm 5.9.0 or later);
 * on any other kernel the result is an `UNSUPPORTED_CAPABILITY` error. On
 * occt-wasm the edges of one tangent-continuous contour must share their
 * distance and angle, or the result is `CHAMFER_ANGLE_FAILED`.
 *
 * @param shape   - The 3D shape to chamfer.
 * @param entries - Each edge with its distance and angle (must not be empty).
 * @returns Ok with the chamfered shape, or Err on invalid input, an unsupported
 *   kernel, or kernel failure.
 */
export function chamferDistAngles(
  shape: Shape3D,
  entries: ReadonlyArray<EdgeDistAngle>
): Result<Shape3D> {
  const [first] = entries;
  if (first === undefined) {
    return err(
      validationError(
        'CHAMFER_ANGLE_NO_EDGES',
        'chamferDistAngles requires at least one edge',
        undefined,
        { edgeCount: 0 }
      )
    );
  }
  for (const { distance, angle } of entries) {
    const invalid = validateDistAngle(distance, angle);
    if (invalid) return invalid;
  }

  const edges = entries.map((e) => e.edge);
  if (entries.every((e) => e.distance === first.distance && e.angle === first.angle)) {
    return chamferDistAngle(shape, edges, first.distance, first.angle);
  }

  const kernel = getKernel();
  const perEdge = kernel.chamferDistAngles?.bind(kernel);
  if (!perEdge) return perEdgeUnsupported(kernel.kernelId, undefined);

  let raw: KernelShape;
  try {
    raw = perEdge(
      shape.wrapped,
      entries.map(({ edge, distance, angle }) => ({
        edge: edge.wrapped,
        distance,
        angleDeg: angle,
      }))
    );
  } catch (e) {
    if (isUnsupportedKernelOperationError(e)) return perEdgeUnsupported(kernel.kernelId, e);
    return chamferAngleFailed('chamferDistAngles', e, edges, { edgeCount: entries.length });
  }
  return castChamferResult(raw);
}
