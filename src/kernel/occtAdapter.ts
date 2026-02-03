import type {
  KernelAdapter,
  KernelMeshResult,
  KernelEdgeMeshResult,
  OpenCascadeInstance,
  OcShape,
  OcType,
  BooleanOptions,
  ShapeType,
  MeshOptions,
} from './types.js';
import { uniqueIOFilename } from '../utils/ioFilename.js';

const HASH_CODE_MAX = 2147483647;

/**
 * OpenCascade implementation of KernelAdapter.
 *
 * Centralizes scattered getOC() patterns from the codebase into organized methods.
 * Shapes still hold raw TopoDS_* types internally — this adapter provides factory
 * methods and operations.
 */
export class OCCTAdapter implements KernelAdapter {
  readonly oc: OpenCascadeInstance;

  constructor(oc: OpenCascadeInstance) {
    this.oc = oc;
  }

  // --- Boolean operations ---

  fuse(shape: OcShape, tool: OcShape, options: BooleanOptions = {}): OcShape {
    const { optimisation, simplify = false } = options;
    const progress = new this.oc.Message_ProgressRange_1();
    const fuseOp = new this.oc.BRepAlgoAPI_Fuse_3(shape, tool, progress);
    this._applyGlue(fuseOp, optimisation);
    fuseOp.Build(progress);
    if (simplify) fuseOp.SimplifyResult(true, true, 1e-3);
    const result = fuseOp.Shape();
    fuseOp.delete();
    progress.delete();
    return result;
  }

  cut(shape: OcShape, tool: OcShape, options: BooleanOptions = {}): OcShape {
    const { optimisation, simplify = false } = options;
    const progress = new this.oc.Message_ProgressRange_1();
    const cutOp = new this.oc.BRepAlgoAPI_Cut_3(shape, tool, progress);
    this._applyGlue(cutOp, optimisation);
    cutOp.Build(progress);
    if (simplify) cutOp.SimplifyResult(true, true, 1e-3);
    const result = cutOp.Shape();
    cutOp.delete();
    progress.delete();
    return result;
  }

  intersect(shape: OcShape, tool: OcShape, options: BooleanOptions = {}): OcShape {
    const { optimisation, simplify = false } = options;
    const progress = new this.oc.Message_ProgressRange_1();
    const commonOp = new this.oc.BRepAlgoAPI_Common_3(shape, tool, progress);
    this._applyGlue(commonOp, optimisation);
    commonOp.Build(progress);
    if (simplify) commonOp.SimplifyResult(true, true, 1e-3);
    const result = commonOp.Shape();
    commonOp.delete();
    progress.delete();
    return result;
  }

  fuseAll(shapes: OcShape[], options: BooleanOptions = {}): OcShape {
    if (shapes.length === 0) throw new Error('fuseAll requires at least one shape');
    if (shapes.length === 1) return shapes[0];

    const { strategy = 'native' } = options;
    if (strategy === 'pairwise') {
      return this._fuseAllPairwise(shapes, options);
    }

    // Prefer C++ BooleanBatch (single WASM call) when available
    if (this.oc.BooleanBatch) {
      return this._fuseAllBatch(shapes, options);
    }

    return this._fuseAllNative(shapes, options);
  }

  private _fuseAllBatch(shapes: OcShape[], options: BooleanOptions = {}): OcShape {
    const { optimisation, simplify = false } = options;
    const batch = new this.oc.BooleanBatch();
    for (const s of shapes) {
      batch.addShape(s);
    }
    const glueMode = optimisation === 'commonFace' ? 1 : optimisation === 'sameFace' ? 2 : 0;
    const result = batch.fuseAll(glueMode, simplify);
    batch.delete();
    return result;
  }

