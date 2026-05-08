/* v8 ignore file -- occt-wasm kernel not available in brepkit test suite */
/**
 * Mesh tessellation operations for the occt-wasm adapter.
 *
 * @module
 */

import type {
  KernelEdgeMeshResult,
  KernelMeshResult,
  KernelShape,
  MeshOptions,
} from '@/kernel/types.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import { unwrap } from './helpers.js';

export function mesh(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  options: MeshOptions
): KernelMeshResult {
  const meshData = k.tessellate(unwrap(shape), options.tolerance, options.angularTolerance);
  try {
    const posCount = meshData.positionCount;
    const normCount = meshData.normalCount;
    const idxCount = meshData.indexCount;

    const posPtr = meshData.getPositionsPtr() >> 2;
    const normPtr = meshData.getNormalsPtr() >> 2;
    const idxPtr = meshData.getIndicesPtr() >> 2;

    const vertices = new Float32Array(posCount);
    for (let i = 0; i < posCount; i++) {
      vertices[i] = Module.HEAPF32[posPtr + i] ?? 0;
    }

    const normals = new Float32Array(normCount);
    if (!options.skipNormals) {
      for (let i = 0; i < normCount; i++) {
        normals[i] = Module.HEAPF32[normPtr + i] ?? 0;
      }
    }

    const triangles = new Uint32Array(idxCount);
    for (let i = 0; i < idxCount; i++) {
      triangles[i] = Module.HEAPU32[idxPtr + i] ?? 0;
    }

    const faceGroups: Array<{ start: number; count: number; faceHash: number }> = [];
    const fgCount = meshData.faceGroupCount;
    if (fgCount > 0) {
      const fgPtr = meshData.getFaceGroupsPtr() >> 2;
      for (let i = 0; i < fgCount; i += 3) {
        faceGroups.push({
          start: Module.HEAP32[fgPtr + i] ?? 0,
          count: Module.HEAP32[fgPtr + i + 1] ?? 0,
          faceHash: Module.HEAP32[fgPtr + i + 2] ?? 0,
        });
      }
    }

    return {
      vertices,
      normals: options.skipNormals ? new Float32Array(0) : normals,
      triangles,
      uvs: new Float32Array(0),
      faceGroups,
    };
  } finally {
    meshData.delete();
  }
}

export function meshEdges(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  tolerance: number,
  _angularTolerance: number
): KernelEdgeMeshResult {
  const edgeData = k.wireframe(unwrap(shape), tolerance);
  try {
    const pointCount = edgeData.pointCount;
    const ptr = edgeData.getPointsPtr() >> 2;

    const lines = new Float32Array(pointCount);
    for (let i = 0; i < pointCount; i++) {
      lines[i] = Module.HEAPF32[ptr + i] ?? 0;
    }

    const edgeGroups: Array<{ start: number; count: number; edgeHash: number }> = [];
    const egCount = edgeData.edgeGroupCount;
    if (egCount > 0) {
      const egPtr = edgeData.getEdgeGroupsPtr() >> 2;
      for (let i = 0; i < egCount; i += 3) {
        edgeGroups.push({
          start: Module.HEAP32[egPtr + i] ?? 0,
          count: Module.HEAP32[egPtr + i + 1] ?? 0,
          edgeHash: Module.HEAP32[egPtr + i + 2] ?? 0,
        });
      }
    }

    return { lines, edgeGroups };
  } finally {
    edgeData.delete();
  }
}

export function hasTriangulation(k: OcctKernelWasm, shape: KernelShape): boolean {
  return k.hasTriangulation(unwrap(shape));
}

export function meshShape(
  k: OcctKernelWasm,
  shape: KernelShape,
  tolerance: number,
  angularTolerance: number
): void {
  // The work happens in the C++ side; we just need to release the result.
  // No try/finally needed since no JS-side code runs between alloc and delete.
  const meshData = k.meshShape(unwrap(shape), tolerance, angularTolerance);
  meshData.delete();
}
