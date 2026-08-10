/**
 * Meshing operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel, BrepkitGroupedMesh } from './brepkitWasmTypes.js';
import type {
  KernelShape,
  KernelMeshResult,
  KernelEdgeMeshResult,
  MeshOptions,
} from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import { type BrepkitHandle, unwrap, toArray, DEFAULT_DEFLECTION } from './helpers.js';
import { wasmIndex, vec3At } from '@/utils/vec3.js';

export function mesh(
  bk: BrepkitKernel,
  shape: KernelShape,
  options: MeshOptions
): KernelMeshResult {
  const h = unwrap(shape);
  const bkHandle = shape as BrepkitHandle;
  const deflection = options.tolerance || DEFAULT_DEFLECTION;
  const angularTol = options.angularTolerance > 0 ? options.angularTolerance : undefined;

  let result: KernelMeshResult;
  if (bkHandle.type === 'solid') {
    result = meshSolid(bk, h, deflection, !!options.includeUVs, angularTol);
  } else if (bkHandle.type === 'face') {
    result = meshSingleFace(bk, h, deflection, 0, angularTol);
  } else if (bkHandle.type === 'compound') {
    result = meshCompound(bk, h, deflection, !!options.includeUVs, angularTol);
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

/**
 * Mesh every solid in a compound and concatenate the results.
 *
 * Text solids are compounds — one solid per glyph — so without this the whole
 * text path throws before any geometry runs, which reads as a geometry failure
 * when it is really a missing adapter capability.
 *
 * Triangle indices are vertex-relative, so each part's are rebased by the
 * running vertex count; `faceGroups` index into the triangle list, so their
 * `start` is rebased by the running triangle count. `uvs` are only carried
 * when every part supplied them, since a partial UV array would misalign
 * against the concatenated vertices.
 */
function meshCompound(
  bk: BrepkitKernel,
  compoundId: number,
  deflection: number,
  includeUVs: boolean,
  angularTolerance?: number
): KernelMeshResult {
  const solidIds: number[] = toArray(bk.getCompoundSolids(compoundId));
  const parts = solidIds.map((id) => meshSolid(bk, id, deflection, includeUVs, angularTolerance));

  if (parts.length === 1) return wasmIndex(parts, 0);
  if (parts.length === 0) {
    return {
      vertices: new Float32Array(0),
      normals: new Float32Array(0),
      triangles: new Uint32Array(0),
      uvs: new Float32Array(0),
      faceGroups: [],
    };
  }

  const total = (pick: (p: KernelMeshResult) => { length: number }): number =>
    parts.reduce((n, p) => n + pick(p).length, 0);
  const vertices = new Float32Array(total((p) => p.vertices));
  const normals = new Float32Array(total((p) => p.normals));
  const triangles = new Uint32Array(total((p) => p.triangles));
  const keepUVs = parts.every((p) => p.uvs.length > 0);
  const uvs = new Float32Array(keepUVs ? total((p) => p.uvs) : 0);
  const faceGroups: KernelMeshResult['faceGroups'] = [];

  let vOff = 0;
  let nOff = 0;
  let tOff = 0;
  let uvOff = 0;
  for (const part of parts) {
    vertices.set(part.vertices, vOff);
    normals.set(part.normals, nOff);
    if (keepUVs) {
      uvs.set(part.uvs, uvOff);
      uvOff += part.uvs.length;
    }
    // Indices address vertices, so rebase by vertices already written (3 floats
    // per vertex); faceGroups address triangles, so rebase by triangle count.
    const vertexBase = vOff / 3;
    for (let i = 0; i < part.triangles.length; i++) {
      triangles[tOff + i] = wasmIndex(part.triangles, i) + vertexBase;
    }
    for (const g of part.faceGroups) {
      faceGroups.push({ ...g, start: g.start + tOff });
    }
    vOff += part.vertices.length;
    nOff += part.normals.length;
    tOff += part.triangles.length;
  }

  return { vertices, normals, triangles, uvs, faceGroups };
}