  private _fuseAllNative(shapes: OcShape[], options: BooleanOptions = {}): OcShape {
    const { optimisation, simplify = false } = options;

    // Use OCCT's native N-way general fuse via BRepAlgoAPI_BuilderAlgo.
    // This handles mutually-intersecting shapes correctly in a single pass.
    const argList = new this.oc.TopTools_ListOfShape_1();
    for (const s of shapes) {
      argList.Append_1(s);
    }

    const builder = new this.oc.BRepAlgoAPI_BuilderAlgo_1();
    builder.SetArguments(argList);
    this._applyGlue(builder, optimisation);

    const progress = new this.oc.Message_ProgressRange_1();
    builder.Build(progress);
    let result = builder.Shape();

    if (simplify) {
      const upgrader = new this.oc.ShapeUpgrade_UnifySameDomain_2(result, true, true, false);
      upgrader.Build();
      result = upgrader.Shape();
      upgrader.delete();
    }

    argList.delete();
    builder.delete();
    progress.delete();
    return result;
  }

  private _fuseAllPairwise(shapes: OcShape[], options: BooleanOptions = {}): OcShape {
    // Recursive pairwise fuse: divide-and-conquer using actual boolean fuse
    // at each level. Kept as escape hatch via { strategy: 'pairwise' }.
    // Defer simplification to the final fuse — intermediate simplification is wasted work.
    const mid = Math.ceil(shapes.length / 2);
    const left = this.fuseAll(shapes.slice(0, mid), {
      ...options,
      simplify: false,
      strategy: 'pairwise',
    });
    const right = this.fuseAll(shapes.slice(mid), {
      ...options,
      simplify: false,
      strategy: 'pairwise',
    });
    return this.fuse(left, right, options);
  }

  cutAll(shape: OcShape, tools: OcShape[], options: BooleanOptions = {}): OcShape {
    if (tools.length === 0) return shape;

    // Prefer C++ BooleanBatch (single WASM call) when available
    if (this.oc.BooleanBatch) {
      return this._cutAllBatch(shape, tools, options);
    }

    const toolCompound = this._buildCompound(tools);
    const result = this.cut(shape, toolCompound, options);
    toolCompound.delete();
    return result;
  }

  private _cutAllBatch(shape: OcShape, tools: OcShape[], options: BooleanOptions = {}): OcShape {
    const { optimisation, simplify = false } = options;
    const batch = new this.oc.BooleanBatch();
    for (const t of tools) {
      batch.addShape(t);
    }
    const glueMode = optimisation === 'commonFace' ? 1 : optimisation === 'sameFace' ? 2 : 0;
    const result = batch.cutAll(shape, glueMode, simplify);
    batch.delete();
    return result;
  }

  // --- Shape construction ---

  makeVertex(x: number, y: number, z: number): OcShape {
    const pnt = new this.oc.gp_Pnt_3(x, y, z);
    const maker = new this.oc.BRepBuilderAPI_MakeVertex(pnt);
    const vertex = maker.Vertex();
    maker.delete();
    pnt.delete();
    return vertex;
  }

  makeEdge(curve: OcType, start?: number, end?: number): OcShape {
    const maker =
      start !== undefined && end !== undefined
        ? new this.oc.BRepBuilderAPI_MakeEdge_24(curve, start, end)
        : new this.oc.BRepBuilderAPI_MakeEdge_24(curve);
    const edge = maker.Edge();
    maker.delete();
    return edge;
  }

  makeWire(edges: OcShape[]): OcShape {
    const wireBuilder = new this.oc.BRepBuilderAPI_MakeWire_1();
    for (const edge of edges) {
      wireBuilder.Add_1(edge);
    }
    const progress = new this.oc.Message_ProgressRange_1();
    wireBuilder.Build(progress);
    const wire = wireBuilder.Wire();
    wireBuilder.delete();
    progress.delete();
    return wire;
  }

  makeFace(wire: OcShape, planar = true): OcShape {
    if (planar) {
      const builder = new this.oc.BRepBuilderAPI_MakeFace_15(wire, false);
      const face = builder.Face();
      builder.delete();
      return face;
    }
    // Non-planar face — add wire edges to the filling builder
    const builder = new this.oc.BRepOffsetAPI_MakeFilling(
      3,
      15,
      2,
      false,
      1e-5,
      1e-4,
      1e-2,
      0.1,
      8,
      9
    );
    const edges = this.iterShapes(wire, 'edge');
    for (const edge of edges) {
      builder.Add_1(edge, this.oc.GeomAbs_Shape.GeomAbs_C0, true);
    }
    const progress = new this.oc.Message_ProgressRange_1();
    builder.Build(progress);
    const shape = builder.Shape();
    builder.delete();
    progress.delete();
    return shape;
  }

