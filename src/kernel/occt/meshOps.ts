/**
 * Meshing operations for OCCT shapes.
 *
 * Uses C++ bulk extraction (MeshExtractor/EdgeMeshExtractor) for all
 * mesh operations. These are compiled into the brepjs-opencascade WASM
 * build and handle vertex, normal, UV, and triangle extraction in a
 * single WASM call per shape.
 *
 * ADR-0006 Phase 2: no TS code iterates triangulation data to compute
 * normals — all normal computation happens in C++.
 *
 * Used by DefaultAdapter.
 */

import type {
  KernelInstance,
  KernelShape,
  MeshOptions,
  KernelMeshResult,
  KernelEdgeMeshResult,
} from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import { perfTimer } from '../perfStats.js';

/** Slice a Float32Array from the WASM heap, or return empty if size is 0. */
function sliceF32(heap: Float32Array, ptr: number, size: number): Float32Array {
  if (size === 0) return new Float32Array(0);
  const offset = ptr / 4;
  return heap.slice(offset, offset + size);
}

/**
 * Meshes a shape using C++ bulk extraction.
 *
 * Single WASM call handles meshing, vertex/normal/UV extraction, face
 * grouping, and triangle winding correction.
 */
export function mesh(
  oc: KernelInstance,
  shape: KernelShape,
  options: MeshOptions
): KernelMeshResult {
  const end = perfTimer('mesh');
  try {
    const raw = oc.MeshExtractor.extract(
      shape,
      options.tolerance,
      options.angularTolerance,
      !!options.skipNormals,
      !!options.includeUVs
    );

    const verticesSize = raw.getVerticesSize() as number;
    const normalsSize = raw.getNormalsSize() as number;
    const trianglesSize = raw.getTrianglesSize() as number;
    const faceGroupsSize = raw.getFaceGroupsSize() as number;
    const uvsSize = raw.getUvsSize() as number;

    // Copy from WASM heap into owned TypedArrays.
    // Must .slice() before any other WASM call could grow/relocate the heap.
    const vertices = sliceF32(oc.HEAPF32, raw.getVerticesPtr() as number, verticesSize);
    const normals =
      options.skipNormals || normalsSize === 0
        ? new Float32Array(0)
        : sliceF32(oc.HEAPF32, raw.getNormalsPtr() as number, normalsSize);

    const trianglesPtr = (raw.getTrianglesPtr() as number) / 4;
    const triangles = oc.HEAPU32.slice(trianglesPtr, trianglesPtr + trianglesSize) as Uint32Array;

    const uvs =
      uvsSize > 0 ? sliceF32(oc.HEAPF32, raw.getUvsPtr() as number, uvsSize) : new Float32Array(0);

    // Parse face groups from packed [start, count, faceHash, ...] triples
    const faceGroups: KernelMeshResult['faceGroups'] = [];
    if (faceGroupsSize > 0) {
      const fgPtr = (raw.getFaceGroupsPtr() as number) / 4;
      const fgRaw = oc.HEAP32.slice(fgPtr, fgPtr + faceGroupsSize) as Int32Array;
      for (let i = 0; i < fgRaw.length; i += 3) {
        faceGroups.push({
          start: fgRaw[i] as number,
          count: fgRaw[i + 1] as number,
          faceHash: fgRaw[i + 2] as number,
        });
      }
    }

    // Free C++ allocated memory (destructor frees internal buffers)
    raw.delete();

    return { vertices, normals, triangles, uvs, faceGroups };
  } finally {
    end();
  }
}

/**
 * Extracts edge meshes using C++ bulk extraction.
 */
export function meshEdges(
  oc: KernelInstance,
  shape: KernelShape,
  tolerance: number,
  angularTolerance: number
): KernelEdgeMeshResult {
  const end = perfTimer('edgeMesh');
  try {
    const raw = oc.EdgeMeshExtractor.extract(shape, tolerance, angularTolerance);

    const linesSize = raw.getLinesSize() as number;
    const edgeGroupsSize = raw.getEdgeGroupsSize() as number;

    const lines = sliceF32(oc.HEAPF32, raw.getLinesPtr() as number, linesSize);

    const edgeGroups: KernelEdgeMeshResult['edgeGroups'] = [];
    if (edgeGroupsSize > 0) {
      const egPtr = (raw.getEdgeGroupsPtr() as number) / 4;
      const egRaw = oc.HEAP32.slice(egPtr, egPtr + edgeGroupsSize) as Int32Array;
      for (let i = 0; i < egRaw.length; i += 3) {
        edgeGroups.push({
          start: egRaw[i] as number,
          count: egRaw[i + 1] as number,
          edgeHash: egRaw[i + 2] as number,
        });
      }
    }

    raw.delete();
    return { lines, edgeGroups };
  } finally {
    end();
  }
}

/** Co-located factory: returns the mesh slice of {@link KernelAdapter} bound to `oc`. */
export function makeMeshOps(oc: KernelInstance) {
  return {
    mesh: (shape, options) => mesh(oc, shape, options),
    meshEdges: (shape, tolerance, angularTolerance) =>
      meshEdges(oc, shape, tolerance, angularTolerance),
  } satisfies Pick<KernelAdapter, 'mesh' | 'meshEdges'>;
}
