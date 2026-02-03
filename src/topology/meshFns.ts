/**
 * Meshing and export functions — functional replacements for Shape mesh/export methods.
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { ioError } from '../core/errors.js';
import { HASH_CODE_MAX, uniqueIOFilename } from '../core/constants.js';
import {
  buildMeshCacheKey,
  getMesh,
  setMesh,
  buildEdgeMeshCacheKey,
  getEdgeMesh,
  setEdgeMesh,
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
  // Check cache first
  const shapeHash = shape.wrapped.HashCode(HASH_CODE_MAX) as number;
  if (cache) {
    const cacheKey = buildMeshCacheKey(shapeHash, tolerance, angularTolerance, skipNormals);
    const cached = getMesh(cacheKey);
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
    const cacheKey = buildMeshCacheKey(shapeHash, tolerance, angularTolerance, skipNormals);
    setMesh(cacheKey, mesh);
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
  // Check cache first
  const shapeHash = shape.wrapped.HashCode(HASH_CODE_MAX) as number;
  if (cache) {
    const cacheKey = buildEdgeMeshCacheKey(shapeHash, tolerance, angularTolerance);
    const cached = getEdgeMesh(cacheKey);
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
    const cacheKey = buildEdgeMeshCacheKey(shapeHash, tolerance, angularTolerance);
    setEdgeMesh(cacheKey, result);
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

  oc.Interface_Static.SetIVal('write.step.schema', 5);
  writer.Model(true).delete();
  const progress = new oc.Message_ProgressRange_1();

  writer.Transfer(shape.wrapped, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress);

  const done = writer.Write(filename);
  writer.delete();
  progress.delete();

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