  makeBox(width: number, height: number, depth: number): OcShape {
    const maker = new this.oc.BRepPrimAPI_MakeBox_2(width, height, depth);
    const solid = maker.Solid();
    maker.delete();
    return solid;
  }

  makeCylinder(
    radius: number,
    height: number,
    center: [number, number, number] = [0, 0, 0],
    direction: [number, number, number] = [0, 0, 1]
  ): OcShape {
    const origin = new this.oc.gp_Pnt_3(...center);
    const dir = new this.oc.gp_Dir_4(...direction);
    const axis = new this.oc.gp_Ax2_3(origin, dir);
    const maker = new this.oc.BRepPrimAPI_MakeCylinder_3(axis, radius, height);
    const solid = maker.Shape();
    maker.delete();
    axis.delete();
    origin.delete();
    dir.delete();
    return solid;
  }

  makeSphere(radius: number, center: [number, number, number] = [0, 0, 0]): OcShape {
    const origin = new this.oc.gp_Pnt_3(...center);
    const maker = new this.oc.BRepPrimAPI_MakeSphere_2(origin, radius);
    const solid = maker.Shape();
    maker.delete();
    origin.delete();
    return solid;
  }

  // --- Extrusion / sweep / loft / revolution ---

  extrude(face: OcShape, direction: [number, number, number], length: number): OcShape {
    const vec = new this.oc.gp_Vec_4(
      direction[0] * length,
      direction[1] * length,
      direction[2] * length
    );
    const maker = new this.oc.BRepPrimAPI_MakePrism_1(face, vec, false, true);
    const result = maker.Shape();
    maker.delete();
    vec.delete();
    return result;
  }

  revolve(shape: OcShape, axis: OcType, angle: number): OcShape {
    const maker = new this.oc.BRepPrimAPI_MakeRevol_1(shape, axis, angle, false);
    const result = maker.Shape();
    maker.delete();
    return result;
  }

  loft(wires: OcShape[], ruled = false, startShape?: OcShape, endShape?: OcShape): OcShape {
    const loftBuilder = new this.oc.BRepOffsetAPI_ThruSections(true, ruled, 1e-6);
    if (startShape) loftBuilder.AddVertex(startShape);
    for (const wire of wires) {
      loftBuilder.AddWire(wire);
    }
    if (endShape) loftBuilder.AddVertex(endShape);
    const progress = new this.oc.Message_ProgressRange_1();
    loftBuilder.Build(progress);
    const result = loftBuilder.Shape();
    loftBuilder.delete();
    progress.delete();
    return result;
  }

  sweep(wire: OcShape, spine: OcShape, options: { transitionMode?: number } = {}): OcShape {
    const { transitionMode } = options;
    const sweepBuilder = new this.oc.BRepOffsetAPI_MakePipeShell(spine);
    if (transitionMode !== undefined) {
      sweepBuilder.SetTransitionMode(transitionMode);
    }
    sweepBuilder.Add_1(wire, false, false);
    const progress = new this.oc.Message_ProgressRange_1();
    sweepBuilder.Build(progress);
    progress.delete();
    sweepBuilder.MakeSolid();
    const result = sweepBuilder.Shape();
    sweepBuilder.delete();
    return result;
  }

  // --- Modification ---

  fillet(shape: OcShape, edges: OcShape[], radius: number | ((edge: OcShape) => number)): OcShape {
    const builder = new this.oc.BRepFilletAPI_MakeFillet(
      shape,
      this.oc.ChFi3d_FilletShape.ChFi3d_Rational
    );
    for (const edge of edges) {
      const r = typeof radius === 'function' ? radius(edge) : radius;
      if (r > 0) builder.Add_2(r, edge);
    }
    const result = builder.Shape();
    builder.delete();
    return result;
  }

