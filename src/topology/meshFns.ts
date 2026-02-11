/**
 * Meshing and export functions — functional replacements for Shape mesh/export methods.
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { ioError } from '../core/errors.js';
import { uniqueIOFilename } from '../core/constants.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT types are dynamic
type OcAny = any;

/** Check if a shape already has face triangulation from a prior mesh call. */
function shapeHasTriangulation(oc: OcAny, shape: OcAny): boolean {
  const explorer = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  let hasTri = false;
  if (explorer.More()) {
    const face = oc.TopoDS.Face_1(explorer.Current());
    const loc = new oc.TopLoc_Location_1();
    const tri = oc.BRep_Tool.Triangulation(face, loc, 0);
    hasTri = !tri.IsNull();
    loc.delete();
    tri.delete();
  }
  explorer.delete();
  return hasTri;
}

import {
  buildMeshCacheKey,
  getMeshForShape,
  setMeshForShape,
  buildEdgeMeshCacheKey,
  getEdgeMeshForShape,
  setEdgeMeshForShape,
} from './meshCache.js';

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
  faceGroups: { start: number; count: number; faceId: number }[];
}

/** Line segment mesh data for edge rendering (wireframe). */
export interface EdgeMesh {
  /** Flat array of line vertex positions (x,y,z interleaved, 2 vertices per segment). */
  lines: number[];
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
  const cacheKey = buildMeshCacheKey(tolerance, angularTolerance, skipNormals);
  if (cache && !includeUVs) {
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

  const mesh: ShapeMesh = {
    vertices: result.vertices,
    normals: result.normals,
    triangles: result.triangles,
    uvs: result.uvs,
    faceGroups: result.faceGroups.map((g) => ({
      start: g.start,
      count: g.count,
      faceId: g.faceHash,
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
    lines: Array.from(kernelResult.lines),
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
  const oc = getKernel().oc;
  const filename = uniqueIOFilename('_blob', 'step');
  const writer = new oc.STEPControl_Writer_1();
  const progress = new oc.Message_ProgressRange_1();

  try {
    oc.Interface_Static.SetIVal('write.step.schema', 5);
    writer.Model(true).delete();

    writer.Transfer(shape.wrapped, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress);

    const done = writer.Write(filename);

    if (done === oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      try {
        const file = oc.FS.readFile('/' + filename);
        oc.FS.unlink('/' + filename);
        return ok(new Blob([file], { type: 'application/STEP' }));
      } catch (e) {
        return err(ioError('STEP_FILE_READ_ERROR', 'Failed to read exported STEP file', e));
      }
    }
    return err(ioError('STEP_EXPORT_FAILED', 'Failed to write STEP file'));
  } finally {
    writer.delete();
    progress.delete();
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
  const oc = getKernel().oc;
  // Only mesh if shape doesn't already have triangulation (e.g. from prior mesh() call)
  if (!shapeHasTriangulation(oc, shape.wrapped)) {
    const mesher = new oc.BRepMesh_IncrementalMesh_2(
      shape.wrapped,
      tolerance,
      false,
      angularTolerance,
      false
    );
    mesher.delete();
  }
  const filename = uniqueIOFilename('_blob', 'stl');
  const done = oc.StlAPI.Write(shape.wrapped, filename, !binary);

  if (done) {
    try {
      const file = oc.FS.readFile('/' + filename);
      oc.FS.unlink('/' + filename);
      return ok(new Blob([file], { type: 'application/sla' }));
    } catch (e) {
      return err(ioError('STL_FILE_READ_ERROR', 'Failed to read exported STL file', e));
    }
  }
  return err(ioError('STL_EXPORT_FAILED', 'Failed to write STL file'));
}

/**
 * Export a shape as an IGES file Blob.
 *
 * @returns Ok with a Blob (MIME type `application/iges`), or Err on failure.
 */
export function exportIGES(shape: AnyShape): Result<Blob> {
  const oc = getKernel().oc;
  const filename = uniqueIOFilename('_blob', 'iges');
  const writer = new oc.IGESControl_Writer_1();

  try {
    writer.AddShape(shape.wrapped);
    writer.ComputeModel();

    const done = writer.Write_2(filename);

    if (done) {
      try {
        const file = oc.FS.readFile('/' + filename);
        oc.FS.unlink('/' + filename);
        return ok(new Blob([file], { type: 'application/iges' }));
      } catch (e) {
        return err(ioError('IGES_EXPORT_FAILED', 'Failed to read exported IGES file', e));
      }
    }
    return err(ioError('IGES_EXPORT_FAILED', 'Failed to write IGES file'));
  } finally {
    writer.delete();
  }
}
