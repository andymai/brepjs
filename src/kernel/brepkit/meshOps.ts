/**
 * Meshing operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type {
  KernelShape,
  KernelMeshResult,
  KernelEdgeMeshResult,
  MeshOptions,
} from '@/kernel/types.js';
import { type BrepkitHandle, unwrap, toArray, warnOnce, DEFAULT_DEFLECTION } from './helpers.js';

export function mesh(
  bk: BrepkitKernel,
  shape: KernelShape,
  options: MeshOptions
): KernelMeshResult {
  if (options.angularTolerance > 0) {
    warnOnce(
      'mesh-angular',
      'mesh angularTolerance is not supported; only linear deflection is used.'
    );
  }
  const h = unwrap(shape);
  const bkHandle = shape as BrepkitHandle;
  const deflection = options.tolerance || DEFAULT_DEFLECTION;

  let result: KernelMeshResult;
  if (bkHandle.type === 'solid') {
    result = meshSolid(bk, h, deflection, !!options.includeUVs);
  } else if (bkHandle.type === 'face') {
    result = meshSingleFace(bk, h, deflection, 0);
  } else {
    throw new Error(`brepkit: cannot mesh shape of type '${bkHandle.type}'`);
  }

  if (options.skipNormals) {
    result.normals = new Float32Array(0);
  }
  if (!options.includeUVs) {
    result.uvs = new Float32Array(0);
  }
  return result;
}

export function meshEdges(
  bk: BrepkitKernel,
  shape: KernelShape,
  tolerance: number,
  angularTolerance: number
): KernelEdgeMeshResult {
  if (angularTolerance > 0) {
    warnOnce(
      'mesh-edges-angular',
      'meshEdges angularTolerance is not supported; only linear deflection is used.'
    );
  }
  const bkHandle = shape as BrepkitHandle;

  if (bkHandle.type !== 'solid') {
    return { lines: new Float32Array(0), edgeGroups: [] };
  }

  // Use meshEdgesAll (unfiltered) for OCCT parity
  const edgeLines = bk.meshEdgesAll(bkHandle.id, tolerance);
  const positions = edgeLines.positions;
  const offsets = edgeLines.offsets;
  const edgeCount = edgeLines.edgeCount;

  const edgeGroups: Array<{ start: number; count: number; edgeHash: number }> = [];
  for (let i = 0; i < edgeCount; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
    const startIdx = offsets[i]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
    const endIdx = i + 1 < edgeCount ? offsets[i + 1]! : positions.length;
    const pointCount = (endIdx - startIdx) / 3;
    edgeGroups.push({ start: startIdx / 3, count: pointCount, edgeHash: i });
  }

  return {
    lines: new Float32Array(positions),
    edgeGroups,
  };
}

export function hasTriangulation(_bk: BrepkitKernel, _shape: KernelShape): boolean {
  return false; // brepkit tessellates on demand
}

export function meshShape(
  _bk: BrepkitKernel,
  _shape: KernelShape,
  _tolerance: number,
  _angularTolerance: number
): void {
  // No-op: brepkit doesn't cache triangulation
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Tessellate a solid with per-face groups for brepjs mesh format. */
function meshSolid(
  bk: BrepkitKernel,
  solidId: number,
  deflection: number,
  includeUVs: boolean
): KernelMeshResult {
  try {
    return meshSolidGrouped(bk, solidId, deflection, includeUVs);
  } catch (e: unknown) {
    console.warn(
      `brepkit: tessellateSolidGrouped failed (solidId=${solidId}), falling back to per-face:`,
      e
    );
    return meshSolidPerFace(bk, solidId, deflection);
  }
}

/**
 * Batch tessellation via `tessellateSolidGrouped` -- single WASM call for
 * all faces. Falls back to `meshSolidPerFace` on error.
 *
 * When `includeUVs` is true, makes an additional `tessellateSolidUV` call
 * to populate real surface parametrization coordinates.
 */
