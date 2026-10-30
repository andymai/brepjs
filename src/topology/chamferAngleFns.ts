/**
 * Chamfer with distance + angle — functional API.
 *
 * Provides chamferDistAngle(), which chamfers edges using one distance
 * measured along one face and one angle that determines the chamfer on the
 * other, and chamferDistAngles(), which gives each edge its own pair.
 *
 * Face origins, tags and colors carry over to the faces a chamfer keeps where
 * the kernel reports face history for it (occt-wasm 5.11.0 or later);
 * elsewhere only face origins do.
 */

import { getKernel } from '@/kernel/index.js';
import { isUnsupportedKernelOperationError } from '@/kernel/unsupported.js';
import { faultyEdgeIndexesOf } from '@/kernel/faultyEdges.js';
import type { KernelShape, ShapeEvolution } from '@/kernel/types.js';
import type { ChamferDistAngleEdge } from '@/kernel/interfaces/modifierOps.js';
import type { Edge, Face, Shape3D } from '@/core/shapeTypes.js';
import {
  castResultShape,
  disposeDowncastSource,
  disposeResultShape,
  isShape3D,
} from '@/core/shapeTypes.js';
import { HASH_CODE_MAX } from '@/core/constants.js';
import { downcast } from './cast.js';
import { facesOfEdge } from './adjacencyFns.js';
import { isSameShape } from './shapeFns.js';
import {
  collectInputFaceHashes,
  propagateAllMetadata,
  propagateMetadataByHash,
} from './metadata/metadataPropagation.js';
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

/** A kernel's distance-angle chamfer, with the face history it reported, if any. */
interface BuiltChamfer {
  readonly raw: KernelShape;
  readonly evolution: ShapeEvolution | undefined;
}

/**
 * Chamfer `entries` with the kernel's distance-angle chamfer that reports face
 * history. A kernel without one, or a build that rejects it as unsupported
 * (occt-wasm before 5.11), runs `withoutHistory` instead.
 */
function buildChamfer(
  shape: Shape3D,
  entries: ReadonlyArray<ChamferDistAngleEdge>,
  withoutHistory: () => KernelShape
): BuiltChamfer {
  const kernel = getKernel();
  if (kernel.chamferDistAnglesWithHistory) {
    try {
      const { shape: raw, evolution } = kernel.chamferDistAnglesWithHistory(
        shape.wrapped,
        entries,
        collectInputFaceHashes([shape]),
        HASH_CODE_MAX
      );
      return { raw, evolution };
    } catch (e) {
      if (!isUnsupportedKernelOperationError(e)) throw e;
    }
  }
  return { raw: withoutHistory(), evolution: undefined };
}

/**
 * Cast a fresh kernel result to a 3D shape, releasing every intermediate slot,
 * and carry the face metadata of `input` over to it.
 */
