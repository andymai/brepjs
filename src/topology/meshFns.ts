/**
 * Meshing and export functions — functional replacements for Shape mesh/export methods.
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { ioError } from '../core/errors.js';

import {
  buildMeshCacheKey,
  getMeshForShape,
  setMeshForShape,
  buildEdgeMeshCacheKey,
  getEdgeMeshForShape,
  setEdgeMeshForShape,
} from './meshCache.js';
import { getFaceOrigins } from './shapeFns.js';

// ---------------------------------------------------------------------------
// Mesh types
// ---------------------------------------------------------------------------

/** Triangle mesh data extracted from a shape, ready for GPU rendering. */
export interface ShapeMesh {
  /** Triangle vertex indices (3 per triangle). */
  triangles: Uint32Array;
  /** Flat array of vertex positions (x,y,z interleaved). */
  vertices: Float32Array;
  /** Flat array of vertex normals (x,y,z interleaved). */
  normals: Float32Array;
  /** Flat array of UV coordinates (u,v interleaved), empty if not requested. */
  uvs: Float32Array;
  /** Per-face triangle index ranges for multi-material rendering. */
  faceGroups: { start: number; count: number; faceId: number; origin: number }[];
}

/** Line segment mesh data for edge rendering (wireframe). */
export interface EdgeMesh {
  /** Flat array of line vertex positions (x,y,z interleaved, 2 vertices per segment). */
  lines: Float32Array;
  /** Per-edge line segment index ranges for highlighting individual edges. */
  edgeGroups: { start: number; count: number; edgeId: number }[];
}

