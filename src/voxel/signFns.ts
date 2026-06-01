import { type Result, ok, err, isErr } from '@/core/result.js';
import { type BrepError, validationError, moduleInitError } from '@/core/errors.js';
import type { VoxelEngine } from './engine.js';
import { getVoxel } from './registry.js';

/**
 * Minimal triangle-soup input for sign queries. Structurally satisfied by a
 * {@link KernelMeshResult} (which also carries normals/uvs/faceGroups).
 */
export interface VoxelMeshInput {
  vertices: Float32Array;
  triangles: Uint32Array;
}

/**
 * Validate a triangle-soup mesh before it crosses into wasm: flat-xyz vertices,
 * triangle-multiple indices, and every index in range. An out-of-range index
 * would otherwise panic in Rust and surface as a wasm trap, escaping the Result
 * contract — so it must be rejected here.
 */
export function validateMesh(mesh: VoxelMeshInput): BrepError | null {
  if (mesh.vertices.length % 3 !== 0) {
    return validationError(
      'VOXEL_INVALID_MESH',
      'mesh.vertices length must be a multiple of 3 (flat xyz).'
    );
  }
  if (mesh.triangles.length % 3 !== 0) {
    return validationError('VOXEL_INVALID_MESH', 'mesh.triangles length must be a multiple of 3.');
  }
  const vertexCount = mesh.vertices.length / 3;
  for (let i = 0; i < mesh.triangles.length; i++) {
    const idx = mesh.triangles[i];
    if (idx === undefined || idx >= vertexCount) {
      return validationError(
        'VOXEL_INVALID_TRIANGLE_INDEX',
        `triangle index ${idx} at position ${i} is out of range for ${vertexCount} vertices.`
      );
    }
  }
  return null;
}

function validateInputs(mesh: VoxelMeshInput, queries: Float32Array): BrepError | null {
  const meshInvalid = validateMesh(mesh);
  if (meshInvalid) return meshInvalid;
  if (queries.length % 3 !== 0) {
    return validationError(
      'VOXEL_INVALID_QUERIES',
      'queries length must be a multiple of 3 (flat xyz).'
    );
  }
  return null;
}

/** Resolve a registered voxel engine, mapping an unregistered id to an error. */
export function resolveEngine(id: string | undefined): Result<VoxelEngine> {
  try {
    return ok(getVoxel(id));
  } catch (cause) {
    return err(
      moduleInitError(
        'VOXEL_NOT_INITIALIZED',
        cause instanceof Error ? cause.message : 'voxel engine not initialized',
        cause
      )
    );
  }
}

/**
 * Generalized winding number at each query point against a triangle-soup mesh.
 *
 * `queries` is flat xyz (length 3·Q); the result has length Q. ~1 inside, ~0
 * outside for a closed mesh; degrades gracefully on holes (the keystone that
 * makes non-watertight repair possible — ADR-0013 §11).
 */
export function windingNumbers(
  mesh: VoxelMeshInput,
  queries: Float32Array,
  id?: string
): Result<Float32Array> {
  const invalid = validateInputs(mesh, queries);
  if (invalid) return err(invalid);
  const engine = resolveEngine(id);
  if (isErr(engine)) return engine;
  return ok(engine.value.winding_numbers(mesh.vertices, mesh.triangles, queries));
}

/**
 * Inside/outside classification (winding number > 0.5) at each query point.
 *
 * `queries` is flat xyz (length 3·Q); the result has length Q.
 */
export function pointsInside(
  mesh: VoxelMeshInput,
  queries: Float32Array,
  id?: string
): Result<boolean[]> {
  const invalid = validateInputs(mesh, queries);
  if (invalid) return err(invalid);
  const engine = resolveEngine(id);
  if (isErr(engine)) return engine;
  const flags = engine.value.points_inside(mesh.vertices, mesh.triangles, queries);
  return ok(Array.from(flags, (flag) => flag === 1));
}
