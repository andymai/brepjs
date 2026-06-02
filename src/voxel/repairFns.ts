import { type Result, ok, err, isErr } from '@/core/result.js';
import { validationError, computationError } from '@/core/errors.js';
import type { KernelMeshResult } from '@/kernel/types.js';
import { type VoxelMeshInput, validateMesh, resolveEngine } from './signFns.js';

/** Voxel-repair tuning. `resolution` sizes the longest bbox axis in voxels;
 *  `padding` is the positive air-margin ring (>= 1) Surface Nets needs. */
export interface RepairOptions {
  resolution?: number;
  padding?: number;
}

const DEFAULT_RESOLUTION = 48;
const DEFAULT_PADDING = 2;

/**
 * Repair a (possibly non-watertight) triangle-soup mesh into a closed surface:
 * voxelize an FWN-signed SDF, then Surface-Nets contour it back to triangles.
 *
 * The FWN sign classifies inside/outside even on holey input, so a mesh with
 * missing faces still yields a watertight result (ADR-0013 §11). Returns a
 * {@link KernelMeshResult} in world coordinates (a single face group, no UVs).
 */
export function repairMesh(
  mesh: VoxelMeshInput,
  opts?: RepairOptions,
  id?: string
): Result<KernelMeshResult> {
  const invalid = validateMesh(mesh);
  if (invalid) return err(invalid);
  if (mesh.vertices.length === 0 || mesh.triangles.length === 0) {
    // An empty mesh has an undefined bbox; repairing it would feed INF arithmetic
    // into the grid sizing. Reject it cleanly rather than return a garbage mesh.
    return err(
      validationError('VOXEL_EMPTY_MESH', 'repairMesh requires a non-empty triangle mesh.')
    );
  }

  const resolution = opts?.resolution ?? DEFAULT_RESOLUTION;
  const padding = opts?.padding ?? DEFAULT_PADDING;
  if (!Number.isInteger(resolution) || resolution < 1) {
    return err(validationError('VOXEL_INVALID_RESOLUTION', 'resolution must be an integer >= 1.'));
  }
  if (!Number.isInteger(padding) || padding < 1) {
    // Surface Nets needs >= 1 voxel of air margin on every face, else the
    // extracted surface is clipped at the grid boundary.
    return err(validationError('VOXEL_INVALID_PADDING', 'padding must be an integer >= 1.'));
  }

  const engine = resolveEngine(id);
  if (isErr(engine)) return engine;

  try {
    // repair_mesh returns Result<_, JsError> in Rust: a grid over MAX_VOXELS
    // surfaces as a thrown JS exception, which must be caught to honour the
    // Result contract (the cap is reachable purely from `resolution`).
    // `using` frees the WASM-owned RepairResult on scope exit (the getters copy
    // their buffers out, so the returned mesh stays valid after free()).
    using repaired = engine.value.repair_mesh(mesh.vertices, mesh.triangles, resolution, padding);
    const vertexCount = repaired.positions.length / 3;
    return ok({
      vertices: repaired.positions,
      normals: repaired.normals,
      triangles: repaired.indices,
      uvs: new Float32Array(vertexCount * 2),
      faceGroups: [{ start: 0, count: repaired.indices.length / 3, faceHash: 0 }],
    });
  } catch (cause) {
    return err(
      computationError(
        'VOXEL_REPAIR_FAILED',
        cause instanceof Error ? cause.message : 'voxel repair failed (grid too large?).',
        cause
      )
    );
  }
}
