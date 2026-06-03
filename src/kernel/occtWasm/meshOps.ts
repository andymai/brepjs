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

    const uvCount = meshData.uvCount;
    const uvs = new Float32Array(options.includeUVs ? uvCount : 0);
    if (options.includeUVs && uvCount > 0) {
      const uvPtr = meshData.getUvsPtr() >> 2;
      for (let i = 0; i < uvCount; i++) {
        uvs[i] = Module.HEAPF32[uvPtr + i] ?? 0;
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
      uvs,
      faceGroups,
    };
  } finally {
    meshData.delete();
  }
}

/**
 * Append a per-edge polyline (`pointCount` points starting at float index
 * `start` in `heap`) to `out` as a line list — consecutive point pairs, one per
 * segment. Skips degenerate samples the curve sampler repeats on tiny edges.
 */
function pushPolylineSegments(
  heap: Float32Array,
  start: number,
  pointCount: number,
  out: number[]
): void {
  for (let j = 0; j + 1 < pointCount; j++) {
    const a = start + j * 3;
    const x0 = heap[a] ?? 0,
      y0 = heap[a + 1] ?? 0,
      z0 = heap[a + 2] ?? 0;
    const x1 = heap[a + 3] ?? 0,
      y1 = heap[a + 4] ?? 0,
      z1 = heap[a + 5] ?? 0;
    if (x0 === x1 && y0 === y1 && z0 === z1) continue;
    out.push(x0, y0, z0, x1, y1, z1);
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
    const heap = Module.HEAPF32;
    const ptr = edgeData.getPointsPtr() >> 2;

    // wireframe() samples each edge into a polyline (N points along the curve),
    // concatenated per edge with edgeGroups giving each edge's {start, count} as
    // float offsets into the points buffer. KernelEdgeMeshResult.lines is a flat
    // *line list* (consecutive point pairs, one per segment) for THREE.LineSegments
    // — so expand each polyline into pairs. Emitting the raw polyline as a line
    // list draws every other segment and joins the end of one edge to the start of
    // the next: zero-length pairs where edges share a vertex, spurious diagonals
    // across empty space where they don't.
    const lineList: number[] = [];
    const edgeGroups: Array<{ start: number; count: number; edgeHash: number }> = [];
    const egCount = edgeData.edgeGroupCount;
    const egPtr = egCount > 0 ? edgeData.getEdgeGroupsPtr() >> 2 : 0;
    for (let i = 0; i < egCount; i += 3) {
      const start = ptr + (Module.HEAP32[egPtr + i] ?? 0);
      const pointCount = Math.floor((Module.HEAP32[egPtr + i + 1] ?? 0) / 3);
      const segStart = lineList.length / 3;
      pushPolylineSegments(heap, start, pointCount, lineList);
      edgeGroups.push({
        start: segStart,
        count: lineList.length / 3 - segStart,
        edgeHash: Module.HEAP32[egPtr + i + 2] ?? 0,
      });
    }

    return { lines: new Float32Array(lineList), edgeGroups };
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