function castChamferResult(input: Shape3D, { raw, evolution }: BuiltChamfer): Result<Shape3D> {
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
  if (evolution) {
    propagateAllMetadata(evolution, [input], wrapped);
  } else {
    // Without face history only face origins carry over (tags and colors are
    // lost), matched by hash and geometry.
    propagateMetadataByHash([input], wrapped);
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
 * @returns Ok with the chamfered shape, or Err on invalid input or kernel
 *   failure. A kernel without a distance-angle chamfer returns
 *   `UNSUPPORTED_CAPABILITY`.
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

  const kernel = getKernel();
  let built: BuiltChamfer;
  try {
    const rawEdges = edges.map((e) => e.wrapped);
    built = buildChamfer(
      shape,
      rawEdges.map((edge) => ({ edge, distance, angleDeg })),
      () => kernel.chamferDistAngle(shape.wrapped, rawEdges, distance, angleDeg)
    );
  } catch (e) {
    if (isUnsupportedKernelOperationError(e)) {
      return err(
        unsupportedError(
          BrepErrorCode.UNSUPPORTED_CAPABILITY,
          `chamferDistAngle: the ${kernel.kernelId} kernel has no distance-angle chamfer`,
          e,
          { kernel: kernel.kernelId },
          'Chamfer by one symmetric distance instead, or use the occt-wasm kernel'
        )
      );
    }
    return chamferAngleFailed('chamferDistAngle', e, edges, {
      distance,
      angleDeg,
      edgeCount: edges.length,
    });
  }
  return castChamferResult(shape, built);
}

/** An edge and the distance-angle chamfer to put on it. */
export interface EdgeDistAngle {
  readonly edge: Edge;
  /** Setback on the edge's reference face; must be positive. */
  readonly distance: number;
  /** Angle from the reference face in degrees, in the range (0, 90). */
  readonly angle: number;
  /**
   * The reference face, one of the two faces `edge` joins. Omitted, the kernel
   * picks it (the edge's first adjacent face on occt-wasm).
   */
  readonly face?: Face | undefined;
}

function perEdgeUnsupported(kernelId: string, cause: unknown, facesGiven: boolean): Err<BrepError> {
  return err(
    unsupportedError(
      BrepErrorCode.UNSUPPORTED_CAPABILITY,
      facesGiven
        ? `chamferDistAngles: the ${kernelId} kernel cannot measure a distance-angle chamfer from a given face`
        : `chamferDistAngles: the ${kernelId} kernel cannot give each edge its own distance and angle`,
      cause,
      { kernel: kernelId },
      facesGiven
        ? 'Use the occt-wasm kernel (5.9.0 or later), or leave out face so the kernel picks it'
        : 'Use the occt-wasm kernel (5.9.0 or later), or give every edge the same { distance, angle } on a kernel that has a distance-angle chamfer'
    )
  );
}

/** The first entry whose `face` is not one of the faces of `shape` its edge joins. */
function entryWithStrayFace(
  shape: Shape3D,
  entries: ReadonlyArray<EdgeDistAngle>
): EdgeDistAngle | undefined {
  return entries.find(
    ({ edge, face }) =>
      face !== undefined && !facesOfEdge(shape, edge).some((f) => isSameShape(f, face))
  );
}

/**
 * Chamfer each edge by its own distance and angle, in one operation.
 *
 * Edges that all share one distance and angle, with no reference face given,
 * go through {@link chamferDistAngle}, which every kernel provides.
 * Different values, or any `face`, need a kernel with a per-edge distance-angle
 * chamfer (occt-wasm 5.9.0 or later); on any other kernel the result is an
 * `UNSUPPORTED_CAPABILITY` error. On occt-wasm the edges of one
 * tangent-continuous contour must state the same chamfer, or the result is
 * `CHAMFER_ANGLE_FAILED`; from 5.11.0 an edge may state it from the face on
 * the other side of the contour.
 *
 * @param shape   - The 3D shape to chamfer.
 * @param entries - Each edge with its distance, angle and optional reference
 *   face (must not be empty).
 * @returns Ok with the chamfered shape, or Err on invalid input (a `face` not
 *   adjacent to its edge is `CHAMFER_ANGLE_FACE_NOT_ADJACENT`), an unsupported
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
  const stray = entryWithStrayFace(shape, entries);
  if (stray) {
    return err(
      validationError(
        'CHAMFER_ANGLE_FACE_NOT_ADJACENT',
        'chamferDistAngles: a reference face is not one of the two faces its edge joins',
        undefined,
        { edge: stray.edge, face: stray.face },
        'Pick the face from facesOfEdge(shape, edge) on the shape being chamfered, or leave out face'
      )
    );
  }

  const edges = entries.map((e) => e.edge);
  const facesGiven = entries.some((e) => e.face !== undefined);
  const shared = entries.every((e) => e.distance === first.distance && e.angle === first.angle);
  if (shared && !facesGiven) {
    return chamferDistAngle(shape, edges, first.distance, first.angle);
  }

  const kernel = getKernel();
  const perEdge = kernel.chamferDistAngles?.bind(kernel);
  if (!perEdge) return perEdgeUnsupported(kernel.kernelId, undefined, facesGiven);

  const kernelEntries = entries.map(({ edge, distance, angle, face }) => ({
    edge: edge.wrapped,
    distance,
    angleDeg: angle,
    face: face?.wrapped,
  }));
  let built: BuiltChamfer;
  try {
    built = buildChamfer(shape, kernelEntries, () => perEdge(shape.wrapped, kernelEntries));
  } catch (e) {
    if (isUnsupportedKernelOperationError(e)) {
      return perEdgeUnsupported(kernel.kernelId, e, facesGiven);
    }
    return chamferAngleFailed('chamferDistAngles', e, edges, { edgeCount: entries.length });
  }
  return castChamferResult(shape, built);
}
