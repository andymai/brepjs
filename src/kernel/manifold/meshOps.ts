/**
 * Meshing operations for the manifold adapter.
 *
 * Manifold is natively a triangle mesh, so tessellation is a direct read of
 * `getMesh()` — no deflection/angular tolerance applies (the mesh is already
 * the exact representation). Vertex normals are accumulated from face normals
 * since manifold meshes carry positions only. Per-face groups are recovered
 * from the mesh's run table (`runIndex` / `runOriginalID`), mapping each run's
 * original ID into `faceHash`. All reads are pure and record no op-nodes.
 * @module
 */

import type { KernelMeshOps } from '@/kernel/interfaces/meshOps.js';
import type {
  KernelEdgeMeshResult,
  KernelMeshResult,
  KernelShape,
  MeshOptions,
} from '@/kernel/types.js';
import type { ManifoldModule } from './helpers.js';
import type { ManifoldShape } from './meshHandle.js';
import { unwrap } from './meshHandle.js';

interface ManifoldMesh {
  readonly numProp: number;
  readonly vertProperties: Float32Array;
  readonly triVerts: Uint32Array;
  readonly runIndex?: Uint32Array;
  readonly runOriginalID?: Uint32Array;
}

function getMesh(shape: KernelShape): ManifoldMesh {
  return unwrap(shape as ManifoldShape).getMesh() as ManifoldMesh;
}

/** Extract de-indexed xyz positions (stride = numProp, first 3 are position). */
function readPositions(m: ManifoldMesh): Float32Array {
  const stride = m.numProp;
  const vertCount = m.vertProperties.length / stride;
  if (stride === 3) {
    return new Float32Array(m.vertProperties);
  }
  const out = new Float32Array(vertCount * 3);
  for (let i = 0; i < vertCount; i++) {
    out[i * 3] = m.vertProperties[i * stride] ?? 0;
    out[i * 3 + 1] = m.vertProperties[i * stride + 1] ?? 0;
    out[i * 3 + 2] = m.vertProperties[i * stride + 2] ?? 0;
  }
  return out;
}

/** Accumulate area-weighted face normals into per-vertex smooth normals. */
function computeNormals(positions: Float32Array, triangles: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let t = 0; t < triangles.length; t += 3) {
    const a = (triangles[t] ?? 0) * 3;
    const b = (triangles[t + 1] ?? 0) * 3;
    const c = (triangles[t + 2] ?? 0) * 3;
    const ax = positions[a] ?? 0;
    const ay = positions[a + 1] ?? 0;
    const az = positions[a + 2] ?? 0;
    const ux = (positions[b] ?? 0) - ax;
    const uy = (positions[b + 1] ?? 0) - ay;
    const uz = (positions[b + 2] ?? 0) - az;
    const vx = (positions[c] ?? 0) - ax;
    const vy = (positions[c + 1] ?? 0) - ay;
    const vz = (positions[c + 2] ?? 0) - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const base of [a, b, c]) {
      normals[base] = (normals[base] ?? 0) + nx;
      normals[base + 1] = (normals[base + 1] ?? 0) + ny;
      normals[base + 2] = (normals[base + 2] ?? 0) + nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const nx = normals[i] ?? 0;
    const ny = normals[i + 1] ?? 0;
    const nz = normals[i + 2] ?? 0;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 1e-12) {
      normals[i] = nx / len;
      normals[i + 1] = ny / len;
      normals[i + 2] = nz / len;
    }
  }
  return normals;
}

/** Map manifold runs to brepjs face groups; faceHash carries the original ID. */
function readFaceGroups(
  m: ManifoldMesh
): Array<{ start: number; count: number; faceHash: number }> {
  const triCount = m.triVerts.length / 3;
  const { runIndex, runOriginalID } = m;
  if (!runIndex || !runOriginalID || runIndex.length < 2) {
    return [{ start: 0, count: m.triVerts.length, faceHash: 0 }];
  }
  const groups: Array<{ start: number; count: number; faceHash: number }> = [];
  for (let r = 0; r + 1 < runIndex.length; r++) {
    const start = runIndex[r] ?? 0;
    const end = runIndex[r + 1] ?? triCount * 3;
    const count = end - start;
    if (count === 0) continue;
    groups.push({ start, count, faceHash: runOriginalID[r] ?? 0 });
  }
  return groups;
}

export function mesh(shape: KernelShape, options: MeshOptions): KernelMeshResult {
  const m = getMesh(shape);
  const vertices = readPositions(m);
  const triangles = new Uint32Array(m.triVerts);
  const normals = options.skipNormals ? new Float32Array(0) : computeNormals(vertices, triangles);
  const uvs = options.includeUVs
    ? new Float32Array((vertices.length / 3) * 2)
    : new Float32Array(0);
  return {
    vertices,
    normals,
    triangles,
    uvs,
    faceGroups: readFaceGroups(m),
  };
}

export function meshEdges(
  shape: KernelShape,
  _tolerance: number,
  _angularTolerance: number
): KernelEdgeMeshResult {
  const m = getMesh(shape);
  const positions = readPositions(m);
  const tri = m.triVerts;
  const lines: number[] = [];
  const edgeGroups: Array<{ start: number; count: number; edgeHash: number }> = [];
  const seen = new Set<number>();
  const vertCount = positions.length / 3;

  const pushPoint = (idx: number): void => {
    lines.push(positions[idx * 3] ?? 0, positions[idx * 3 + 1] ?? 0, positions[idx * 3 + 2] ?? 0);
  };

  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t] ?? 0;
    const b = tri[t + 1] ?? 0;
    const c = tri[t + 2] ?? 0;
    for (const [i, j] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const lo = Math.min(i, j);
      const hi = Math.max(i, j);
      const key = lo * vertCount + hi;
      if (seen.has(key)) continue;
      seen.add(key);
      const start = lines.length / 3;
      pushPoint(lo);
      pushPoint(hi);
      edgeGroups.push({ start, count: 2, edgeHash: key });
    }
  }

  return { lines: new Float32Array(lines), edgeGroups };
}

export function hasTriangulation(_shape: KernelShape): boolean {
  return true;
}

export function meshShape(
  _shape: KernelShape,
  _tolerance: number,
  _angularTolerance: number
): void {
  // No-op: manifold solids are already triangulated.
}

export function makeMeshOps(_module: ManifoldModule): KernelMeshOps {
  return {
    mesh: (shape, options) => mesh(shape, options),
    meshEdges: (shape, tolerance, angularTolerance) =>
      meshEdges(shape, tolerance, angularTolerance),
    hasTriangulation: (shape) => hasTriangulation(shape),
    meshShape: (shape, tolerance, angularTolerance) => {
      meshShape(shape, tolerance, angularTolerance);
    },
  };
}