  chamfer(
    shape: OcShape,
    edges: OcShape[],
    distance: number | ((edge: OcShape) => number)
  ): OcShape {
    const builder = new this.oc.BRepFilletAPI_MakeChamfer(shape);
    for (const edge of edges) {
      const d = typeof distance === 'function' ? distance(edge) : distance;
      if (d > 0) builder.Add_2(d, edge);
    }
    const result = builder.Shape();
    builder.delete();
    return result;
  }

  shell(shape: OcShape, faces: OcShape[], thickness: number, tolerance = 1e-3): OcShape {
    const facesToRemove = new this.oc.TopTools_ListOfShape_1();
    for (const face of faces) {
      facesToRemove.Append_1(face);
    }
    const progress = new this.oc.Message_ProgressRange_1();
    const builder = new this.oc.BRepOffsetAPI_MakeThickSolid();
    builder.MakeThickSolidByJoin(
      shape,
      facesToRemove,
      -thickness,
      tolerance,
      this.oc.BRepOffset_Mode.BRepOffset_Skin,
      false,
      false,
      this.oc.GeomAbs_JoinType.GeomAbs_Arc,
      false,
      progress
    );
    const result = builder.Shape();
    builder.delete();
    facesToRemove.delete();
    progress.delete();
    return result;
  }

  offset(shape: OcShape, distance: number, tolerance = 1e-6): OcShape {
    const progress = new this.oc.Message_ProgressRange_1();
    const builder = new this.oc.BRepOffsetAPI_MakeOffsetShape();
    builder.PerformByJoin(
      shape,
      distance,
      tolerance,
      this.oc.BRepOffset_Mode.BRepOffset_Skin,
      false,
      false,
      this.oc.GeomAbs_JoinType.GeomAbs_Arc,
      false,
      progress
    );
    const result = builder.Shape();
    builder.delete();
    progress.delete();
    return result;
  }

  // --- Transforms ---

  transform(shape: OcShape, trsf: OcType): OcShape {
    const transformer = new this.oc.BRepBuilderAPI_Transform_2(shape, trsf, true);
    const result = transformer.ModifiedShape(shape);
    transformer.delete();
    return result;
  }

  translate(shape: OcShape, x: number, y: number, z: number): OcShape {
    const trsf = new this.oc.gp_Trsf_1();
    const vec = new this.oc.gp_Vec_4(x, y, z);
    trsf.SetTranslation_1(vec);
    const result = this.transform(shape, trsf);
    trsf.delete();
    vec.delete();
    return result;
  }

  rotate(
    shape: OcShape,
    angle: number,
    axis: [number, number, number] = [0, 0, 1],
    center: [number, number, number] = [0, 0, 0]
  ): OcShape {
    const trsf = new this.oc.gp_Trsf_1();
    const origin = new this.oc.gp_Pnt_3(...center);
    const dir = new this.oc.gp_Dir_4(...axis);
    const ax1 = new this.oc.gp_Ax1_2(origin, dir);
    trsf.SetRotation_1(ax1, (angle * Math.PI) / 180);
    const result = this.transform(shape, trsf);
    trsf.delete();
    ax1.delete();
    origin.delete();
    dir.delete();
    return result;
  }

  mirror(
    shape: OcShape,
    origin: [number, number, number],
    normal: [number, number, number]
  ): OcShape {
    const trsf = new this.oc.gp_Trsf_1();
    const pnt = new this.oc.gp_Pnt_3(...origin);
    const dir = new this.oc.gp_Dir_4(...normal);
    const ax2 = new this.oc.gp_Ax2_3(pnt, dir);
    trsf.SetMirror_3(ax2);
    const result = this.transform(shape, trsf);
    trsf.delete();
    ax2.delete();
    pnt.delete();
    dir.delete();
    return result;
  }

  scale(shape: OcShape, center: [number, number, number], factor: number): OcShape {
    const trsf = new this.oc.gp_Trsf_1();
    const pnt = new this.oc.gp_Pnt_3(...center);
    trsf.SetScale(pnt, factor);
    const result = this.transform(shape, trsf);
    trsf.delete();
    pnt.delete();
    return result;
  }

  // --- Meshing ---

  mesh(shape: OcShape, options: MeshOptions): KernelMeshResult {
    // Use C++ bulk extraction when available, fall back to JS-side extraction
    if (this.oc.MeshExtractor) {
      return this._meshBulk(shape, options);
    }
    return this._meshJS(shape, options);
  }

