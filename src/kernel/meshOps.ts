/**
 * Meshing operations for OCCT shapes.
 *
 * Provides face mesh and edge mesh extraction with dual implementations:
 * - C++ bulk extraction (MeshExtractor/EdgeMeshExtractor) when available
 * - JS fallback using TopExp_Explorer
 *
 * Used by DefaultAdapter.
 */

import type {
  KernelInstance,
  KernelShape,
  MeshOptions,
  KernelMeshResult,
  KernelEdgeMeshResult,
} from './types.js';
import { HASH_CODE_MAX } from './measureOps.js';

/** Slice a Float32Array from the WASM heap, or return empty if size is 0. */
function sliceF32(heap: Float32Array, ptr: number, size: number): Float32Array {
  if (size === 0) return new Float32Array(0);
  const offset = ptr / 4;
  return heap.slice(offset, offset + size) as Float32Array;
}

/**
 * Check if a shape already has face triangulation (from a prior mesh call).
 * Avoids redundant BRepMesh_IncrementalMesh creation.
 */
function hasTriangulation(oc: KernelInstance, shape: KernelShape): boolean {
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

/** Cached flag: does the WASM MeshExtractor support the 5-arg includeUVs signature? */
let meshExtractorHasUVs: boolean | undefined;

/** Reset detection cache (called when kernel is re-initialized). */
export function resetMeshDetectionCache(): void {
  meshExtractorHasUVs = undefined;
}

function detectMeshExtractorUVs(oc: KernelInstance): void {
  try {
    // Use a minimal empty shape to detect signature support without meshing the user's shape
    const emptyShape = new oc.TopoDS_Shape();
    try {
      const probe = oc.MeshExtractor.extract(emptyShape, 0.1, 0.5, true, false);
      meshExtractorHasUVs = typeof probe.getUvsSize === 'function';
      probe.delete();
    } finally {
      emptyShape.delete();
    }
  } catch {
    meshExtractorHasUVs = false;
  }
}

/**
 * Meshes a shape using C++ bulk extraction.
 */
export function meshBulk(
  oc: KernelInstance,
  shape: KernelShape,
  options: MeshOptions
): KernelMeshResult {
  // Detect 5-arg signature support once, then cache
  if (meshExtractorHasUVs === undefined) {
    detectMeshExtractorUVs(oc);
  }

  // Single WASM call: mesh + extract all data in C++
  const raw = meshExtractorHasUVs
    ? oc.MeshExtractor.extract(
        shape,
        options.tolerance,
        options.angularTolerance,
        !!options.skipNormals,
        !!options.includeUVs
      )
    : oc.MeshExtractor.extract(
        shape,
        options.tolerance,
        options.angularTolerance,
        !!options.skipNormals
      );

  const verticesSize = raw.getVerticesSize() as number;
  const normalsSize = raw.getNormalsSize() as number;
  const trianglesSize = raw.getTrianglesSize() as number;
  const faceGroupsSize = raw.getFaceGroupsSize() as number;
  const uvsSize = meshExtractorHasUVs ? (raw.getUvsSize() as number) : 0;

  // Copy from WASM heap into owned TypedArrays.
  // Must .slice() before any other WASM call could grow/relocate the heap.
  const vertices = sliceF32(oc.HEAPF32, raw.getVerticesPtr() as number, verticesSize);
  const normals =
    options.skipNormals || normalsSize === 0
      ? new Float32Array(0)
      : sliceF32(oc.HEAPF32, raw.getNormalsPtr() as number, normalsSize);

  const trianglesPtr = (raw.getTrianglesPtr() as number) / 4;
  const triangles = oc.HEAPU32.slice(trianglesPtr, trianglesPtr + trianglesSize) as Uint32Array;

  const uvs =
    uvsSize > 0 ? sliceF32(oc.HEAPF32, raw.getUvsPtr() as number, uvsSize) : new Float32Array(0);

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

  return { vertices, normals, triangles, uvs, faceGroups };
}

/**
 * Mutable write positions for pre-allocated mesh arrays.
 *
 * Passed into `_meshFace` so each face writes at the correct offset
 * within the shared pre-allocated buffers.
 */
interface MeshWriteState {
  vIdx: number;
  nIdx: number;
  uvIdx: number;
  tIdx: number;
}

/**
 * Extract mesh data for a single OCCT face into pre-allocated arrays.
 *
 * Encapsulates per-face vertex, normal, UV, and triangle extraction
 * — including the normal computation via Poly_Connect +
 * StdPrs_ToolTriangulatedShape.Normal().
 *
 * ADR-0006 Phase 2: isolates the OCCT normal-computation orchestration
 * into a single function, mirroring brepkit's meshSingleFace() pattern.
 * When the C++ MeshExtractor is available, this function is not called
 * (meshBulk handles everything in a single WASM call).
 */
function _meshFace(
  oc: KernelInstance,
  face: KernelShape,
  triangulation: { IsNull(): boolean; get(): KernelShape },
  location: KernelShape,
  options: MeshOptions,
  vertices: Float32Array,
  normals: Float32Array,
  uvs: Float32Array,
  triangles: Uint32Array,
  state: MeshWriteState,
  faceGroups: KernelMeshResult['faceGroups']
): void {
  const tri = triangulation.get();
  const transformation = location.Transformation();
  const nbNodes = tri.NbNodes();
  const vertexOffset = state.vIdx / 3;
  const triStart = state.tIdx;

  // Vertices
  for (let i = 1; i <= nbNodes; i++) {
    const p = tri.Node(i).Transformed(transformation);
    vertices[state.vIdx++] = p.X();
    vertices[state.vIdx++] = p.Y();
    vertices[state.vIdx++] = p.Z();
    p.delete();
  }

  // Normals — computed from triangulation connectivity via OCCT
  if (!options.skipNormals) {
    const normalsArray = new oc.TColgp_Array1OfDir_2(1, nbNodes);
    const pc = new oc.Poly_Connect_2(triangulation);
    oc.StdPrs_ToolTriangulatedShape.Normal(face, pc, normalsArray);
    for (let i = normalsArray.Lower(); i <= normalsArray.Upper(); i++) {
      const d = normalsArray.Value(i).Transformed(transformation);
      normals[state.nIdx++] = d.X();
      normals[state.nIdx++] = d.Y();
      normals[state.nIdx++] = d.Z();
      d.delete();
    }
    normalsArray.delete();
    pc.delete();
  }

  // UVs
  if (options.includeUVs && tri.HasUVNodes()) {
    for (let i = 1; i <= nbNodes; i++) {
      const uv = tri.UVNode(i);
      uvs[state.uvIdx++] = uv.X();
      uvs[state.uvIdx++] = uv.Y();
      uv.delete();
    }
  } else if (options.includeUVs) {
    // No UV data for this face — fill with zeros
    for (let i = 0; i < nbNodes; i++) {
      uvs[state.uvIdx++] = 0;
      uvs[state.uvIdx++] = 0;
    }
  }

  // Triangles — reverse winding for non-forward faces
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
    triangles[state.tIdx++] = n1 - 1 + vertexOffset;
    triangles[state.tIdx++] = n2 - 1 + vertexOffset;
    triangles[state.tIdx++] = n3 - 1 + vertexOffset;
    t.delete();
  }

  faceGroups.push({
    start: triStart,
    count: state.tIdx - triStart,
    faceHash: face.HashCode(HASH_CODE_MAX),
  });
  transformation.delete();
}

