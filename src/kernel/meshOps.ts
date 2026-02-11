/**
 * Meshing operations for OCCT shapes.
 *
 * Provides face mesh and edge mesh extraction with dual implementations:
 * - C++ bulk extraction (MeshExtractor/EdgeMeshExtractor) when available
 * - JS fallback using TopExp_Explorer
 *
 * Used by OCCTAdapter.
 */

import type {
  OpenCascadeInstance,
  OcShape,
  MeshOptions,
  KernelMeshResult,
  KernelEdgeMeshResult,
} from './types.js';
import { HASH_CODE_MAX } from './measureOps.js';

/**
 * Check if a shape already has face triangulation (from a prior mesh call).
 * Avoids redundant BRepMesh_IncrementalMesh creation.
 */
function hasTriangulation(oc: OpenCascadeInstance, shape: OcShape): boolean {
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

/**
 * Meshes a shape using C++ bulk extraction.
 */
export function meshBulk(
  oc: OpenCascadeInstance,
  shape: OcShape,
  options: MeshOptions
): KernelMeshResult {
  // Single WASM call: mesh + extract all data in C++
  const raw = oc.MeshExtractor.extract(
    shape,
    options.tolerance,
    options.angularTolerance,
    !!options.skipNormals
  );

  const verticesSize = raw.getVerticesSize() as number;
  const normalsSize = raw.getNormalsSize() as number;
  const trianglesSize = raw.getTrianglesSize() as number;
  const faceGroupsSize = raw.getFaceGroupsSize() as number;

  // Copy from WASM heap into owned TypedArrays.
  // Must .slice() before any other WASM call could grow/relocate the heap.
  const verticesPtr = (raw.getVerticesPtr() as number) / 4;
  const vertices = oc.HEAPF32.slice(verticesPtr, verticesPtr + verticesSize) as Float32Array;

  let normals: Float32Array;
  if (options.skipNormals || normalsSize === 0) {
    normals = new Float32Array(0);
  } else {
    const normalsPtr = (raw.getNormalsPtr() as number) / 4;
    normals = oc.HEAPF32.slice(normalsPtr, normalsPtr + normalsSize) as Float32Array;
  }

  const trianglesPtr = (raw.getTrianglesPtr() as number) / 4;
  const triangles = oc.HEAPU32.slice(trianglesPtr, trianglesPtr + trianglesSize) as Uint32Array;

  // Parse face groups from packed [start, count, faceHash, ...] triples
  const faceGroups: KernelMeshResult['faceGroups'] = [];
  if (faceGroupsSize > 0) {
    const fgPtr = (raw.getFaceGroupsPtr() as number) / 4;
    const fgRaw = oc.HEAP32.slice(fgPtr, fgPtr + faceGroupsSize) as Int32Array;
    for (let i = 0; i < fgRaw.length; i += 3) {
      faceGroups.push({
        start: fgRaw[i] as number,
        count: fgRaw[i + 1] as number,
        faceHash: fgRaw[i + 2] as number,
      });
    }
  }

  // Free C++ allocated memory (destructor frees internal buffers)
  raw.delete();

  return { vertices, normals, triangles, uvs: new Float32Array(0), faceGroups };
}

/**
 * Meshes a shape using JS-side TopExp_Explorer extraction.
 */
export function meshJS(
  oc: OpenCascadeInstance,
  shape: OcShape,
  options: MeshOptions
): KernelMeshResult {
  const mesher = new oc.BRepMesh_IncrementalMesh_2(
    shape,
    options.tolerance,
    false,
    options.angularTolerance,
    false
  );
  mesher.delete();

  // Pass 1: count totals so we can pre-allocate
  let totalNodes = 0;
  let totalTris = 0;

  const explorer = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  while (explorer.More()) {
    const face = oc.TopoDS.Face_1(explorer.Current());
    const loc = new oc.TopLoc_Location_1();
    const tri = oc.BRep_Tool.Triangulation(face, loc, 0);
    if (!tri.IsNull()) {
      const t = tri.get();
      totalNodes += t.NbNodes() as number;
      totalTris += t.NbTriangles() as number;
    }
    loc.delete();
    tri.delete();
    explorer.Next();
  }

  // Pass 2: fill pre-allocated arrays
  const vertices = new Float32Array(totalNodes * 3);
  const normals = options.skipNormals ? new Float32Array(0) : new Float32Array(totalNodes * 3);
  const uvs = options.includeUVs ? new Float32Array(totalNodes * 2) : new Float32Array(0);
  const triangles = new Uint32Array(totalTris * 3);
  const faceGroups: KernelMeshResult['faceGroups'] = [];

  let vIdx = 0;
  let nIdx = 0;
  let uvIdx = 0;
  let tIdx = 0;

  explorer.Init(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);

  while (explorer.More()) {
    options.signal?.throwIfAborted();
    const face = oc.TopoDS.Face_1(explorer.Current());
    const location = new oc.TopLoc_Location_1();
    const triangulation = oc.BRep_Tool.Triangulation(face, location, 0);

    if (!triangulation.IsNull()) {
      const tri = triangulation.get();
      const transformation = location.Transformation();
      const nbNodes = tri.NbNodes();
      const vertexOffset = vIdx / 3;
      const triStart = tIdx;

      for (let i = 1; i <= nbNodes; i++) {
        const p = tri.Node(i).Transformed(transformation);
        vertices[vIdx++] = p.X();
        vertices[vIdx++] = p.Y();
        vertices[vIdx++] = p.Z();
        p.delete();
      }

      if (!options.skipNormals) {
        const normalsArray = new oc.TColgp_Array1OfDir_2(1, nbNodes);
        const pc = new oc.Poly_Connect_2(triangulation);
        oc.StdPrs_ToolTriangulatedShape.Normal(face, pc, normalsArray);
        for (let i = normalsArray.Lower(); i <= normalsArray.Upper(); i++) {
          const d = normalsArray.Value(i).Transformed(transformation);
          normals[nIdx++] = d.X();
          normals[nIdx++] = d.Y();
          normals[nIdx++] = d.Z();
          d.delete();
        }
        normalsArray.delete();
        pc.delete();
      }

      if (options.includeUVs && tri.HasUVNodes()) {
        for (let i = 1; i <= nbNodes; i++) {
          const uv = tri.UVNode(i);
          uvs[uvIdx++] = uv.X();
          uvs[uvIdx++] = uv.Y();
          uv.delete();
        }
      } else if (options.includeUVs) {
        // No UV data for this face — fill with zeros
        for (let i = 0; i < nbNodes; i++) {
          uvs[uvIdx++] = 0;
          uvs[uvIdx++] = 0;
        }
      }

      const orient = face.Orientation_1();
      const isForward = orient === oc.TopAbs_Orientation.TopAbs_FORWARD;
      const nbTriangles = tri.NbTriangles();

      for (let nt = 1; nt <= nbTriangles; nt++) {
        const t = tri.Triangle(nt);
        let n1 = t.Value(1);
        let n2 = t.Value(2);
        const n3 = t.Value(3);
        if (!isForward) {
          const tmp = n1;
          n1 = n2;
          n2 = tmp;
        }
        triangles[tIdx++] = n1 - 1 + vertexOffset;
        triangles[tIdx++] = n2 - 1 + vertexOffset;
        triangles[tIdx++] = n3 - 1 + vertexOffset;
        t.delete();
      }

      faceGroups.push({
        start: triStart,
        count: tIdx - triStart,
        faceHash: face.HashCode(HASH_CODE_MAX),
      });
      transformation.delete();
    }

    location.delete();
    triangulation.delete();
    explorer.Next();
  }
  explorer.delete();

  return { vertices, normals, triangles, uvs, faceGroups };
}

/**
 * Meshes a shape, using C++ bulk extraction when available.
 */
export function mesh(
  oc: OpenCascadeInstance,
  shape: OcShape,
  options: MeshOptions
): KernelMeshResult {
  // C++ bulk path doesn't support UV extraction — fall back to JS
  if (oc.MeshExtractor && !options.includeUVs) {
    return meshBulk(oc, shape, options);
  }
  return meshJS(oc, shape, options);
}

/**
 * Extracts edge meshes using C++ bulk extraction.
 */
export function meshEdgesBulk(
  oc: OpenCascadeInstance,
  shape: OcShape,
  tolerance: number,
  angularTolerance: number
): KernelEdgeMeshResult {
  const raw = oc.EdgeMeshExtractor.extract(shape, tolerance, angularTolerance);

  const linesSize = raw.getLinesSize() as number;
  const edgeGroupsSize = raw.getEdgeGroupsSize() as number;

  let lines: Float32Array;
  if (linesSize > 0) {
    const linesPtr = (raw.getLinesPtr() as number) / 4;
    lines = oc.HEAPF32.slice(linesPtr, linesPtr + linesSize) as Float32Array;
  } else {
    lines = new Float32Array(0);
  }

  const edgeGroups: KernelEdgeMeshResult['edgeGroups'] = [];
  if (edgeGroupsSize > 0) {
    const egPtr = (raw.getEdgeGroupsPtr() as number) / 4;
    const egRaw = oc.HEAP32.slice(egPtr, egPtr + edgeGroupsSize) as Int32Array;
    for (let i = 0; i < egRaw.length; i += 3) {
      edgeGroups.push({
        start: egRaw[i] as number,
        count: egRaw[i + 1] as number,
        edgeHash: egRaw[i + 2] as number,
      });
    }
  }

  raw.delete();
  return { lines, edgeGroups };
}

/**
 * Extracts edge meshes using JS-side extraction.
 */
export function meshEdgesJS(
  oc: OpenCascadeInstance,
  shape: OcShape,
  tolerance: number,
  angularTolerance: number
): KernelEdgeMeshResult {
  // Only mesh if triangulation doesn't already exist (e.g. from a prior mesh() call)
  if (!hasTriangulation(oc, shape)) {
    const mesher = new oc.BRepMesh_IncrementalMesh_2(
      shape,
      tolerance,
      false,
      angularTolerance,
      false
    );
    mesher.delete();
  }

  const lines: number[] = [];
  const edgeGroups: KernelEdgeMeshResult['edgeGroups'] = [];
  const seenHashes = new Set<number>();

  // Pass 1: edges from face triangulations
  const faceExplorer = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  while (faceExplorer.More()) {
    const face = oc.TopoDS.Face_1(faceExplorer.Current());
    const faceLoc = new oc.TopLoc_Location_1();
    const tri = oc.BRep_Tool.Triangulation(face, faceLoc, 0);

    if (!tri.IsNull()) {
      const triObj = tri.get();
      const edgeExplorer = new oc.TopExp_Explorer_2(
        face,
        oc.TopAbs_ShapeEnum.TopAbs_EDGE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
      );
      while (edgeExplorer.More()) {
        const edgeShape = edgeExplorer.Current();
        const edge = oc.TopoDS.Edge_1(edgeShape);
        const edgeHash = edge.HashCode(HASH_CODE_MAX);
        if (!seenHashes.has(edgeHash)) {
          seenHashes.add(edgeHash);
          const edgeLoc = new oc.TopLoc_Location_1();
          const polygon = oc.BRep_Tool.PolygonOnTriangulation_1(edge, tri, edgeLoc);
          // Check both existence and IsNull() - Handle can exist but be null
          const edgeNodes = polygon && !polygon.IsNull() ? polygon.get().Nodes() : null;
          if (edgeNodes) {
            const lineStart = lines.length / 3;
            let prevX = 0,
              prevY = 0,
              prevZ = 0;
            let hasPrev = false;
            for (let i = edgeNodes.Lower(); i <= edgeNodes.Upper(); i++) {
              const p = triObj.Node(edgeNodes.Value(i)).Transformed(edgeLoc.Transformation());
              const x = p.X(),
                y = p.Y(),
                z = p.Z();
              if (hasPrev) {
                lines.push(prevX, prevY, prevZ, x, y, z);
              }
              prevX = x;
              prevY = y;
              prevZ = z;
              hasPrev = true;
              p.delete();
            }
            edgeGroups.push({
              start: lineStart,
              count: lines.length / 3 - lineStart,
              edgeHash,
            });
            edgeNodes.delete();
          }
          if (polygon && !polygon.IsNull()) polygon.delete();
          edgeLoc.delete();
        }
        edgeExplorer.Next();
      }
      edgeExplorer.delete();
    }

    tri.delete();
    faceLoc.delete();
    faceExplorer.Next();
  }
  faceExplorer.delete();

  // Pass 2: remaining edges via curve tessellation
  const edgeExplorer = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  while (edgeExplorer.More()) {
    const edgeShape = edgeExplorer.Current();
    const edge = oc.TopoDS.Edge_1(edgeShape);
    const edgeHash = edge.HashCode(HASH_CODE_MAX);
    if (!seenHashes.has(edgeHash)) {
      seenHashes.add(edgeHash);
      const adaptor = new oc.BRepAdaptor_Curve_2(edge);
      const tangDef = new oc.GCPnts_TangentialDeflection_2(
        adaptor,
        tolerance,
        angularTolerance,
        2,
        1e-9,
        1e-7
      );
      const lineStart = lines.length / 3;
      let prevX = 0,
        prevY = 0,
        prevZ = 0;
      let hasPrev = false;
      for (let j = 1; j <= tangDef.NbPoints(); j++) {
        const p = tangDef.Value(j);
        const x = p.X(),
          y = p.Y(),
          z = p.Z();
        if (hasPrev) {
          lines.push(prevX, prevY, prevZ, x, y, z);
        }
        prevX = x;
        prevY = y;
        prevZ = z;
        hasPrev = true;
        p.delete();
      }
      edgeGroups.push({
        start: lineStart,
        count: lines.length / 3 - lineStart,
        edgeHash,
      });
      tangDef.delete();
      adaptor.delete();
    }
    edgeExplorer.Next();
  }
  edgeExplorer.delete();

  return { lines: new Float32Array(lines), edgeGroups };
}

/**
 * Extracts edge meshes, using C++ bulk extraction when available.
 */
export function meshEdges(
  oc: OpenCascadeInstance,
  shape: OcShape,
  tolerance: number,
  angularTolerance: number
): KernelEdgeMeshResult {
  if (oc.EdgeMeshExtractor) {
    return meshEdgesBulk(oc, shape, tolerance, angularTolerance);
  }
  return meshEdgesJS(oc, shape, tolerance, angularTolerance);
}