  private _meshBulk(shape: OcShape, options: MeshOptions): KernelMeshResult {
    // Single WASM call: mesh + extract all data in C++
    const raw = this.oc.MeshExtractor.extract(
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
    const vertices = this.oc.HEAPF32.slice(verticesPtr, verticesPtr + verticesSize) as Float32Array;

    let normals: Float32Array;
    if (options.skipNormals || normalsSize === 0) {
      normals = new Float32Array(0);
    } else {
      const normalsPtr = (raw.getNormalsPtr() as number) / 4;
      normals = this.oc.HEAPF32.slice(normalsPtr, normalsPtr + normalsSize) as Float32Array;
    }

    const trianglesPtr = (raw.getTrianglesPtr() as number) / 4;
    const triangles = this.oc.HEAPU32.slice(
      trianglesPtr,
      trianglesPtr + trianglesSize
    ) as Uint32Array;

    // Parse face groups from packed [start, count, faceHash, ...] triples
    const faceGroups: KernelMeshResult['faceGroups'] = [];
    if (faceGroupsSize > 0) {
      const fgPtr = (raw.getFaceGroupsPtr() as number) / 4;
      const fgRaw = this.oc.HEAP32.slice(fgPtr, fgPtr + faceGroupsSize) as Int32Array;
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

    return { vertices, normals, triangles, faceGroups };
  }

  private _meshJS(shape: OcShape, options: MeshOptions): KernelMeshResult {
    const mesher = new this.oc.BRepMesh_IncrementalMesh_2(
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

    const explorer = new this.oc.TopExp_Explorer_2(
      shape,
      this.oc.TopAbs_ShapeEnum.TopAbs_FACE,
      this.oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    while (explorer.More()) {
      const face = this.oc.TopoDS.Face_1(explorer.Current());
      const loc = new this.oc.TopLoc_Location_1();
      const tri = this.oc.BRep_Tool.Triangulation(face, loc, 0);
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
    const triangles = new Uint32Array(totalTris * 3);
    const faceGroups: KernelMeshResult['faceGroups'] = [];

    let vIdx = 0;
    let nIdx = 0;
    let tIdx = 0;

    explorer.Init(
      shape,
      this.oc.TopAbs_ShapeEnum.TopAbs_FACE,
      this.oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    while (explorer.More()) {
      const face = this.oc.TopoDS.Face_1(explorer.Current());
      const location = new this.oc.TopLoc_Location_1();
      const triangulation = this.oc.BRep_Tool.Triangulation(face, location, 0);

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
          const normalsArray = new this.oc.TColgp_Array1OfDir_2(1, nbNodes);
          const pc = new this.oc.Poly_Connect_2(triangulation);
          this.oc.StdPrs_ToolTriangulatedShape.Normal(face, pc, normalsArray);
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

        const orient = face.Orientation_1();
        const isForward = orient === this.oc.TopAbs_Orientation.TopAbs_FORWARD;
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

    return { vertices, normals, triangles, faceGroups };
  }

  meshEdges(shape: OcShape, tolerance: number, angularTolerance: number): KernelEdgeMeshResult {
    if (this.oc.EdgeMeshExtractor) {
      return this._meshEdgesBulk(shape, tolerance, angularTolerance);
    }
    return this._meshEdgesJS(shape, tolerance, angularTolerance);
  }

  private _meshEdgesBulk(
    shape: OcShape,
    tolerance: number,
    angularTolerance: number
  ): KernelEdgeMeshResult {
    const raw = this.oc.EdgeMeshExtractor.extract(shape, tolerance, angularTolerance);

    const linesSize = raw.getLinesSize() as number;
    const edgeGroupsSize = raw.getEdgeGroupsSize() as number;

    let lines: Float32Array;
    if (linesSize > 0) {
      const linesPtr = (raw.getLinesPtr() as number) / 4;
      lines = this.oc.HEAPF32.slice(linesPtr, linesPtr + linesSize) as Float32Array;
    } else {
      lines = new Float32Array(0);
    }

    const edgeGroups: KernelEdgeMeshResult['edgeGroups'] = [];
    if (edgeGroupsSize > 0) {
      const egPtr = (raw.getEdgeGroupsPtr() as number) / 4;
      const egRaw = this.oc.HEAP32.slice(egPtr, egPtr + edgeGroupsSize) as Int32Array;
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

  private _meshEdgesJS(
    shape: OcShape,
    tolerance: number,
    angularTolerance: number
  ): KernelEdgeMeshResult {
    // Ensure triangulation exists
    const mesher = new this.oc.BRepMesh_IncrementalMesh_2(
      shape,
      tolerance,
      false,
      angularTolerance,
      false
    );
    mesher.delete();

    const lines: number[] = [];
    const edgeGroups: KernelEdgeMeshResult['edgeGroups'] = [];
    const seenHashes = new Set<number>();

    // Pass 1: edges from face triangulations
    const faceExplorer = new this.oc.TopExp_Explorer_2(
      shape,
      this.oc.TopAbs_ShapeEnum.TopAbs_FACE,
      this.oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    while (faceExplorer.More()) {
      const face = this.oc.TopoDS.Face_1(faceExplorer.Current());
      const faceLoc = new this.oc.TopLoc_Location_1();
      const tri = this.oc.BRep_Tool.Triangulation(face, faceLoc, 0);

      if (!tri.IsNull()) {
        const triObj = tri.get();
        const edgeExplorer = new this.oc.TopExp_Explorer_2(
          face,
          this.oc.TopAbs_ShapeEnum.TopAbs_EDGE,
          this.oc.TopAbs_ShapeEnum.TopAbs_SHAPE
        );
        while (edgeExplorer.More()) {
          const edgeShape = edgeExplorer.Current();
          const edge = this.oc.TopoDS.Edge_1(edgeShape);
          const edgeHash = edge.HashCode(HASH_CODE_MAX);
          if (!seenHashes.has(edgeHash)) {
            seenHashes.add(edgeHash);
            const edgeLoc = new this.oc.TopLoc_Location_1();
            const polygon = this.oc.BRep_Tool.PolygonOnTriangulation_1(edge, tri, edgeLoc);
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
    const edgeExplorer = new this.oc.TopExp_Explorer_2(
      shape,
      this.oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      this.oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    while (edgeExplorer.More()) {
      const edgeShape = edgeExplorer.Current();
      const edge = this.oc.TopoDS.Edge_1(edgeShape);
      const edgeHash = edge.HashCode(HASH_CODE_MAX);
      if (!seenHashes.has(edgeHash)) {
        seenHashes.add(edgeHash);
        const adaptor = new this.oc.BRepAdaptor_Curve_2(edge);
        const tangDef = new this.oc.GCPnts_TangentialDeflection_2(
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

  // --- File I/O ---

  exportSTEP(shapes: OcShape[]): string {
    const writer = new this.oc.STEPControl_Writer_1();
    this.oc.Interface_Static.SetIVal('write.step.schema', 5);
    writer.Model(true).delete();
    const progress = new this.oc.Message_ProgressRange_1();

    for (const shape of shapes) {
      writer.Transfer(shape, this.oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress);
    }

    const filename = uniqueIOFilename('_export', 'step');
    const done = writer.Write(filename);
    writer.delete();
    progress.delete();

    if (done === this.oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      const file = this.oc.FS.readFile('/' + filename);
      this.oc.FS.unlink('/' + filename);
      return new TextDecoder().decode(file);
    }
    throw new Error('STEP export failed: writer did not complete successfully');
  }

  exportSTL(shape: OcShape, binary = false): string | ArrayBuffer {
    const filename = uniqueIOFilename('_export', 'stl');
    const done = this.oc.StlAPI.Write(shape, filename, !binary);

    if (done) {
      const file = this.oc.FS.readFile('/' + filename);
      this.oc.FS.unlink('/' + filename);
      if (binary) return file.buffer as ArrayBuffer;
      return new TextDecoder().decode(file);
    }
    throw new Error('STL export failed: StlAPI.Write returned false');
  }

  importSTEP(data: string | ArrayBuffer): OcShape[] {
    const filename = uniqueIOFilename('_import', 'step');
    const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    this.oc.FS.writeFile('/' + filename, buffer);

    const reader = new this.oc.STEPControl_Reader_1();
    if (reader.ReadFile(filename)) {
      this.oc.FS.unlink('/' + filename);
      const progress = new this.oc.Message_ProgressRange_1();
      reader.TransferRoots(progress);
      progress.delete();
      const shape = reader.OneShape();
      reader.delete();
      return [shape];
    }
    this.oc.FS.unlink('/' + filename);
    reader.delete();
    throw new Error('Failed to import STEP file: reader could not parse the input data');
  }

  importSTL(data: string | ArrayBuffer): OcShape {
    const filename = uniqueIOFilename('_import', 'stl');
    const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    this.oc.FS.writeFile('/' + filename, buffer);

    const reader = new this.oc.StlAPI_Reader();
    const readShape = new this.oc.TopoDS_Shell();

    if (reader.Read(readShape, filename)) {
      this.oc.FS.unlink('/' + filename);
      const upgrader = new this.oc.ShapeUpgrade_UnifySameDomain_2(readShape, true, true, false);
      upgrader.Build();
      const upgraded = upgrader.Shape();
      const solidBuilder = new this.oc.BRepBuilderAPI_MakeSolid_1();
      solidBuilder.Add(this.oc.TopoDS.Shell_1(upgraded));
      const solid = solidBuilder.Solid();
      readShape.delete();
      upgrader.delete();
      solidBuilder.delete();
      reader.delete();
      return solid;
    }
    this.oc.FS.unlink('/' + filename);
    readShape.delete();
    reader.delete();
    throw new Error('Failed to import STL file: reader could not parse the input data');
  }

  // --- Measurement ---

  volume(shape: OcShape): number {
    const props = new this.oc.GProp_GProps_1();
    this.oc.BRepGProp.VolumeProperties_1(shape, props, true, false, false);
    const vol = props.Mass();
    props.delete();
    return vol;
  }

  area(shape: OcShape): number {
    const props = new this.oc.GProp_GProps_1();
    this.oc.BRepGProp.SurfaceProperties_2(shape, props, 1e-7, true);
    const a = props.Mass();
    props.delete();
    return a;
  }

  length(shape: OcShape): number {
    const props = new this.oc.GProp_GProps_1();
    this.oc.BRepGProp.LinearProperties(shape, props, true, false);
    const len = props.Mass();
    props.delete();
    return len;
  }

  centerOfMass(shape: OcShape): [number, number, number] {
    const props = new this.oc.GProp_GProps_1();
    this.oc.BRepGProp.VolumeProperties_1(shape, props, true, false, false);
    const center = props.CentreOfMass();
    const result: [number, number, number] = [center.X(), center.Y(), center.Z()];
    center.delete();
    props.delete();
    return result;
  }

  boundingBox(shape: OcShape): {
    min: [number, number, number];
    max: [number, number, number];
  } {
    const box = new this.oc.Bnd_Box_1();
    this.oc.BRepBndLib.Add(shape, box, true);
    const xMin = { current: 0 };
    const yMin = { current: 0 };
    const zMin = { current: 0 };
    const xMax = { current: 0 };
    const yMax = { current: 0 };
    const zMax = { current: 0 };
    box.Get(xMin, yMin, zMin, xMax, yMax, zMax);
    box.delete();
    return {
      min: [xMin.current, yMin.current, zMin.current],
      max: [xMax.current, yMax.current, zMax.current],
    };
  }

  // --- Topology iteration ---

  iterShapes(shape: OcShape, type: ShapeType): OcShape[] {
    if (this.oc.TopologyExtractor) {
      return this._iterShapesBulk(shape, type);
    }
    return this._iterShapesJS(shape, type);
  }

  private _iterShapesBulk(shape: OcShape, type: ShapeType): OcShape[] {
    const typeEnumMap: Record<ShapeType, number> = {
      vertex: 7,
      edge: 6,
      wire: 5,
      face: 4,
      shell: 3,
      solid: 2,
      compsolid: 1,
      compound: 0,
    };

    const raw = this.oc.TopologyExtractor.extract(shape, typeEnumMap[type]);
    const count = raw.getShapesCount() as number;
    const result: OcShape[] = [];
    for (let i = 0; i < count; i++) {
      result.push(raw.getShape(i));
    }
    raw.delete();
    return result;
  }

  private _iterShapesJS(shape: OcShape, type: ShapeType): OcShape[] {
    const typeMap: Record<ShapeType, unknown> = {
      vertex: this.oc.TopAbs_ShapeEnum.TopAbs_VERTEX,
      edge: this.oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      wire: this.oc.TopAbs_ShapeEnum.TopAbs_WIRE,
      face: this.oc.TopAbs_ShapeEnum.TopAbs_FACE,
      shell: this.oc.TopAbs_ShapeEnum.TopAbs_SHELL,
      solid: this.oc.TopAbs_ShapeEnum.TopAbs_SOLID,
      compsolid: this.oc.TopAbs_ShapeEnum.TopAbs_COMPSOLID,
      compound: this.oc.TopAbs_ShapeEnum.TopAbs_COMPOUND,
    };

    const explorer = new this.oc.TopExp_Explorer_2(
      shape,
      typeMap[type],
      this.oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    const result: OcShape[] = [];
    const seen = new Map<number, OcShape[]>();
    while (explorer.More()) {
      const item = explorer.Current();
      const hash = item.HashCode(HASH_CODE_MAX);
      const bucket = seen.get(hash);
      if (!bucket) {
        seen.set(hash, [item]);
        result.push(item);
      } else if (!bucket.some((s) => s.IsSame(item))) {
        bucket.push(item);
        result.push(item);
      }
      explorer.Next();
    }
    explorer.delete();
    return result;
  }

  private _shapeTypeMap: Map<unknown, ShapeType> | null = null;

  private _getShapeTypeMap(): Map<unknown, ShapeType> {
    if (!this._shapeTypeMap) {
      const ta = this.oc.TopAbs_ShapeEnum;
      this._shapeTypeMap = new Map<unknown, ShapeType>([
        [ta.TopAbs_VERTEX, 'vertex'],
        [ta.TopAbs_EDGE, 'edge'],
        [ta.TopAbs_WIRE, 'wire'],
        [ta.TopAbs_FACE, 'face'],
        [ta.TopAbs_SHELL, 'shell'],
        [ta.TopAbs_SOLID, 'solid'],
        [ta.TopAbs_COMPSOLID, 'compsolid'],
        [ta.TopAbs_COMPOUND, 'compound'],
      ]);
    }
    return this._shapeTypeMap;
  }

  shapeType(shape: OcShape): ShapeType {
    if (shape.IsNull()) throw new Error('Cannot determine shape type: shape is null');
    const result = this._getShapeTypeMap().get(shape.ShapeType());
    if (!result) throw new Error(`Unknown shape type enum value: ${shape.ShapeType()}`);
    return result;
  }

  isSame(a: OcShape, b: OcShape): boolean {
    return a.IsSame(b);
  }

  isEqual(a: OcShape, b: OcShape): boolean {
    return a.IsEqual(b);
  }

  // --- Simplification ---

  simplify(shape: OcShape): OcShape {
    const upgrader = new this.oc.ShapeUpgrade_UnifySameDomain_2(shape, true, true, false);
    upgrader.Build();
    const result = upgrader.Shape();
    upgrader.delete();
    return result;
  }

  // --- Private helpers ---

  private _buildCompound(shapes: OcShape[]): OcShape {
    const builder = new this.oc.TopoDS_Builder();
    const compound = new this.oc.TopoDS_Compound();
    builder.MakeCompound(compound);
    for (const s of shapes) {
      builder.Add(compound, s);
    }
    builder.delete();
    return compound;
  }

  private _applyGlue(op: { SetGlue(glue: unknown): void }, optimisation?: string): void {
    if (optimisation === 'commonFace') {
      op.SetGlue(this.oc.BOPAlgo_GlueEnum.BOPAlgo_GlueShift);
    }
    if (optimisation === 'sameFace') {
      op.SetGlue(this.oc.BOPAlgo_GlueEnum.BOPAlgo_GlueFull);
    }
  }
}
