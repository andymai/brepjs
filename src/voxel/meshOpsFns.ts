import { type Result, ok, err, isErr } from '@/core/result.js';
import { validationError, computationError } from '@/core/errors.js';
import type { KernelMeshResult } from '@/kernel/types.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { type VoxelMeshInput, validateMesh, resolveEngine } from './signFns.js';
import { shapeToMeshInput } from './shapeMesh.js';

/** Voxel mesh-op tuning. `resolution` sizes the longest bbox axis in voxels;
 *  `padding` is the positive air-margin ring (>= 1) Surface Nets needs. */
export interface VoxelOpOptions {
  resolution?: number;
  padding?: number;
}

const DEFAULT_RESOLUTION = 48;
const DEFAULT_PADDING = 2;

const BOOLEAN_OP_CODES: Record<'union' | 'intersection' | 'difference', number> = {
  union: 0,
  intersection: 1,
  difference: 2,
};

function resolveGridParams(opts?: VoxelOpOptions): Result<{ resolution: number; padding: number }> {
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
  return ok({ resolution, padding });
}

function meshFromResult(result: {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}): Result<KernelMeshResult> {
  if (result.positions.length === 0 || result.indices.length === 0) {
    // An op can legitimately erase all geometry (an over-shrunk offset, a
    // disjoint intersection). Surface that as a discoverable error rather than
    // a silently-empty mesh, mirroring the VOXEL_EMPTY_MESH input guard.
    return err(
      computationError(
        'VOXEL_DEGENERATE_RESULT',
        'the voxel operation produced an empty mesh (over-shrunk offset or disjoint operands?).'
      )
    );
  }
  const vertexCount = result.positions.length / 3;
  return ok({
    vertices: result.positions,
    normals: result.normals,
    triangles: result.indices,
    uvs: new Float32Array(vertexCount * 2),
    faceGroups: [{ start: 0, count: result.indices.length / 3, faceHash: 0 }],
  });
}

/**
 * Offset a mesh by `distance` via a true-SDF iso-level shift: voxelize an
 * FWN-signed SDF, subtract `distance`, then Surface-Nets contour it back.
 *
 * `distance > 0` grows the surface outward, `< 0` shrinks it inward. Returns a
 * {@link KernelMeshResult} in world coordinates (a single face group, no UVs).
 */
export function offsetMesh(
  mesh: VoxelMeshInput,
  distance: number,
  opts?: VoxelOpOptions,
  id?: string
): Result<KernelMeshResult> {
  const invalid = validateMesh(mesh);
  if (invalid) return err(invalid);
  if (mesh.vertices.length === 0 || mesh.triangles.length === 0) {
    return err(
      validationError('VOXEL_EMPTY_MESH', 'offsetMesh requires a non-empty triangle mesh.')
    );
  }
  if (!Number.isFinite(distance)) {
    return err(validationError('VOXEL_INVALID_DISTANCE', 'distance must be a finite number.'));
  }
  const params = resolveGridParams(opts);
  if (isErr(params)) return params;

  const engine = resolveEngine(id);
  if (isErr(engine)) return engine;

  try {
    using offset = engine.value.offset_mesh(
      mesh.vertices,
      mesh.triangles,
      distance,
      params.value.resolution,
      params.value.padding
    );
    return meshFromResult(offset);
  } catch (cause) {
    return err(
      computationError(
        'VOXEL_OFFSET_FAILED',
        cause instanceof Error ? cause.message : 'voxel offset failed (grid too large?).',
        cause
      )
    );
  }
}

/**
 * Hollow a solid mesh into a shell of the given inward `thickness`: voxelize an
 * FWN-signed SDF, take `max(solid, -(solid + thickness))`, then contour it.
 *
 * `thickness` must be finite and > 0 (inward-only). Returns a
 * {@link KernelMeshResult} in world coordinates (a single face group, no UVs).
 */
