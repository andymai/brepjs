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
import {
  exportSTEP as _exportSTEP,
  exportSTL as _exportSTL,
  importSTEP as _importSTEP,
  importSTL as _importSTL,
} from './ioOps.js';
import {
  volume as _volume,
  area as _area,
  length as _length,
  centerOfMass as _centerOfMass,
  boundingBox as _boundingBox,
  HASH_CODE_MAX,
} from './measureOps.js';
import {
  transform as _transform,
  translate as _translate,
  rotate as _rotate,
  mirror as _mirror,
  scale as _scale,
  simplify as _simplify,
} from './transformOps.js';
import {
  fuse as _fuse,
  cut as _cut,
  intersect as _intersect,
  fuseAll as _fuseAll,
  cutAll as _cutAll,
  buildCompound as _buildCompound,
  applyGlue as _applyGlue,
} from './booleanOps.js';
import { mesh as _mesh, meshEdges as _meshEdges } from './meshOps.js';

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

  // --- Boolean operations (delegates to booleanOps.ts) ---

  fuse(shape: OcShape, tool: OcShape, options: BooleanOptions = {}): OcShape {
    return _fuse(this.oc, shape, tool, options);
  }

  cut(shape: OcShape, tool: OcShape, options: BooleanOptions = {}): OcShape {
    return _cut(this.oc, shape, tool, options);
  }

  intersect(shape: OcShape, tool: OcShape, options: BooleanOptions = {}): OcShape {
    return _intersect(this.oc, shape, tool, options);
  }

  fuseAll(shapes: OcShape[], options: BooleanOptions = {}): OcShape {
    return _fuseAll(this.oc, shapes, options);
  }

  cutAll(shape: OcShape, tools: OcShape[], options: BooleanOptions = {}): OcShape {
    return _cutAll(this.oc, shape, tools, options);
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

  // --- Transforms (delegates to transformOps.ts) ---

  transform(shape: OcShape, trsf: OcType): OcShape {
    return _transform(this.oc, shape, trsf);
  }

  translate(shape: OcShape, x: number, y: number, z: number): OcShape {
    return _translate(this.oc, shape, x, y, z);
  }

  rotate(
    shape: OcShape,
    angle: number,
    axis: [number, number, number] = [0, 0, 1],
    center: [number, number, number] = [0, 0, 0]
  ): OcShape {
    return _rotate(this.oc, shape, angle, axis, center);
  }

  mirror(
    shape: OcShape,
    origin: [number, number, number],
    normal: [number, number, number]
  ): OcShape {
    return _mirror(this.oc, shape, origin, normal);
  }

  scale(shape: OcShape, center: [number, number, number], factor: number): OcShape {
    return _scale(this.oc, shape, center, factor);
  }

  // --- Meshing (delegates to meshOps.ts) ---

  mesh(shape: OcShape, options: MeshOptions): KernelMeshResult {
    return _mesh(this.oc, shape, options);
  }

  meshEdges(shape: OcShape, tolerance: number, angularTolerance: number): KernelEdgeMeshResult {
    return _meshEdges(this.oc, shape, tolerance, angularTolerance);
  }

  // --- File I/O (delegates to ioOps.ts) ---

  exportSTEP(shapes: OcShape[]): string {
    return _exportSTEP(this.oc, shapes);
  }

  exportSTL(shape: OcShape, binary = false): string | ArrayBuffer {
    return _exportSTL(this.oc, shape, binary);
  }

  importSTEP(data: string | ArrayBuffer): OcShape[] {
    return _importSTEP(this.oc, data);
  }

  importSTL(data: string | ArrayBuffer): OcShape {
    return _importSTL(this.oc, data);
  }

  // --- Measurement (delegates to measureOps.ts) ---

  volume(shape: OcShape): number {
    return _volume(this.oc, shape);
  }

  area(shape: OcShape): number {
    return _area(this.oc, shape);
  }

  length(shape: OcShape): number {
    return _length(this.oc, shape);
  }

  centerOfMass(shape: OcShape): [number, number, number] {
    return _centerOfMass(this.oc, shape);
  }

  boundingBox(shape: OcShape): {
    min: [number, number, number];
    max: [number, number, number];
  } {
    return _boundingBox(this.oc, shape);
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
    return _simplify(this.oc, shape);
  }

  // --- Private helpers ---
}
