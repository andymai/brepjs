/**
 * Meshing and export functions — functional replacements for Shape mesh/export methods.
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { ioError } from '../core/errors.js';
import { uniqueIOFilename } from '../core/constants.js';
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

export interface ShapeMesh {
  triangles: Uint32Array;
  vertices: Float32Array;
  normals: Float32Array;
  faceGroups: { start: number; count: number; faceId: number }[];
}

export interface EdgeMesh {
  lines: number[];
  edgeGroups: { start: number; count: number; edgeId: number }[];
}

export interface MeshOptions {
  tolerance?: number;
  angularTolerance?: number;
}

// ---------------------------------------------------------------------------
// Triangle mesh
// ---------------------------------------------------------------------------

/** Mesh a shape as a set of triangles for rendering. */
export function meshShape(
  shape: AnyShape,
  {
    tolerance = 1e-3,
    angularTolerance = 0.1,
    skipNormals = false,
    cache = true,
  }: MeshOptions & { skipNormals?: boolean; cache?: boolean } = {}
): ShapeMesh {
  // Check cache first (uses WeakMap keyed by shape object to avoid hash collisions)
  const cacheKey = buildMeshCacheKey(0, tolerance, angularTolerance, skipNormals);
  if (cache) {
    const cached = getMeshForShape(shape.wrapped, cacheKey);
    if (cached) return cached;
  }

  const result = getKernel().mesh(shape.wrapped, {
    tolerance,
    angularTolerance,
    skipNormals,
  });

  const mesh: ShapeMesh = {
    vertices: result.vertices,
    normals: result.normals,
    triangles: result.triangles,
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

/** Mesh the edges of a shape as line segments for edge rendering. */
export function meshShapeEdges(
  shape: AnyShape,
  { tolerance = 1e-3, angularTolerance = 0.1, cache = true }: MeshOptions & { cache?: boolean } = {}
): EdgeMesh {
  // Check cache first (uses WeakMap keyed by shape object to avoid hash collisions)
  const cacheKey = buildEdgeMeshCacheKey(0, tolerance, angularTolerance);
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

/** Export a shape as a STEP file Blob. */
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

/** Export a shape as an STL file Blob. */
export function exportSTL(
  shape: AnyShape,
  {
    tolerance = 1e-3,
    angularTolerance = 0.1,
    binary = false,
  }: MeshOptions & { binary?: boolean } = {}
): Result<Blob> {
  const oc = getKernel().oc;
  const mesher = new oc.BRepMesh_IncrementalMesh_2(
    shape.wrapped,
    tolerance,
    false,
    angularTolerance,
    false
  );
  mesher.delete();
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