/** Shared options for meshing operations. */
export interface MeshOptions {
  /** Linear deflection tolerance (default 1e-3). Smaller = finer mesh. */
  tolerance?: number;
  /** Angular deflection tolerance in radians (default 0.1). Smaller = finer mesh on curved surfaces. */
  angularTolerance?: number;
  /** Abort signal to cancel mesh generation between face iterations. */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Triangle mesh
// ---------------------------------------------------------------------------

/**
 * Mesh a shape as a set of triangles for rendering.
 *
 * Results are cached by default (keyed by shape identity + tolerance parameters).
 * Delegates to the kernel adapter's bulk C++ mesh extraction for performance.
 *
 * @returns A ShapeMesh containing typed arrays ready for GPU upload.
 * @see toBufferGeometryData — convert to Three.js BufferGeometry format
 */
export function mesh(
  shape: AnyShape,
  {
    tolerance = 1e-3,
    angularTolerance = 0.1,
    skipNormals = false,
    includeUVs = false,
    cache = true,
    signal,
  }: MeshOptions & { skipNormals?: boolean; includeUVs?: boolean; cache?: boolean } = {}
): ShapeMesh {
  signal?.throwIfAborted();
  // Check cache first (uses WeakMap keyed by shape object to avoid hash collisions)
  const cacheKey = buildMeshCacheKey(tolerance, angularTolerance, skipNormals, includeUVs);
  if (cache) {
    const cached = getMeshForShape(shape.wrapped, cacheKey);
    if (cached) return cached;
  }

  const result = getKernel().mesh(shape.wrapped, {
    tolerance,
    angularTolerance,
    skipNormals,
    includeUVs,
    ...(signal ? { signal } : {}),
  });

  const origins = getFaceOrigins(shape);
  const mesh: ShapeMesh = {
    vertices: result.vertices,
    normals: result.normals,
    triangles: result.triangles,
    uvs: result.uvs,
    faceGroups: result.faceGroups.map((g) => ({
      start: g.start,
      count: g.count,
      faceId: g.faceHash,
      origin: origins?.get(g.faceHash) ?? 0,
    })),
  };

  // Store in cache
  if (cache) {
    setMeshForShape(shape.wrapped, cacheKey, mesh);
  }

  return mesh;
}

// ---------------------------------------------------------------------------
// Edge mesh (line segments)
// ---------------------------------------------------------------------------

/**
 * Mesh the edges of a shape as line segments for wireframe rendering.
 *
 * Results are cached by default (keyed by shape identity + tolerance parameters).
 *
 * @returns An EdgeMesh containing line vertex positions and per-edge groups.
 * @see toLineGeometryData — convert to Three.js LineSegments format
 */
export function meshEdges(
  shape: AnyShape,
  { tolerance = 1e-3, angularTolerance = 0.1, cache = true }: MeshOptions & { cache?: boolean } = {}
): EdgeMesh {
  // Check cache first (uses WeakMap keyed by shape object to avoid hash collisions)
  const cacheKey = buildEdgeMeshCacheKey(tolerance, angularTolerance);
  if (cache) {
    const cached = getEdgeMeshForShape(shape.wrapped, cacheKey);
    if (cached) return cached;
  }

  const kernelResult = getKernel().meshEdges(shape.wrapped, tolerance, angularTolerance);

  const result: EdgeMesh = {
    lines: kernelResult.lines,
    edgeGroups: kernelResult.edgeGroups.map((g) => ({
      start: g.start,
      count: g.count,
      edgeId: g.edgeHash,
    })),
  };

  // Store in cache
  if (cache) {
    setEdgeMeshForShape(shape.wrapped, cacheKey, result);
  }

  return result;
}

// ---------------------------------------------------------------------------
// File export
// ---------------------------------------------------------------------------

/**
 * Export a shape as a STEP file Blob.
 *
 * @returns Ok with a Blob (MIME type `application/STEP`), or Err on failure.
 */
export function exportSTEP(shape: AnyShape): Result<Blob> {
  try {
    const stepString = getKernel().exportSTEP([shape.wrapped]);
    return ok(new Blob([stepString], { type: 'application/STEP' }));
  } catch (e) {
    // Distinguish FS read errors from write/transfer failures.
    // The kernel throws with "STEP export failed:" when the writer itself fails;
    // any other error (e.g. FS.readFile throwing) is a file-read issue.
    const isWriteFailure = e instanceof Error && e.message.startsWith('STEP export failed');
    const code = isWriteFailure ? 'STEP_EXPORT_FAILED' : 'STEP_FILE_READ_ERROR';
    const msg = isWriteFailure ? 'Failed to write STEP file' : 'Failed to read exported STEP file';
    return err(ioError(code, msg, e));
  }
}

/**
 * Export a shape as an STL file Blob.
 *
 * @returns Ok with a Blob (MIME type `application/sla`), or Err on failure.
 */
export function exportSTL(
  shape: AnyShape,
  {
    tolerance = 1e-3,
    angularTolerance = 0.1,
    binary = false,
  }: MeshOptions & { binary?: boolean } = {}
): Result<Blob> {
  try {
    // Ensure shape has triangulation before export
    if (!getKernel().hasTriangulation(shape.wrapped)) {
      getKernel().meshShape(shape.wrapped, tolerance, angularTolerance);
    }
    const stlData = getKernel().exportSTL(shape.wrapped, binary);
    return ok(new Blob([stlData], { type: 'application/sla' }));
  } catch (e) {
    const isWriteFailure = e instanceof Error && e.message.startsWith('STL export failed');
    const code = isWriteFailure ? 'STL_EXPORT_FAILED' : 'STL_FILE_READ_ERROR';
    const msg = isWriteFailure ? 'Failed to write STL file' : 'Failed to read exported STL file';
    return err(ioError(code, msg, e));
  }
}

/**
 * Export a shape as an IGES file Blob.
 *
 * @returns Ok with a Blob (MIME type `application/iges`), or Err on failure.
 */
export function exportIGES(shape: AnyShape): Result<Blob> {
  try {
    const igesString = getKernel().exportIGES([shape.wrapped]);
    return ok(new Blob([igesString], { type: 'application/iges' }));
  } catch (e) {
    return err(ioError('IGES_EXPORT_FAILED', 'Failed to write IGES file', e));
  }
}