export function shellMesh(
  mesh: VoxelMeshInput,
  thickness: number,
  opts?: VoxelOpOptions,
  id?: string
): Result<KernelMeshResult> {
  const invalid = validateMesh(mesh);
  if (invalid) return err(invalid);
  if (mesh.vertices.length === 0 || mesh.triangles.length === 0) {
    return err(
      validationError('VOXEL_EMPTY_MESH', 'shellMesh requires a non-empty triangle mesh.')
    );
  }
  if (!Number.isFinite(thickness) || thickness <= 0) {
    return err(
      validationError('VOXEL_INVALID_THICKNESS', 'thickness must be a finite number > 0.')
    );
  }
  const params = resolveGridParams(opts);
  if (isErr(params)) return params;

  const engine = resolveEngine(id);
  if (isErr(engine)) return engine;

  try {
    using shelled = engine.value.shell_mesh(
      mesh.vertices,
      mesh.triangles,
      thickness,
      params.value.resolution,
      params.value.padding
    );
    return meshFromResult(shelled);
  } catch (cause) {
    return err(
      computationError(
        'VOXEL_SHELL_FAILED',
        cause instanceof Error ? cause.message : 'voxel shell failed (grid too large?).',
        cause
      )
    );
  }
}

/**
 * Voxel-based CSG of two meshes: voxelize both onto a shared grid, combine their
 * SDFs (union/intersection/difference), then Surface-Nets contour the result.
 *
 * `op` is `'difference'` = A − B. Robust on non-watertight input (FWN sign).
 * Returns a {@link KernelMeshResult} in world coordinates (single group, no UVs).
 */
export function voxelBoolean(
  a: VoxelMeshInput,
  b: VoxelMeshInput,
  op: 'union' | 'intersection' | 'difference',
  opts?: VoxelOpOptions,
  id?: string
): Result<KernelMeshResult> {
  const invalidA = validateMesh(a);
  if (invalidA) return err(invalidA);
  const invalidB = validateMesh(b);
  if (invalidB) return err(invalidB);
  if (a.vertices.length === 0 || a.triangles.length === 0) {
    return err(
      validationError('VOXEL_EMPTY_MESH', 'voxelBoolean requires a non-empty mesh for operand A.')
    );
  }
  if (b.vertices.length === 0 || b.triangles.length === 0) {
    return err(
      validationError('VOXEL_EMPTY_MESH', 'voxelBoolean requires a non-empty mesh for operand B.')
    );
  }
  const opCode = BOOLEAN_OP_CODES[op];

  const params = resolveGridParams(opts);
  if (isErr(params)) return params;

  const engine = resolveEngine(id);
  if (isErr(engine)) return engine;

  try {
    using result = engine.value.voxel_boolean(
      a.vertices,
      a.triangles,
      b.vertices,
      b.triangles,
      opCode,
      params.value.resolution,
      params.value.padding
    );
    return meshFromResult(result);
  } catch (cause) {
    return err(
      computationError(
        'VOXEL_BOOLEAN_FAILED',
        cause instanceof Error ? cause.message : 'voxel boolean failed (grid too large?).',
        cause
      )
    );
  }
}

/**
 * Offset a B-rep shape by `distance`: tessellate it, then run {@link offsetMesh}
 * on the resulting triangle soup. `distance > 0` grows outward, `< 0` shrinks
 * inward. Threads a meshing failure straight back as an `err(...)`.
 */
export function offsetShape(
  shape: AnyShape<Dimension>,
  distance: number,
  opts?: VoxelOpOptions,
  id?: string
): Result<KernelMeshResult> {
  const meshInput = shapeToMeshInput(shape);
  if (isErr(meshInput)) return meshInput;
  return offsetMesh(meshInput.value, distance, opts, id);
}

/**
 * Hollow a B-rep shape into a shell of inward `thickness`: tessellate it, then
 * run {@link shellMesh}. `thickness` must be finite and > 0. Threads a meshing
 * failure straight back as an `err(...)`.
 */
export function shellShape(
  shape: AnyShape<Dimension>,
  thickness: number,
  opts?: VoxelOpOptions,
  id?: string
): Result<KernelMeshResult> {
  const meshInput = shapeToMeshInput(shape);
  if (isErr(meshInput)) return meshInput;
  return shellMesh(meshInput.value, thickness, opts, id);
}

/**
 * Voxel CSG of two B-rep shapes: tessellate both, then run {@link voxelBoolean}.
 * `op` is `'difference'` = A − B. Threads either meshing failure back as an
 * `err(...)`.
 */
export function voxelBooleanShapes(
  a: AnyShape<Dimension>,
  b: AnyShape<Dimension>,
  op: 'union' | 'intersection' | 'difference',
  opts?: VoxelOpOptions,
  id?: string
): Result<KernelMeshResult> {
  const meshA = shapeToMeshInput(a);
  if (isErr(meshA)) return meshA;
  const meshB = shapeToMeshInput(b);
  if (isErr(meshB)) return meshB;
  return voxelBoolean(meshA.value, meshB.value, op, opts, id);
}