export function meshEdges(
  bk: BrepkitKernel,
  shape: KernelShape,
  tolerance: number,
  angularTolerance: number
): KernelEdgeMeshResult {
  const bkHandle = shape as BrepkitHandle;

  if (bkHandle.type !== 'solid') {
    return { lines: new Float32Array(0), edgeGroups: [] };
  }

  // Forward the angular tolerance like the face/solid tessellation paths do; a
  // non-positive value means "unspecified" → the kernel's default angular cap.
  const angularTol = angularTolerance > 0 ? angularTolerance : undefined;

  // Use meshEdgesAll (unfiltered) for OCCT parity
  const edgeLines = bk.meshEdgesAll(bkHandle.id, tolerance, angularTol);
  const positions = edgeLines.positions;
  const offsets = edgeLines.offsets;
  const edgeCount = edgeLines.edgeCount;

  // brepkit returns one POLYLINE per edge (`offsets` indexes each edge's first
  // point, already ×3). `lines` is a flat line list — consecutive point pairs,
  // one per segment, for THREE.LineSegments — so each polyline has to be
  // expanded into pairs. Emitting the raw polyline as a line list draws every
  // other segment and joins the end of one edge to the start of the next,
  // putting a stray line across empty space wherever those points differ.
  // Same expansion the occtWasm adapter does; manifold emits pairs directly.
  const segments: number[] = [];
  const edgeGroups: Array<{ start: number; count: number; edgeHash: number }> = [];
  for (let i = 0; i < edgeCount; i++) {
    const startIdx = wasmIndex(offsets, i);
    const endIdx = i + 1 < edgeCount ? wasmIndex(offsets, i + 1) : positions.length;
    const pointCount = (endIdx - startIdx) / 3;
    const segStart = segments.length / 3;
    for (let p = 0; p + 1 < pointCount; p++) {
      const a = startIdx + p * 3;
      const [x0, y0, z0] = vec3At(positions, a);
      const [x1, y1, z1] = vec3At(positions, a + 3);
      if (x0 === x1 && y0 === y1 && z0 === z1) continue; // degenerate pair
      segments.push(x0, y0, z0, x1, y1, z1);
    }
    edgeGroups.push({
      start: segStart,
      count: segments.length / 3 - segStart,
      edgeHash: i,
    });
  }

  return {
    lines: new Float32Array(segments),
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
  includeUVs: boolean,
  angularTolerance?: number
): KernelMeshResult {
  try {
    return meshSolidGrouped(bk, solidId, deflection, includeUVs, angularTolerance);
  } catch (e: unknown) {
    console.warn(
      `brepkit: tessellateSolidGrouped failed (solidId=${solidId}), falling back to per-face:`,
      e
    );
    return meshSolidPerFace(bk, solidId, deflection, angularTolerance);
  }
}

/**
 * Batch tessellation via `tessellateSolidGrouped` -- single WASM call for
 * all faces. Falls back to `meshSolidPerFace` on error.
 *
 * Prefers the binary `tessellateSolidGroupedBinary` (packed typed arrays) when
 * the kernel exposes it; the mesh then crosses the WASM boundary as bulk memory
 * copies instead of a multi-megabyte JSON string round-trip (the JSON variant
 * was ~2x slower on large meshes). Falls back to the JSON path on older kernels.
 *
 * When `includeUVs` is true, makes an additional `tessellateSolidUV` call
 * to populate real surface parametrization coordinates.
 */
function meshSolidGrouped(
  bk: BrepkitKernel,
  solidId: number,
  deflection: number,
  includeUVs: boolean,
  angularTolerance?: number
): KernelMeshResult {
  if (typeof bk.tessellateSolidGroupedBinary === 'function') {
    // Call here, inside the `typeof` guard, so the call site is a direct method
    // invocation (TS narrows the optional method; no unbound method reference).
    const m = bk.tessellateSolidGroupedBinary(solidId, deflection, angularTolerance);
    return meshSolidGroupedBinary(bk, solidId, deflection, includeUVs, angularTolerance, m);
  }
  return meshSolidGroupedJson(bk, solidId, deflection, includeUVs, angularTolerance);
}

/**
 * Binary grouped tessellation: positions/normals are packed `Float32Array`s and
 * indices/`faceOffsets` are `Uint32Array`s straight from the kernel — no JSON.
 */
function meshSolidGroupedBinary(
  bk: BrepkitKernel,
  solidId: number,
  deflection: number,
  includeUVs: boolean,
  angularTolerance: number | undefined,
  m: BrepkitGroupedMesh
): KernelMeshResult {
  const positions = m.positions;
  const normals = m.normals;
  const indices = m.indices;
  const faceOffsets = m.faceOffsets;

  const faceIds = toArray(bk.getSolidFaces(solidId));
  const groupCount = faceOffsets.length - 1;
  if (groupCount !== faceIds.length) {
    throw new Error(
      `faceOffsets/faceIds length mismatch: ${groupCount} groups vs ${faceIds.length} faces`
    );
  }
  const faceGroups: Array<{ start: number; count: number; faceHash: number }> = [];
  for (let i = 0; i < faceOffsets.length - 1; i++) {
    const start = wasmIndex(faceOffsets, i);
    const count = wasmIndex(faceOffsets, i + 1) - start;
    if (count === 0) continue; // degenerate face -- skip
    faceGroups.push({ start, count, faceHash: faceIds[i] ?? 0 });
  }

  let uvs = new Float32Array(0);
  if (includeUVs) {
    const expectedUvLen = (positions.length / 3) * 2;
    try {
      const uvJson = bk.tessellateSolidUV(solidId, deflection, angularTolerance);
      const uvData: { uvs: number[] } = JSON.parse(uvJson);
      uvs =
        uvData.uvs.length === expectedUvLen
          ? new Float32Array(uvData.uvs)
          : new Float32Array(expectedUvLen);
    } catch {
      uvs = new Float32Array(expectedUvLen);
    }
  }

  return {
    vertices: positions,
    normals,
    triangles: indices,
    uvs,
    faceGroups,
  };
}

/** JSON grouped tessellation (fallback for kernels without the binary API). */
function meshSolidGroupedJson(
  bk: BrepkitKernel,
  solidId: number,
  deflection: number,
  includeUVs: boolean,
  angularTolerance?: number
): KernelMeshResult {
  const json = bk.tessellateSolidGrouped(solidId, deflection, angularTolerance);
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
    const start = wasmIndex(data.faceOffsets, i);
    const count = wasmIndex(data.faceOffsets, i + 1) - start;
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
      const uvJson = bk.tessellateSolidUV(solidId, deflection, angularTolerance);
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
  deflection: number,
  angularTolerance?: number
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
      const faceMesh = bk.tessellateFace(faceId, deflection, angularTolerance);
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
  faceHash: number,
  angularTolerance?: number
): KernelMeshResult {
  const faceMesh = bk.tessellateFace(faceId, deflection, angularTolerance);
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

/** Co-located factory: returns the mesh slice of {@link KernelAdapter} bound to `bk`. */
export function makeMeshOps(bk: BrepkitKernel) {
  return {
    mesh: (shape, options) => mesh(bk, shape, options),
    meshEdges: (shape, tolerance, angularTolerance) =>
      meshEdges(bk, shape, tolerance, angularTolerance),
    hasTriangulation: (shape) => hasTriangulation(bk, shape),
    meshShape: (shape, tolerance, angularTolerance) => {
      meshShape(bk, shape, tolerance, angularTolerance);
    },
  } satisfies Pick<KernelAdapter, 'mesh' | 'meshEdges' | 'hasTriangulation' | 'meshShape'>;
}
