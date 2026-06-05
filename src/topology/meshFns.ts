/**
 * Meshing and export functions — functional replacements for Shape mesh/export methods.
 */

import { getKernel } from '@/kernel/index.js';
import { qualityDeflection } from '@/kernel/quality.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { ioError, type BrepError } from '@/core/errors.js';

import {
  buildMeshCacheKey,
  getMeshForShape,
  setMeshForShape,
  buildEdgeMeshCacheKey,
  getEdgeMeshForShape,
  setEdgeMeshForShape,
} from './meshCache.js';
import { getFaceOrigins } from './shapeFns.js';
import { getBounds, getSolids } from './topologyQueryFns.js';

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
  /** Linear deflection tolerance. Smaller = finer mesh. Defaults to the active quality level. */
  tolerance?: number;
  /** Angular deflection tolerance in radians. Smaller = finer mesh on curved surfaces. Defaults to the active quality level. */
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
  shape: AnyShape<Dimension>,
  opts: MeshOptions & { skipNormals?: boolean; includeUVs?: boolean; cache?: boolean } = {}
): ShapeMesh {
  // Unspecified deflection defaults to the active quality level (see
  // withQuality / withTier). 'standard' reproduces the historical 1e-3 / 0.1.
  const quality = qualityDeflection();
  const {
    tolerance = quality.tolerance,
    angularTolerance = quality.angularTolerance,
    skipNormals = false,
    includeUVs = false,
    cache = true,
    signal,
  } = opts;
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
  shape: AnyShape<Dimension>,
  opts: MeshOptions & { cache?: boolean } = {}
): EdgeMesh {
  // Default deflection follows the active quality level (see mesh()).
  const quality = qualityDeflection();
  const {
    tolerance = quality.tolerance,
    angularTolerance = quality.angularTolerance,
    cache = true,
  } = opts;
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
/**
 * Classify a thrown export error into three distinct cases:
 * - the kernel throws "<FMT> export failed:" when the writer reports a non-success status;
 * - a `WebAssembly.RuntimeError` means the writer trapped on geometry it could not serialize
 *   (e.g. a degenerate sub-shape) — this can corrupt the kernel for the rest of the session,
 *   so it must not be silently relabelled as a file-read issue;
 * - anything else is an FS read failure on the V7 file path (write succeeded, readback threw).
 */
function exportError(e: unknown, fmt: 'STEP' | 'STL'): BrepError {
  if (e instanceof Error && e.message.startsWith(`${fmt} export failed`)) {
    return ioError(`${fmt}_EXPORT_FAILED`, `Failed to write ${fmt} file`, e);
  }
  if (e instanceof WebAssembly.RuntimeError) {
    return ioError(
      `${fmt}_EXPORT_CRASHED`,
      `${fmt} export crashed the kernel (${e.message}); the shape likely contains geometry the ${fmt} writer cannot serialize`,
      e
    );
  }
  return ioError(`${fmt}_FILE_READ_ERROR`, `Failed to read exported ${fmt} file`, e);
}

/**
 * When a compound's bounds probe fails, localize the offending sub-solid(s) so the
 * caller can heal or drop them. Returns a suffix for the error message; empty when
 * the shape is a single solid or localization itself fails. Only reached on the
 * error path, so the extra per-solid probes cost nothing in the happy case.
 */
function describeOffendingSolids(shape: AnyShape<Dimension>): string {
  let solids;
  try {
    solids = getSolids(shape);
  } catch {
    return '';
  }
  if (solids.length <= 1) return '';
  const bad: number[] = [];
  solids.forEach((solid, i) => {
    try {
      getBounds(solid);
    } catch (e) {
      // Mirror probeSerializable: a TypeError is a programming bug, not degenerate geometry.
      if (e instanceof TypeError) throw e;
      bad.push(i);
    }
  });
  if (bad.length === 0) {
    return `; could not localize the offending sub-solid among ${solids.length} solids`;
  }
  return `; offending sub-solid${bad.length > 1 ? 's' : ''} (of ${solids.length}): index ${bad.join(', ')}`;
}

/**
 * Probe a shape's bounding box before handing it to the STEP/STL writer.
 *
 * Some sub-shapes pass `isValid`/`validSolid` yet are degenerate enough that the
 * OCCT writer traps with a `WebAssembly.RuntimeError` (OOB) mid-transfer — which
 * corrupts the Emscripten heap and poisons the kernel for the rest of the session
 * (#1126). `getBounds` exercises the same geometry but fails *catchably*, so a
 * cheap pre-export probe lets us return a clean `Err` instead of crashing.
 * Heuristic, not universal: it only catches shapes whose bounding-box evaluation
 * also throws.
 *
 * Note: the canonical #1126 shape (an annular-sector tread fused with a frenet
 * helical rail) is NOT caught here — `getBounds` *succeeds* on it, as do
 * `isValid`/`validSolid`/`mesh`/`measureArea`, and `autoHeal` cannot repair it.
 * No known non-trapping check detects that BOPAlgo corruption; the only safety net
 * for it is `exportError` classifying the writer's `WebAssembly.RuntimeError` as
 * `*_EXPORT_CRASHED`. A real fix must come from the kernel (OCCT BOPAlgo).
 */
function probeSerializable(shape: AnyShape<Dimension>, fmt: 'STEP' | 'STL'): BrepError | null {
  try {
    getBounds(shape);
    return null;
  } catch (e) {
    // A TypeError signals a caller/programming bug (e.g. a malformed handle), not
    // unserializable geometry — let it surface rather than masking it as an export error.
    if (e instanceof TypeError) throw e;
    return ioError(
      `${fmt}_EXPORT_UNSERIALIZABLE`,
      `${fmt} export aborted: the shape contains degenerate geometry the ${fmt} writer cannot serialize (bounding-box evaluation failed); export was skipped to avoid crashing the kernel${describeOffendingSolids(shape)}`,
      e
    );
  }
}

export function exportSTEP(shape: AnyShape<Dimension>): Result<Blob> {
  const unserializable = probeSerializable(shape, 'STEP');
  if (unserializable) return err(unserializable);
  try {
    const stepString = getKernel().exportSTEP([shape.wrapped]);
    return ok(new Blob([stepString], { type: 'application/STEP' }));
  } catch (e) {
    return err(exportError(e, 'STEP'));
  }
}

/**
 * Export a shape as an STL file Blob.
 *
 * @returns Ok with a Blob (MIME type `application/sla`), or Err on failure.
 */
export function exportSTL(
  shape: AnyShape<Dimension>,
  opts: MeshOptions & { binary?: boolean } = {}
): Result<Blob> {
  // Default deflection follows the active quality level (see mesh()).
  const quality = qualityDeflection();
  const {
    tolerance = quality.tolerance,
    angularTolerance = quality.angularTolerance,
    binary = false,
  } = opts;
  const unserializable = probeSerializable(shape, 'STL');
  if (unserializable) return err(unserializable);
  try {
    // Ensure shape has triangulation before export
    if (!getKernel().hasTriangulation(shape.wrapped)) {
      getKernel().meshShape(shape.wrapped, tolerance, angularTolerance);
    }
    const stlData = getKernel().exportSTL(shape.wrapped, binary, tolerance, angularTolerance);
    return ok(new Blob([stlData], { type: 'application/sla' }));
  } catch (e) {
    return err(exportError(e, 'STL'));
  }
}

/**
 * Export a shape as an IGES file Blob.
 *
 * @returns Ok with a Blob (MIME type `application/iges`), or Err on failure.
 */
export function exportIGES(shape: AnyShape<Dimension>): Result<Blob> {
  try {
    const igesString = getKernel().exportIGES([shape.wrapped]);
    return ok(new Blob([igesString], { type: 'application/iges' }));
  } catch (e) {
    return err(ioError('IGES_EXPORT_FAILED', 'Failed to write IGES file', e));
  }
}

// ---------------------------------------------------------------------------
// Multi-LOD meshing
// ---------------------------------------------------------------------------

export interface MultiLODMesh {
  readonly coarse: ShapeMesh;
  readonly fine: ShapeMesh;
}

/**
 * Produce coarse (preview) + fine (export) meshes for a shape.
 *
 * Coarse mesh uses high tolerance for fast preview rendering.
 * Fine mesh uses low tolerance for export quality.
 */
export function meshMultiLOD(
  shape: AnyShape<Dimension>,
  options?: {
    readonly coarseTolerance?: number | undefined;
    readonly fineTolerance?: number | undefined;
    readonly angularTolerance?: number | undefined;
  }
): MultiLODMesh {
  const coarseTol = options?.coarseTolerance ?? 0.5;
  const fineTol = options?.fineTolerance ?? 0.05;
  const angTol = options?.angularTolerance ?? 0.5;

  const coarse = mesh(shape, { tolerance: coarseTol, angularTolerance: angTol });
  const fine = mesh(shape, { tolerance: fineTol, angularTolerance: angTol * 0.2 });

  return { coarse, fine };
}