/**
 * Meshes a shape using JS-side TopExp_Explorer extraction.
 */
export function meshJS(
  oc: KernelInstance,
  shape: KernelShape,
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

  // Pass 2: fill pre-allocated arrays via _meshFace
  const vertices = new Float32Array(totalNodes * 3);
  const normals = options.skipNormals ? new Float32Array(0) : new Float32Array(totalNodes * 3);
  const uvs = options.includeUVs ? new Float32Array(totalNodes * 2) : new Float32Array(0);
  const triangles = new Uint32Array(totalTris * 3);
  const faceGroups: KernelMeshResult['faceGroups'] = [];
  const state: MeshWriteState = { vIdx: 0, nIdx: 0, uvIdx: 0, tIdx: 0 };

  explorer.Init(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);

  while (explorer.More()) {
    options.signal?.throwIfAborted();
    const face = oc.TopoDS.Face_1(explorer.Current());
    const location = new oc.TopLoc_Location_1();
    const triangulation = oc.BRep_Tool.Triangulation(face, location, 0);

    if (!triangulation.IsNull()) {
      _meshFace(
        oc,
        face,
        triangulation,
        location,
        options,
        vertices,
        normals,
        uvs,
        triangles,
        state,
        faceGroups
      );
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
  oc: KernelInstance,
  shape: KernelShape,
  options: MeshOptions
): KernelMeshResult {
  if (oc.MeshExtractor) {
    // Ensure UV capability is detected before routing
    if (meshExtractorHasUVs === undefined) {
      detectMeshExtractorUVs(oc);
    }
    // If UVs are requested but C++ doesn't support them, fall back to JS
    if (options.includeUVs && !meshExtractorHasUVs) {
      return meshJS(oc, shape, options);
    }
    return meshBulk(oc, shape, options);
  }
  return meshJS(oc, shape, options);
}

/**
 * Extracts edge meshes using C++ bulk extraction.
 */
export function meshEdgesBulk(
  oc: KernelInstance,
  shape: KernelShape,
  tolerance: number,
  angularTolerance: number
): KernelEdgeMeshResult {
  const raw = oc.EdgeMeshExtractor.extract(shape, tolerance, angularTolerance);

  const linesSize = raw.getLinesSize() as number;
  const edgeGroupsSize = raw.getEdgeGroupsSize() as number;

  const lines = sliceF32(oc.HEAPF32, raw.getLinesPtr() as number, linesSize);

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
  oc: KernelInstance,
  shape: KernelShape,
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
            // Hoist Transformation() outside the loop — same for all nodes of this edge
            const trsf = edgeLoc.Transformation();
            for (let i = edgeNodes.Lower(); i <= edgeNodes.Upper(); i++) {
              const p = triObj.Node(edgeNodes.Value(i)).Transformed(trsf);
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
            trsf.delete();
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
  oc: KernelInstance,
  shape: KernelShape,
  tolerance: number,
  angularTolerance: number
): KernelEdgeMeshResult {
  if (oc.EdgeMeshExtractor) {
    return meshEdgesBulk(oc, shape, tolerance, angularTolerance);
  }
  return meshEdgesJS(oc, shape, tolerance, angularTolerance);
}