function meshSolidGrouped(
  bk: BrepkitKernel,
  solidId: number,
  deflection: number,
  includeUVs: boolean
): KernelMeshResult {
  const json = bk.tessellateSolidGrouped(solidId, deflection);
  const data: {
    positions: number[];
    normals: number[];
    indices: number[];
    faceOffsets: number[];
  } = JSON.parse(json);

  const faceIds = toArray(bk.getSolidFaces(solidId));
  const groupCount = data.faceOffsets.length - 1;
  if (groupCount !== faceIds.length) {
    throw new Error(
      `faceOffsets/faceIds length mismatch: ${groupCount} groups vs ${faceIds.length} faces`
    );
  }
  const faceGroups: Array<{ start: number; count: number; faceHash: number }> = [];
  for (let i = 0; i < data.faceOffsets.length - 1; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
    const start = data.faceOffsets[i]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- WASM index
    const count = data.faceOffsets[i + 1]! - start;
    if (count === 0) continue; // degenerate face -- skip
    faceGroups.push({
      start,
      count,
      faceHash: faceIds[i] ?? 0,
    });
  }

  // Fetch real UV coordinates when requested
  let uvs = new Float32Array(0);
  if (includeUVs) {
    const expectedUvLen = (data.positions.length / 3) * 2;
    try {
      const uvJson = bk.tessellateSolidUV(solidId, deflection);
      const uvData: { uvs: number[] } = JSON.parse(uvJson);
      if (uvData.uvs.length === expectedUvLen) {
        uvs = new Float32Array(uvData.uvs);
      } else {
        // Tessellation diverged -- vertex counts don't match
        uvs = new Float32Array(expectedUvLen);
      }
    } catch {
      uvs = new Float32Array(expectedUvLen);
    }
  }

  return {
    vertices: new Float32Array(data.positions),
    normals: new Float32Array(data.normals),
    triangles: new Uint32Array(data.indices),
    uvs,
    faceGroups,
  };
}

/** Per-face tessellation fallback -- N WASM calls, one per face. */
function meshSolidPerFace(
  bk: BrepkitKernel,
  solidId: number,
  deflection: number
): KernelMeshResult {
  const faceIds = toArray(bk.getSolidFaces(solidId));

  const allVertices: number[] = [];
  const allNormals: number[] = [];
  const allTriangles: number[] = [];
  const allUVs: number[] = [];
  const faceGroups: Array<{ start: number; count: number; faceHash: number }> = [];

  let vertexOffset = 0;

  for (const faceId of faceIds) {
    try {
      const faceMesh = bk.tessellateFace(faceId, deflection);
      const positions = faceMesh.positions;
      const normals = faceMesh.normals;
      const indices = faceMesh.indices;
      const vertCount = positions.length / 3;

      if (vertCount === 0) continue;

      const triStart = allTriangles.length;

      for (const v of positions) allVertices.push(v);
      for (const n of normals) allNormals.push(n);

      for (const idx of indices) {
        allTriangles.push(idx + vertexOffset);
      }

      for (let i = 0; i < vertCount; i++) {
        allUVs.push(0, 0);
      }

      faceGroups.push({
        start: triStart,
        count: indices.length,
        faceHash: faceId,
      });

      vertexOffset += vertCount;
    } catch (e: unknown) {
      console.warn(`brepkit: face tessellation failed (faceId=${faceId}):`, e);
    }
  }

  return {
    vertices: new Float32Array(allVertices),
    normals: new Float32Array(allNormals),
    triangles: new Uint32Array(allTriangles),
    uvs: new Float32Array(allUVs),
    faceGroups,
  };
}

/** Tessellate a single face and return brepjs mesh format. */
function meshSingleFace(
  bk: BrepkitKernel,
  faceId: number,
  deflection: number,
  faceHash: number
): KernelMeshResult {
  const faceMesh = bk.tessellateFace(faceId, deflection);
  const positions = faceMesh.positions;
  const normals = faceMesh.normals;
  const indices = faceMesh.indices;
  const vertCount = positions.length / 3;

  const uvs: number[] = [];
  for (let i = 0; i < vertCount; i++) {
    uvs.push(0, 0);
  }

  return {
    vertices: new Float32Array(positions),
    normals: new Float32Array(normals),
    triangles: new Uint32Array(indices),
    uvs: new Float32Array(uvs),
    faceGroups: [{ start: 0, count: indices.length, faceHash }],
  };
}
