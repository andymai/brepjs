import type {
  KernelAdapter,
  OpenCascadeInstance,
  OcShape,
  OcType,
  BooleanOptions,
  ShapeType,
  MeshOptions,
} from './types.js';

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
    const { optimisation, simplify = true } = options;
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
    const { optimisation, simplify = true } = options;
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
    const { simplify = true } = options;
    const progress = new this.oc.Message_ProgressRange_1();
    const commonOp = new this.oc.BRepAlgoAPI_Common_3(shape, tool, progress);
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

    const mid = Math.ceil(shapes.length / 2);
    const left = this._buildCompound(shapes.slice(0, mid));
    const right = this._buildCompound(shapes.slice(mid));
    return this.fuse(left, right, options);
  }

  cutAll(shape: OcShape, tools: OcShape[], options: BooleanOptions = {}): OcShape {
    if (tools.length === 0) return shape;
    const toolCompound = this._buildCompound(tools);
    return this.cut(shape, toolCompound, options);
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
    if (start !== undefined && end !== undefined) {
      return new this.oc.BRepBuilderAPI_MakeEdge_24(curve, start, end).Edge();
    }
    return new this.oc.BRepBuilderAPI_MakeEdge_24(curve).Edge();
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
    // Non-planar face
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
    loftBuilder.Build(new this.oc.Message_ProgressRange_1());
    const result = loftBuilder.Shape();
    loftBuilder.delete();
    return result;
  }

  sweep(wire: OcShape, spine: OcShape, options: { transitionMode?: number } = {}): OcShape {
    const { transitionMode } = options;
    const sweepBuilder = new this.oc.BRepOffsetAPI_MakePipeShell(spine);
    if (transitionMode !== undefined) {
      sweepBuilder.SetTransitionMode(transitionMode);
    }
    sweepBuilder.Add_1(wire, false, false);
    sweepBuilder.Build(new this.oc.Message_ProgressRange_1());
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

  mesh(
    shape: OcShape,
    options: MeshOptions
  ): {
    vertices: Float32Array;
    normals: Float32Array;
    triangles: Uint32Array;
    faceGroups: Array<{ start: number; count: number }>;
  } {
    new this.oc.BRepMesh_IncrementalMesh_2(
      shape,
      options.tolerance,
      false,
      options.angularTolerance,
      false
    );

    const vertices: number[] = [];
    const normals: number[] = [];
    const triangles: number[] = [];
    const faceGroups: Array<{ start: number; count: number }> = [];

    const explorer = new this.oc.TopExp_Explorer_2(
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
        const vertexOffset = vertices.length / 3;
        const triStart = triangles.length;

        for (let i = 1; i <= nbNodes; i++) {
          const p = tri.Node(i).Transformed(transformation);
          vertices.push(p.X(), p.Y(), p.Z());
          p.delete();
        }

        if (!options.skipNormals) {
          const normalsArray = new this.oc.TColgp_Array1OfDir_2(1, nbNodes);
          const pc = new this.oc.Poly_Connect_2(triangulation);
          this.oc.StdPrs_ToolTriangulatedShape.Normal(face, pc, normalsArray);
          for (let i = normalsArray.Lower(); i <= normalsArray.Upper(); i++) {
            const d = normalsArray.Value(i).Transformed(transformation);
            normals.push(d.X(), d.Y(), d.Z());
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
          triangles.push(n1 - 1 + vertexOffset, n2 - 1 + vertexOffset, n3 - 1 + vertexOffset);
          t.delete();
        }

        faceGroups.push({ start: triStart, count: triangles.length - triStart });
        transformation.delete();
      }

      location.delete();
      triangulation.delete();
      explorer.Next();
    }
    explorer.delete();

    return {
      vertices: new Float32Array(vertices),
      normals: new Float32Array(normals),
      triangles: new Uint32Array(triangles),
      faceGroups,
    };
  }

  meshEdges(shape: OcShape, tolerance = 1e-3): Float32Array[] {
    const edgeLines: Float32Array[] = [];
    const explorer = new this.oc.TopExp_Explorer_2(
      shape,
      this.oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      this.oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    while (explorer.More()) {
      const edge = explorer.Current();
      const adaptor = new this.oc.BRepAdaptor_Curve_2(edge);
      const tangDef = new this.oc.GCPnts_TangentialDeflection_2(
        adaptor,
        tolerance,
        0.1,
        2,
        1e-9,
        1e-7
      );

      const points: number[] = [];
      for (let j = 1; j <= tangDef.NbPoints(); j++) {
        const p = tangDef.Value(j);
        points.push(p.X(), p.Y(), p.Z());
        p.delete();
      }
      edgeLines.push(new Float32Array(points));

      tangDef.delete();
      adaptor.delete();
      explorer.Next();
    }
    explorer.delete();
    return edgeLines;
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

    const filename = '_export.step';
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
    const filename = '_export.stl';
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
    const filename = '_import.step';
    const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    this.oc.FS.writeFile('/' + filename, buffer);

    const reader = new this.oc.STEPControl_Reader_1();
    if (reader.ReadFile(filename)) {
      this.oc.FS.unlink('/' + filename);
      reader.TransferRoots(new this.oc.Message_ProgressRange_1());
      const shape = reader.OneShape();
      reader.delete();
      return [shape];
    }
    this.oc.FS.unlink('/' + filename);
    reader.delete();
    throw new Error('Failed to import STEP file: reader could not parse the input data');
  }

  importSTL(data: string | ArrayBuffer): OcShape {
    const filename = '_import.stl';
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
      upgrader.delete();
      solidBuilder.delete();
      reader.delete();
      return solid;
    }
    this.oc.FS.unlink('/' + filename);
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
    const hashes = new Set<number>();
    while (explorer.More()) {
      const item = explorer.Current();
      const hash = item.HashCode(2147483647);
      if (!hashes.has(hash)) {
        hashes.add(hash);
        result.push(item);
      }
      explorer.Next();
    }
    explorer.delete();
    return result;
  }

  shapeType(shape: OcShape): ShapeType {
    if (shape.IsNull()) throw new Error('Cannot determine shape type: shape is null');
    const ta = this.oc.TopAbs_ShapeEnum;
    const st = shape.ShapeType();
    const map = new Map<unknown, ShapeType>([
      [ta.TopAbs_VERTEX, 'vertex'],
      [ta.TopAbs_EDGE, 'edge'],
      [ta.TopAbs_WIRE, 'wire'],
      [ta.TopAbs_FACE, 'face'],
      [ta.TopAbs_SHELL, 'shell'],
      [ta.TopAbs_SOLID, 'solid'],
      [ta.TopAbs_COMPSOLID, 'compsolid'],
      [ta.TopAbs_COMPOUND, 'compound'],
    ]);
    const result = map.get(st);
    if (!result) throw new Error(`Unknown shape type enum value: ${st}`);
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
