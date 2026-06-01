import { getVoxel } from './registry.js';

/**
 * Minimal triangle-soup input for sign queries. Structurally satisfied by a
 * {@link KernelMeshResult} (which also carries normals/uvs/faceGroups).
 */
export interface VoxelMeshInput {
  vertices: Float32Array;
  triangles: Uint32Array;
}

function assertMesh(mesh: VoxelMeshInput): void {
  if (mesh.vertices.length % 3 !== 0) {
    throw new Error('voxel: mesh.vertices length must be a multiple of 3 (flat xyz).');
  }
  if (mesh.triangles.length % 3 !== 0) {
    throw new Error('voxel: mesh.triangles length must be a multiple of 3.');
  }
}

function assertQueries(queries: Float32Array): void {
  if (queries.length % 3 !== 0) {
    throw new Error('voxel: queries length must be a multiple of 3 (flat xyz).');
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
): Float32Array {
  assertMesh(mesh);
  assertQueries(queries);
  return getVoxel(id).winding_numbers(mesh.vertices, mesh.triangles, queries);
}

/**
 * Inside/outside classification (winding number > 0.5) at each query point.
 *
 * `queries` is flat xyz (length 3·Q); the result has length Q.
 */
export function pointsInside(mesh: VoxelMeshInput, queries: Float32Array, id?: string): boolean[] {
  assertMesh(mesh);
  assertQueries(queries);
  const flags = getVoxel(id).points_inside(mesh.vertices, mesh.triangles, queries);
  return Array.from(flags, (flag) => flag === 1);
}
