/**
 * Meshing and export functions — functional replacements for Shape mesh/export methods.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT types are dynamic
type OcType = any;

import { getKernel } from '../kernel/index.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { gcWithScope } from '../core/disposal.js';
import { type Result, ok, err } from '../core/result.js';
import { ioError } from '../core/errors.js';
import { HASH_CODE_MAX } from '../core/constants.js';
import { getFaces, getEdges, getHashCode } from './shapeFns.js';
import { type FaceTriangulation, triangulateFace } from './faceFns.js';

// ---------------------------------------------------------------------------
// Mesh types
// ---------------------------------------------------------------------------

export interface ShapeMesh {
  triangles: number[];
  vertices: number[];
  normals: number[];
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
// Internal: incremental mesh
// ---------------------------------------------------------------------------

function incrementalMesh(
  shape: AnyShape,
  { tolerance = 1e-3, angularTolerance = 0.1 }: MeshOptions = {}
): void {
  const oc = getKernel().oc;
  new oc.BRepMesh_IncrementalMesh_2(shape.wrapped, tolerance, false, angularTolerance, false);
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
  }: MeshOptions & { skipNormals?: boolean } = {}
): ShapeMesh {
  incrementalMesh(shape, { tolerance, angularTolerance });

  const faces = getFaces(shape);
  const faceResults: { tri: FaceTriangulation; faceId: number }[] = [];
  let totalTriangles = 0;
  let totalVertices = 0;
  let totalNormals = 0;
  let vertexOffset = 0;

  for (const face of faces) {
    const tri = triangulateFace(face, vertexOffset, skipNormals);
    if (!tri) continue;
    faceResults.push({ tri, faceId: getHashCode(face) });
    totalTriangles += tri.trianglesIndexes.length;
    totalVertices += tri.vertices.length;
    totalNormals += tri.verticesNormals.length;
    vertexOffset += tri.vertices.length / 3;
  }

  const triangles = new Array<number>(totalTriangles);
  const vertices = new Array<number>(totalVertices);
  const normals = new Array<number>(totalNormals);
  const faceGroups: { start: number; count: number; faceId: number }[] = [];
  let triOffset = 0;
  let vtxOffset = 0;
  let nrmOffset = 0;

  for (const { tri, faceId } of faceResults) {
    faceGroups.push({ start: triOffset, count: tri.trianglesIndexes.length, faceId });
    for (let i = 0; i < tri.trianglesIndexes.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      triangles[triOffset++] = tri.trianglesIndexes[i]!;
    }
    for (let i = 0; i < tri.vertices.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      vertices[vtxOffset++] = tri.vertices[i]!;
    }
    for (let i = 0; i < tri.verticesNormals.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      normals[nrmOffset++] = tri.verticesNormals[i]!;
    }
  }

  return { triangles, vertices, normals, faceGroups };
}

// ---------------------------------------------------------------------------
// Edge mesh (line segments)
// ---------------------------------------------------------------------------

/** Mesh the edges of a shape as line segments for edge rendering. */
export function meshShapeEdges(
  shape: AnyShape,
  { tolerance = 1e-3, angularTolerance = 0.1 }: MeshOptions = {}
): EdgeMesh {
  const oc = getKernel().oc;
  const r = gcWithScope();
  const recordedEdges = new Set<number>();
  const lines: number[] = [];
  const edgeGroups: { start: number; count: number; edgeId: number }[] = [];

  const addEdge = (): [(p: OcType) => void, (h: number) => void] => {
    const start = lines.length;
    let prevX = 0;
    let prevY = 0;
    let prevZ = 0;
    let hasPrev = false;

    return [
      (p: OcType) => {
        const x = p.X();
        const y = p.Y();
        const z = p.Z();
        if (hasPrev) {
          lines.push(prevX, prevY, prevZ, x, y, z);
        }
        prevX = x;
        prevY = y;
        prevZ = z;
        hasPrev = true;
      },
      (edgeHash: number) => {
        edgeGroups.push({
          start: start / 3,
          count: (lines.length - start) / 3,
          edgeId: edgeHash,
        });
        recordedEdges.add(edgeHash);
      },
    ];
  };

  const aLocation = r(new oc.TopLoc_Location_1());
  const faces = getFaces(shape);

  for (const face of faces) {
    const triangulation = r(oc.BRep_Tool.Triangulation(face.wrapped, aLocation, 0));
    if (triangulation.IsNull()) continue;
    const tri = triangulation.get();

    const faceEdges = getEdges(face);
    for (const edge of faceEdges) {
      const edgeHash = edge.wrapped.HashCode(HASH_CODE_MAX);
      if (recordedEdges.has(edgeHash)) continue;

      const edgeLoc = r(new oc.TopLoc_Location_1());
      const polygon = r(
        oc.BRep_Tool.PolygonOnTriangulation_1(edge.wrapped, triangulation, edgeLoc)
      );
      const edgeNodes = polygon?.get()?.Nodes();
      if (!edgeNodes) continue;
      r(edgeNodes);

      const [recordPoint, done] = addEdge();
      for (let i = edgeNodes.Lower(); i <= edgeNodes.Upper(); i++) {
        const p = r(r(tri.Node(edgeNodes.Value(i))).Transformed(edgeLoc.Transformation()));
        recordPoint(p);
      }
      done(edgeHash);
    }
  }

  const allEdges = getEdges(shape);
  for (const edge of allEdges) {
    const edgeHash = edge.wrapped.HashCode(HASH_CODE_MAX);
    if (recordedEdges.has(edgeHash)) continue;

    const adaptorCurve = r(new oc.BRepAdaptor_Curve_2(edge.wrapped));
    const tangDef = r(
      new oc.GCPnts_TangentialDeflection_2(adaptorCurve, tolerance, angularTolerance, 2, 1e-9, 1e-7)
    );
    const [recordPoint, done] = addEdge();
    for (let j = 0; j < tangDef.NbPoints(); j++) {
      const p = r(tangDef.Value(j + 1).Transformed(aLocation.Transformation()));
      recordPoint(p);
    }
    done(edgeHash);
  }

  return { lines, edgeGroups };
}

// ---------------------------------------------------------------------------
// File export
// ---------------------------------------------------------------------------

/** Export a shape as a STEP file Blob. */
export function exportSTEP(shape: AnyShape): Result<Blob> {
  const oc = getKernel().oc;
  const filename = 'blob.step';
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
  incrementalMesh(shape, { tolerance, angularTolerance });
  const filename = 'blob.stl';
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
