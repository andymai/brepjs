/**
 * Mesh operations.
 * The actual mesh/meshEdges/triangulation logic lives on Shape class methods
 * in topology/shapes.ts. This module provides standalone versions.
 */

import type { OcType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import { GCWithScope } from '../core/memory.js';

export interface FaceTriangulation {
  vertices: number[];
  trianglesIndexes: number[];
  verticesNormals: number[];
}

export interface ShapeMesh {
  triangles: number[];
  vertices: number[];
  normals: number[];
  faceGroups: { start: number; count: number; faceId: number }[];
}

export function meshShape(
  shape: OcType,
  {
    tolerance = 1e-3,
    angularTolerance = 0.1,
  }: {
    tolerance?: number;
    angularTolerance?: number;
  } = {}
): void {
  const oc = getKernel().oc;
  new oc.BRepMesh_IncrementalMesh_2(shape, tolerance, false, angularTolerance, false);
}

export function triangulateFace(
  face: OcType,
  orientation: 'forward' | 'backward',
  index0 = 0,
  skipNormals = false
): FaceTriangulation | null {
  const r = GCWithScope();
  const oc = getKernel().oc;

  const aLocation = r(new oc.TopLoc_Location_1());
  const triangulation = r(oc.BRep_Tool.Triangulation(face, aLocation, 0));

  if (triangulation.IsNull()) return null;

  const transformation = r(aLocation.Transformation());

  const triangulatedFace: FaceTriangulation = {
    vertices: [],
    trianglesIndexes: [],
    verticesNormals: [],
  };

  const tri = triangulation.get();
  const nbNodes = tri.NbNodes();

  triangulatedFace.vertices = new Array(nbNodes * 3);
  for (let i = 1; i <= nbNodes; i++) {
    const p = r(r(tri.Node(i)).Transformed(transformation));
    triangulatedFace.vertices[(i - 1) * 3 + 0] = p.X();
    triangulatedFace.vertices[(i - 1) * 3 + 1] = p.Y();
    triangulatedFace.vertices[(i - 1) * 3 + 2] = p.Z();
  }

  if (!skipNormals) {
    const normalsArray = r(new oc.TColgp_Array1OfDir_2(1, nbNodes));
    const pc = r(new oc.Poly_Connect_2(triangulation));
    oc.StdPrs_ToolTriangulatedShape.Normal(face, pc, normalsArray);
    triangulatedFace.verticesNormals = new Array(normalsArray.Length() * 3);
    for (let i = normalsArray.Lower(); i <= normalsArray.Upper(); i++) {
      const d = r(r(normalsArray.Value(i)).Transformed(transformation));
      triangulatedFace.verticesNormals[(i - 1) * 3 + 0] = d.X();
      triangulatedFace.verticesNormals[(i - 1) * 3 + 1] = d.Y();
      triangulatedFace.verticesNormals[(i - 1) * 3 + 2] = d.Z();
    }
  }

  const nbTriangles = tri.NbTriangles();
  triangulatedFace.trianglesIndexes = new Array(nbTriangles * 3);
  let validFaceTriCount = 0;
  for (let nt = 1; nt <= nbTriangles; nt++) {
    const t = r(tri.Triangle(nt));
    let n1 = t.Value(1);
    let n2 = t.Value(2);
    const n3 = t.Value(3);
    if (orientation === 'backward') {
      const tmp = n1;
      n1 = n2;
      n2 = tmp;
    }
    triangulatedFace.trianglesIndexes[validFaceTriCount * 3 + 0] = n1 - 1 + index0;
    triangulatedFace.trianglesIndexes[validFaceTriCount * 3 + 1] = n2 - 1 + index0;
    triangulatedFace.trianglesIndexes[validFaceTriCount * 3 + 2] = n3 - 1 + index0;
    validFaceTriCount++;
  }
  return triangulatedFace;
}
