import type { OcShape, OcType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import { WrappingObj, GCWithScope, type Deletable } from '../core/memory.js';
import { meshShapeEdges as _meshShapeEdges } from './meshFns.js';
import {
  Vector,
  asPnt,
  type Point,
  type Plane,
  type PlaneName,
  BoundingBox,
} from '../core/geometry.js';
import { DEG2RAD, HASH_CODE_MAX } from '../core/constants.js';
import { rotate, translate, mirror, scale as scaleShape } from '../core/geometryHelpers.js';
import { findCurveType, type CurveType } from '../core/definitionMaps.js';
import { cast, downcast, iterTopo, type TopoEntity } from './cast.js';
import type { EdgeFinder, FaceFinder } from '../query/index.js';
import { bug, typeCastError, validationError, ioError } from '../core/errors.js';
import { type Result, ok, err, isErr, unwrap, andThen } from '../core/result.js';

export type { CurveType };

// ---------------------------------------------------------------------------
// Lazy query module loader — avoids hard compile-time dependency on query/
// while still allowing runtime access to EdgeFinder / FaceFinder constructors.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lazy-loaded module type
let _queryModule: any = null;

function getQueryModule(): { EdgeFinder: new () => EdgeFinder; FaceFinder: new () => FaceFinder } {
  if (!_queryModule) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lazy runtime load of optional peer module
    _queryModule = (globalThis as any).__brepjs_query_module__;
    if (!_queryModule) {
      bug(
        'shapes',
        'Query module not registered. Call registerQueryModule() or import query/index.js before using shell/fillet/chamfer.'
      );
    }
  }
  return _queryModule;
}

/**
 * Register the query module so that shell/fillet/chamfer can construct
 * EdgeFinder and FaceFinder at runtime without a hard import.
 */
export function registerQueryModule(mod: {
  EdgeFinder: new () => EdgeFinder;
  FaceFinder: new () => FaceFinder;
}): void {
  _queryModule = mod;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- global registration
  (globalThis as any).__brepjs_query_module__ = mod;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AnyShape = Vertex | Edge | Wire | Face | Shell | Solid | CompSolid | Compound;

export type Shape3D = Shell | Solid | CompSolid | Compound;

export interface CurveLike {
  delete(): void;
  Value(v: number): OcType;
  IsPeriodic(): boolean;
  Period(): number;
  IsClosed(): boolean;
  FirstParameter(): number;
  LastParameter(): number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT enum return type
  GetType?(): any;
  D1(v: number, p: OcType, vPrime: OcType): void;
}

/**
 * A chamfer radius specification.
 *
 * - A number for symmetric chamfer.
 * - Two distances for asymmetric chamfer (first distance for the selected face).
 * - A distance and angle for asymmetric chamfer.
 */
export type ChamferRadius =
  | number
  | {
      distances: [number, number];
      selectedFace: (f: FaceFinder) => FaceFinder;
    }
  | {
      distance: number;
      angle: number;
      selectedFace: (f: FaceFinder) => FaceFinder;
    };

export type FilletRadius = number | [number, number];

export function isNumber(r: unknown): r is number {
  return typeof r === 'number';
}

export function isChamferRadius(r: unknown): r is ChamferRadius {
  if (typeof r === 'number') return true;
  if (typeof r === 'object' && r !== null) {
    const obj = r as Record<string, unknown>;
    return (
      ('distances' in obj && Array.isArray(obj['distances']) && 'selectedFace' in obj) ||
      ('distance' in obj && 'angle' in obj && 'selectedFace' in obj)
    );
  }
  return false;
}

export function isFilletRadius(r: unknown): r is FilletRadius {
  if (typeof r === 'number') return true;
  if (Array.isArray(r) && r.length === 2) {
    return r.every(isNumber);
  }
  return false;
}

/**
 * A generic way to define radii for fillet or chamfer operations.
 */
export type RadiusConfig<R = number> =
  | ((e: Edge) => R | null)
  | R
  | { filter: EdgeFinder; radius: R; keep?: boolean };

export interface FaceTriangulation {
  vertices: number[];
  trianglesIndexes: number[];
  verticesNormals: number[];
}

export interface ShapeMesh {
  triangles: Uint32Array;
  vertices: Float32Array;
  normals: Float32Array;
  faceGroups: { start: number; count: number; faceId: number }[];
}

export type SurfaceType =
  | 'PLANE'
  | 'CYLINDRE'
  | 'CONE'
  | 'SPHERE'
  | 'TORUS'
  | 'BEZIER_SURFACE'
  | 'BSPLINE_SURFACE'
  | 'REVOLUTION_SURFACE'
  | 'EXTRUSION_SURFACE'
  | 'OFFSET_SURFACE'
  | 'OTHER_SURFACE';

export type BooleanOperationOptions = {
  optimisation?: 'none' | 'commonFace' | 'sameFace';
  simplify?: boolean;
  strategy?: 'native' | 'pairwise';
};

// ---------------------------------------------------------------------------
// Shape base class
// ---------------------------------------------------------------------------

export class Shape<Type extends Deletable = OcShape> extends WrappingObj<Type> {
  clone(): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic constructor access
    return new (this.constructor as any)(unwrap(downcast(this.wrapped)));
  }

  serialize(): string {
    const oc = getKernel().oc;
    return oc.BRepToolsWrapper.Write(this.wrapped);
  }

  get hashCode(): number {
    return (this.wrapped as OcShape).HashCode(HASH_CODE_MAX);
  }

  get isNull(): boolean {
    return (this.wrapped as OcShape).IsNull();
  }

  isSame(other: AnyShape): boolean {
    return (this.wrapped as OcShape).IsSame(other.wrapped);
  }

  isEqual(other: AnyShape): boolean {
    return (this.wrapped as OcShape).IsEqual(other.wrapped);
  }

  /**
   * Simplifies the shape by removing unnecessary edges and faces.
   */
  simplify(): this {
    const oc = getKernel().oc;
    const shapeUpgrader = new oc.ShapeUpgrade_UnifySameDomain_2(this.wrapped, true, true, false);
    shapeUpgrader.Build();
    const newShape = unwrap(cast(shapeUpgrader.Shape()));
    shapeUpgrader.delete();

    if (this.constructor !== newShape.constructor)
      bug('transform', 'Shape type changed unexpectedly after transformation');

    // @ts-expect-error we actually check just before
    return newShape as typeof this;
  }

  /**
   * Translates the shape by an arbitrary vector.
   *
   * @category Shape Transformations
   */
  translate(xDist: number, yDist: number, zDist: number): this;
  translate(vector: Point): this;
  translate(vectorOrxDist: Point | number, yDist = 0, zDist = 0): this {
    const translation: Point =
      typeof vectorOrxDist === 'number' ? [vectorOrxDist, yDist, zDist] : vectorOrxDist;
    const newShape = unwrap(cast(translate(this.wrapped, translation)));
    this.delete();

    if (this.constructor !== newShape.constructor)
      bug('transform', 'Shape type changed unexpectedly after transformation');

    // @ts-expect-error we actually check just before
    return newShape as typeof this;
  }

  /**
   * Translates the shape on the X axis.
   *
   * @category Shape Transformations
   */
  translateX(distance: number): this {
    return this.translate([distance, 0, 0]);
  }

  /**
   * Translates the shape on the Y axis.
   *
   * @category Shape Transformations
   */
  translateY(distance: number): this {
    return this.translate([0, distance, 0]);
  }

  /**
   * Translates the shape on the Z axis.
   *
   * @category Shape Transformations
   */
  translateZ(distance: number): this {
    return this.translate([0, 0, distance]);
  }

  /**
   * Rotates the shape.
   *
   * @category Shape Transformations
   */
  rotate(angle: number, position: Point = [0, 0, 0], direction: Point = [0, 0, 1]): this {
    const newShape = unwrap(cast(rotate(this.wrapped, angle, position, direction)));
    this.delete();
    if (this.constructor !== newShape.constructor)
      bug('transform', 'Shape type changed unexpectedly after transformation');

    // @ts-expect-error we actually check just before
    return newShape as typeof this;
  }

  /**
   * Mirrors the shape through a plane.
   *
   * @category Shape Transformations
   */
  mirror(inputPlane?: Plane | PlaneName | Point, origin?: Point): this {
    const newShape = unwrap(cast(mirror(this.wrapped, inputPlane, origin)));
    this.delete();

    if (this.constructor !== newShape.constructor)
      bug('transform', 'Shape type changed unexpectedly after transformation');

    // @ts-expect-error we actually check just before
    return newShape as typeof this;
  }

  /**
   * Returns a scaled version of the shape.
   *
   * @category Shape Transformations
   */
  scale(scaleFactor: number, center: Point = [0, 0, 0]): this {
    const newShape = unwrap(cast(scaleShape(this.wrapped, center, scaleFactor)));
    this.delete();

    if (this.constructor !== newShape.constructor)
      bug('transform', 'Shape type changed unexpectedly after transformation');

    // @ts-expect-error we actually check just before
    return newShape as typeof this;
  }

  protected _iterTopo(topo: TopoEntity): IterableIterator<OcShape> {
    return iterTopo(this.wrapped, topo);
  }

  protected _listTopo(topo: TopoEntity): OcShape[] {
    return Array.from(this._iterTopo(topo)).map((e) => {
      return unwrap(downcast(e));
    });
  }

  get edges(): Edge[] {
    return this._listTopo('edge').map((e) => new Edge(e));
  }

  get faces(): Face[] {
    return this._listTopo('face').map((e) => new Face(e));
  }

  get wires(): Wire[] {
    return this._listTopo('wire').map((e) => new Wire(e));
  }

  get boundingBox(): BoundingBox {
    const bbox = new BoundingBox();
    this.oc.BRepBndLib.Add(this.wrapped, bbox.wrapped, true);
    return bbox;
  }

  protected _mesh({ tolerance = 1e-3, angularTolerance = 0.1 } = {}): void {
    new this.oc.BRepMesh_IncrementalMesh_2(this.wrapped, tolerance, false, angularTolerance, false);
  }

  /**
   * Exports the current shape as a set of triangles for rendering.
   *
   * @category Shape Export
   */
  mesh({
    tolerance = 1e-3,
    angularTolerance = 0.1,
    skipNormals = false,
  }: {
    tolerance?: number;
    angularTolerance?: number;
    skipNormals?: boolean;
  } = {}): ShapeMesh {
    const result = getKernel().mesh(this.wrapped, {
      tolerance,
      angularTolerance,
      skipNormals,
    });

    return {
      vertices: result.vertices,
      normals: result.normals,
      triangles: result.triangles,
      faceGroups: result.faceGroups.map((g) => ({
        start: g.start,
        count: g.count,
        faceId: g.faceHash,
      })),
    };
  }

  /**
   * Exports the current shape as a set of lines for edge rendering.
   *
   * @category Shape Export
   */
  meshEdges({
    tolerance = 1e-3,
    angularTolerance = 0.1,
    cache = true,
  }: { tolerance?: number; angularTolerance?: number; cache?: boolean } = {}): {
    lines: number[];
    edgeGroups: { start: number; count: number; edgeId: number }[];
  } {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Shape → AnyShape coercion for internal delegation
    return _meshShapeEdges(this as any, { tolerance, angularTolerance, cache });
  }

  /**
   * Exports the current shape as a STEP file Blob.
   *
   * @category Shape Export
   */
  blobSTEP(): Result<Blob> {
    const filename = 'blob.step';
    const writer = new this.oc.STEPControl_Writer_1();

    this.oc.Interface_Static.SetIVal('write.step.schema', 5);
    writer.Model(true).delete();
    const progress = new this.oc.Message_ProgressRange_1();

    writer.Transfer(
      this.wrapped,

      this.oc.STEPControl_StepModelType.STEPControl_AsIs,
      true,
      progress
    );

    const done = writer.Write(filename);
    writer.delete();
    progress.delete();

    if (done === this.oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      try {
        const file = this.oc.FS.readFile('/' + filename);
        this.oc.FS.unlink('/' + filename);
        const blob = new Blob([file], { type: 'application/STEP' });
        return ok(blob);
      } catch (e) {
        return err(ioError('STEP_FILE_READ_ERROR', 'Failed to read exported STEP file', e));
      }
    } else {
      return err(ioError('STEP_EXPORT_FAILED', 'Failed to write STEP file'));
    }
  }

  /**
   * Exports the current shape as a STL file Blob.
   *
   * @category Shape Export
   */
  blobSTL({ tolerance = 1e-3, angularTolerance = 0.1, binary = false } = {}): Result<Blob> {
    this._mesh({ tolerance, angularTolerance });
    const filename = 'blob.stl';
    const done = this.oc.StlAPI.Write(this.wrapped, filename, !binary);

    if (done) {
      try {
        const file = this.oc.FS.readFile('/' + filename);
        this.oc.FS.unlink('/' + filename);
        const blob = new Blob([file], { type: 'application/sla' });
        return ok(blob);
      } catch (e) {
        return err(ioError('STL_FILE_READ_ERROR', 'Failed to read exported STL file', e));
      }
    } else {
      return err(ioError('STL_EXPORT_FAILED', 'Failed to write STL file'));
    }
  }
}

// ---------------------------------------------------------------------------
// Vertex
// ---------------------------------------------------------------------------

export class Vertex extends Shape {
  asTuple(): [number, number, number] {
    const pnt = this.oc.BRep_Tool.Pnt(this.wrapped);
    const tuple: [number, number, number] = [pnt.X(), pnt.Y(), pnt.Z()];
    pnt.delete();
    return tuple;
  }
}

// ---------------------------------------------------------------------------
// Curve & 1D shapes
// ---------------------------------------------------------------------------

export class Curve extends WrappingObj<CurveLike> {
  get repr(): string {
    const { startPoint, endPoint } = this;
    const retVal = `start: (${startPoint.repr}) end:(${endPoint.repr})`;
    startPoint.delete();
    endPoint.delete();
    return retVal;
  }

  get curveType(): CurveType {
    const technicalType = this.wrapped.GetType && this.wrapped.GetType();
    return unwrap(findCurveType(technicalType));
  }

  get startPoint(): Vector {
    const umin = this.wrapped.Value(this.wrapped.FirstParameter());
    return new Vector(umin);
  }

  get endPoint(): Vector {
    const umax = this.wrapped.Value(this.wrapped.LastParameter());
    return new Vector(umax);
  }

  protected _mapParameter(position: number): number {
    const firstParam = this.wrapped.FirstParameter();
    const lastParam = this.wrapped.LastParameter();

    return firstParam + (lastParam - firstParam) * position;
  }

  pointAt(position = 0.5): Vector {
    return new Vector(this.wrapped.Value(this._mapParameter(position)));
  }

  tangentAt(position = 0.5): Vector {
    const pos = this._mapParameter(position);

    const tmp = new this.oc.gp_Pnt_1();
    const res = new this.oc.gp_Vec_1();

    this.wrapped.D1(pos, tmp, res);
    const tangent = new Vector(res);

    tmp.delete();
    res.delete();

    return tangent;
  }

  get isClosed(): boolean {
    return this.wrapped.IsClosed();
  }

  get isPeriodic(): boolean {
    return this.wrapped.IsPeriodic();
  }

  get period(): number {
    return this.wrapped.Period();
  }
}

export abstract class _1DShape<Type extends Deletable = OcShape> extends Shape<Type> {
  protected abstract _geomAdaptor(): CurveLike;

  get repr(): string {
    const { startPoint, endPoint } = this;
    const retVal = `start: (${startPoint.repr}) end:(${endPoint.repr})`;
    startPoint.delete();
    endPoint.delete();
    return retVal;
  }

  get curve(): Curve {
    return new Curve(this._geomAdaptor());
  }

  get startPoint(): Vector {
    return this.curve.startPoint;
  }

  get endPoint(): Vector {
    return this.curve.endPoint;
  }

  tangentAt(position = 0): Vector {
    return this.curve.tangentAt(position);
  }

  pointAt(position = 0): Vector {
    return this.curve.pointAt(position);
  }

  get isClosed(): boolean {
    return this.curve.isClosed;
  }

  get isPeriodic(): boolean {
    return this.curve.isPeriodic;
  }

  get period(): number {
    return this.curve.period;
  }

  get geomType(): CurveType {
    return this.curve.curveType;
  }

  get length(): number {
    const properties = new this.oc.GProp_GProps_1();
    this.oc.BRepGProp.LinearProperties(this.wrapped, properties, true, false);

    const length = properties.Mass();
    properties.delete();
    return length;
  }

  get orientation(): 'forward' | 'backward' {
    const orient = (this.wrapped as OcShape).Orientation_1();
    if (orient === this.oc.TopAbs_Orientation.TopAbs_FORWARD) return 'forward';
    return 'backward';
  }

  flipOrientation(): Type {
    const flipped = (this.wrapped as OcShape).Reversed();
    return unwrap(cast(flipped)) as unknown as Type;
  }
}

export class Edge extends _1DShape {
  protected _geomAdaptor(): CurveLike {
    return new this.oc.BRepAdaptor_Curve_2(this.wrapped);
  }
}

export class Wire extends _1DShape {
  protected _geomAdaptor(): CurveLike {
    return new this.oc.BRepAdaptor_CompCurve_2(this.wrapped, false);
  }

  offset2D(offset: number, kind: 'arc' | 'intersection' | 'tangent' = 'arc'): Result<Wire> {
    const kinds = {
      arc: this.oc.GeomAbs_JoinType.GeomAbs_Arc,
      intersection: this.oc.GeomAbs_JoinType.GeomAbs_Intersection,
      tangent: this.oc.GeomAbs_JoinType.GeomAbs_Tangent,
    };

    const offsetter = new this.oc.BRepOffsetAPI_MakeOffset_3(
      this.wrapped,

      kinds[kind],
      false
    );
    offsetter.Perform(offset, 0);

    const result = andThen(cast(offsetter.Shape()), (newShape) => {
      if (!(newShape instanceof Wire))
        return err(typeCastError('OFFSET_NOT_WIRE', 'Offset did not produce a Wire'));
      return ok(newShape);
    });
    offsetter.delete();
    this.delete();
    return result;
  }
}

// ---------------------------------------------------------------------------
// Surface & Face
// ---------------------------------------------------------------------------

export class Surface extends WrappingObj<OcType> {
  get surfaceType(): Result<SurfaceType> {
    const ga = this.oc.GeomAbs_SurfaceType;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT enum keys are dynamic
    const CAST_MAP: Map<any, SurfaceType> = new Map([
      [ga.GeomAbs_Plane, 'PLANE'],
      [ga.GeomAbs_Cylinder, 'CYLINDRE'],
      [ga.GeomAbs_Cone, 'CONE'],
      [ga.GeomAbs_Sphere, 'SPHERE'],
      [ga.GeomAbs_Torus, 'TORUS'],
      [ga.GeomAbs_BezierSurface, 'BEZIER_SURFACE'],
      [ga.GeomAbs_BSplineSurface, 'BSPLINE_SURFACE'],
      [ga.GeomAbs_SurfaceOfRevolution, 'REVOLUTION_SURFACE'],
      [ga.GeomAbs_SurfaceOfExtrusion, 'EXTRUSION_SURFACE'],
      [ga.GeomAbs_OffsetSurface, 'OFFSET_SURFACE'],
      [ga.GeomAbs_OtherSurface, 'OTHER_SURFACE'],
    ]);

    const st = CAST_MAP.get(this.wrapped.GetType());
    if (!st)
      return err(
        typeCastError('UNKNOWN_SURFACE_TYPE', 'Unrecognized surface type from OCCT adapter')
      );
    return ok(st);
  }
}

export class Face extends Shape {
  protected _geomAdaptor(): OcType {
    return new this.oc.BRepAdaptor_Surface_2(this.wrapped, false);
  }

  get surface(): Surface {
    return new Surface(this._geomAdaptor());
  }

  get orientation(): 'forward' | 'backward' {
    const orient = this.wrapped.Orientation_1();
    if (orient === this.oc.TopAbs_Orientation.TopAbs_FORWARD) return 'forward';
    return 'backward';
  }

  flipOrientation(): Face {
    const flipped = this.wrapped.Reversed();
    return unwrap(cast(flipped)) as Face;
  }

  get geomType(): SurfaceType {
    const surface = this.surface;
    const geomType = unwrap(surface.surfaceType);
    surface.delete();
    return geomType;
  }

  get UVBounds(): { uMin: number; uMax: number; vMin: number; vMax: number } {
    const uMin = { current: 0 };
    const uMax = { current: 0 };
    const vMin = { current: 0 };
    const vMax = { current: 0 };

    this.oc.BRepTools.UVBounds_1(this.wrapped, uMin, uMax, vMin, vMax);

    return {
      uMin: uMin.current,
      uMax: uMax.current,
      vMin: vMin.current,
      vMax: vMax.current,
    };
  }

  pointOnSurface(u: number, v: number): Vector {
    const { uMin, uMax, vMin, vMax } = this.UVBounds;
    const surface = this._geomAdaptor();
    const p = new this.oc.gp_Pnt_1();

    const absoluteU = u * (uMax - uMin) + uMin;
    const absoluteV = v * (vMax - vMin) + vMin;

    surface.D0(absoluteU, absoluteV, p);
    const point = new Vector(p);
    surface.delete();
    p.delete();

    return point;
  }

  uvCoordinates(point: Point): [number, number] {
    const r = GCWithScope();
    const surface = r(this.oc.BRep_Tool.Surface_2(this.wrapped));

    const projectedPoint = r(
      new this.oc.GeomAPI_ProjectPointOnSurf_2(
        r(asPnt(point)),
        surface,

        this.oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad
      )
    );

    const uPtr = { current: 0 };
    const vPtr = { current: 0 };

    projectedPoint.LowerDistanceParameters(uPtr, vPtr);
    return [uPtr.current, vPtr.current];
  }

  normalAt(locationVector?: Point): Vector {
    let u = 0;
    let v = 0;

    const r = GCWithScope();

    if (!locationVector) {
      const { uMin, uMax, vMin, vMax } = this.UVBounds;
      u = 0.5 * (uMin + uMax);
      v = 0.5 * (vMin + vMax);
    } else {
      [u, v] = this.uvCoordinates(locationVector);
    }

    const p = r(new this.oc.gp_Pnt_1());
    const vn = r(new this.oc.gp_Vec_1());

    const props = r(new this.oc.BRepGProp_Face_2(this.wrapped, false));
    props.Normal(u, v, p, vn);

    const normal = new Vector(vn);
    return normal;
  }

  get center(): Vector {
    const properties = new this.oc.GProp_GProps_1();
    this.oc.BRepGProp.SurfaceProperties_2(this.wrapped, properties, 1e-7, true);

    const center = new Vector(properties.CentreOfMass());
    properties.delete();
    return center;
  }

  outerWire(): Wire {
    const newVal = new Wire(this.oc.BRepTools.OuterWire(this.wrapped));
    this.delete();
    return newVal;
  }

  innerWires(): Wire[] {
    const outer = this.clone().outerWire();
    const innerWiresArr = this.wires.filter((w) => !outer.isSame(w));
    outer.delete();
    this.delete();
    return innerWiresArr;
  }

  /**
   * @internal
   */
  triangulation(index0 = 0, skipNormals = false): FaceTriangulation | null {
    const r = GCWithScope();

    const aLocation = r(new this.oc.TopLoc_Location_1());
    const triangulationHandle = r(this.oc.BRep_Tool.Triangulation(this.wrapped, aLocation, 0));

    if (triangulationHandle.IsNull()) return null;

    const transformation = r(aLocation.Transformation());

    const triangulatedFace: FaceTriangulation = {
      vertices: [],
      trianglesIndexes: [],
      verticesNormals: [],
    };

    const tri = triangulationHandle.get();
    const nbNodes = tri.NbNodes();

    // write vertex buffer
    triangulatedFace.vertices = new Array(nbNodes * 3);
    for (let i = 1; i <= nbNodes; i++) {
      const p = r(r(tri.Node(i)).Transformed(transformation));
      triangulatedFace.vertices[(i - 1) * 3 + 0] = p.X();
      triangulatedFace.vertices[(i - 1) * 3 + 1] = p.Y();
      triangulatedFace.vertices[(i - 1) * 3 + 2] = p.Z();
    }

    if (!skipNormals) {
      const normalsArray = r(new this.oc.TColgp_Array1OfDir_2(1, nbNodes));
      const pc = r(new this.oc.Poly_Connect_2(triangulationHandle));
      this.oc.StdPrs_ToolTriangulatedShape.Normal(this.wrapped, pc, normalsArray);
      triangulatedFace.verticesNormals = new Array(normalsArray.Length() * 3);
      for (let i = normalsArray.Lower(); i <= normalsArray.Upper(); i++) {
        const d = r(r(normalsArray.Value(i)).Transformed(transformation));
        triangulatedFace.verticesNormals[(i - 1) * 3 + 0] = d.X();
        triangulatedFace.verticesNormals[(i - 1) * 3 + 1] = d.Y();
        triangulatedFace.verticesNormals[(i - 1) * 3 + 2] = d.Z();
      }
    }

    // write triangle buffer
    const orient = this.orientation;
    const nbTriangles = tri.NbTriangles();
    triangulatedFace.trianglesIndexes = new Array(nbTriangles * 3);
    let validFaceTriCount = 0;
    for (let nt = 1; nt <= nbTriangles; nt++) {
      const t = r(tri.Triangle(nt));
      let n1 = t.Value(1);
      let n2 = t.Value(2);
      const n3 = t.Value(3);
      if (orient === 'backward') {
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
}

// ---------------------------------------------------------------------------
// 3D shapes
// ---------------------------------------------------------------------------

export class _3DShape<Type extends Deletable = OcShape> extends Shape<Type> {
  /**
   * Builds a new shape out of the two fused shapes.
   *
   * @category Shape Modifications
   */
  fuse(
    other: Shape3D,
    { optimisation = 'none', simplify = false }: BooleanOperationOptions = {}
  ): Result<Shape3D> {
    const r = GCWithScope();
    const progress = r(new this.oc.Message_ProgressRange_1());
    const newBody = r(new this.oc.BRepAlgoAPI_Fuse_3(this.wrapped, other.wrapped, progress));
    applyGlue(newBody, optimisation);

    newBody.Build(progress);
    if (simplify) {
      newBody.SimplifyResult(true, true, 1e-3);
    }
    return andThen(cast(newBody.Shape()), (newShape) => {
      if (!isShape3D(newShape))
        return err(typeCastError('FUSE_NOT_3D', 'Fuse did not produce a 3D shape'));
      return ok(newShape);
    });
  }

  /**
   * Builds a new shape by removing the tool from this shape.
   *
   * @category Shape Modifications
   */
  cut(
    tool: Shape3D,
    { optimisation = 'none', simplify = false }: BooleanOperationOptions = {}
  ): Result<Shape3D> {
    const r = GCWithScope();
    const progress = r(new this.oc.Message_ProgressRange_1());
    const cutter = r(new this.oc.BRepAlgoAPI_Cut_3(this.wrapped, tool.wrapped, progress));
    applyGlue(cutter, optimisation);
    cutter.Build(progress);
    if (simplify) {
      cutter.SimplifyResult(true, true, 1e-3);
    }

    return andThen(cast(cutter.Shape()), (newShape) => {
      if (!isShape3D(newShape))
        return err(typeCastError('CUT_NOT_3D', 'Cut did not produce a 3D shape'));
      return ok(newShape);
    });
  }

  /**
   * Builds a new shape by intersecting this shape and another.
   *
   * @category Shape Modifications
   */
  intersect(tool: AnyShape, { simplify = false }: { simplify?: boolean } = {}): Result<Shape3D> {
    const r = GCWithScope();
    const progress = r(new this.oc.Message_ProgressRange_1());
    const intersector = r(new this.oc.BRepAlgoAPI_Common_3(this.wrapped, tool.wrapped, progress));
    intersector.Build(progress);
    if (simplify) {
      intersector.SimplifyResult(true, true, 1e-3);
    }

    return andThen(cast(intersector.Shape()), (newShape) => {
      if (!isShape3D(newShape))
        return err(typeCastError('INTERSECT_NOT_3D', 'Intersect did not produce a 3D shape'));
      return ok(newShape);
    });
  }

  /**
   * Hollows out the current shape.
   *
   * @category Shape Modifications
   */
  shell(config: { filter: FaceFinder; thickness: number }, tolerance?: number): Result<Shape3D>;
  shell(
    thickness: number,
    finderFcn: (f: FaceFinder) => FaceFinder,
    tolerance?: number
  ): Result<Shape3D>;
  shell(
    thicknessOrConfig: { filter: FaceFinder; thickness: number } | number,
    toleranceOrFinderFcn: null | number | ((f: FaceFinder) => FaceFinder) = null,
    tolerance = 1e-3
  ): Result<Shape3D> {
    const tol = typeof toleranceOrFinderFcn === 'number' ? toleranceOrFinderFcn : tolerance;

    const { FaceFinder: FaceFinderClass } = getQueryModule();

    let filter: FaceFinder;
    let thickness: number;

    if (typeof thicknessOrConfig === 'number') {
      thickness = thicknessOrConfig;
      const ff = new FaceFinderClass();
      filter = typeof toleranceOrFinderFcn === 'function' ? toleranceOrFinderFcn(ff) : ff;
    } else {
      thickness = thicknessOrConfig.thickness;
      filter = thicknessOrConfig.filter;
    }

    const r = GCWithScope();

    const filteredFaces = filter.find(this as unknown as AnyShape);
    const facesToRemove = r(new this.oc.TopTools_ListOfShape_1());

    filteredFaces.forEach((face: Face) => {
      facesToRemove.Append_1(face.wrapped);
    });

    const progress = r(new this.oc.Message_ProgressRange_1());
    const shellBuilder = r(new this.oc.BRepOffsetAPI_MakeThickSolid());

    shellBuilder.MakeThickSolidByJoin(
      this.wrapped,
      facesToRemove,
      -thickness,
      tol,

      this.oc.BRepOffset_Mode.BRepOffset_Skin,
      false,
      false,

      this.oc.GeomAbs_JoinType.GeomAbs_Arc,
      false,
      progress
    );
    return andThen(cast(shellBuilder.Shape()), (newShape) => {
      if (!isShape3D(newShape))
        return err(typeCastError('SHELL_NOT_3D', 'Shell operation did not produce a 3D shape'));
      return ok(newShape);
    });
  }

  protected _builderIter<R = number>(
    radiusConfigInput: RadiusConfig<R>,
    builderAdd: (radius: R, edge: OcShape) => void,
    isRadius: (r: unknown) => r is R
  ): number {
    if (isRadius(radiusConfigInput)) {
      let edgeCount = 0;
      for (const rawEdge of this._iterTopo('edge')) {
        builderAdd(radiusConfigInput, unwrap(downcast(rawEdge)));
        edgeCount += 1;
      }
      return edgeCount;
    }

    let radiusConfigFun: (e: Edge) => R | null;
    let finalize: null | (() => void) = null;

    if (typeof radiusConfigInput === 'function') {
      radiusConfigFun = radiusConfigInput;
    } else {
      const configObj = radiusConfigInput as { filter: EdgeFinder; radius: R; keep?: boolean };
      radiusConfigFun = (element: Edge) => {
        const shouldKeep = configObj.filter.shouldKeep(element);
        return shouldKeep ? configObj.radius || (1 as R) : null;
      };

      if (!configObj.keep) {
        finalize = () => {
          configObj.filter.delete();
        };
      }
    }

    let edgeAddedCount = 0;
    for (const e of this._iterTopo('edge')) {
      const rawEdge = unwrap(downcast(e));
      const edge = new Edge(rawEdge);
      const radius = radiusConfigFun(edge);
      if (radius) {
        builderAdd(radius, rawEdge);
        edgeAddedCount += 1;
      }
      edge.delete();
    }
    if (finalize) finalize();
    return edgeAddedCount;
  }

  /**
   * Creates a new shape with some edges filletted.
   *
   * @category Shape Modifications
   */
  fillet(
    radiusConfig: RadiusConfig<FilletRadius>,
    filter?: (e: EdgeFinder) => EdgeFinder
  ): Result<Shape3D> {
    const r = GCWithScope();

    const filletBuilder = r(
      new this.oc.BRepFilletAPI_MakeFillet(
        this.wrapped,

        this.oc.ChFi3d_FilletShape.ChFi3d_Rational
      )
    );

    let config: RadiusConfig<FilletRadius> = radiusConfig;
    if (isFilletRadius(radiusConfig) && filter) {
      const { EdgeFinder: EdgeFinderClass } = getQueryModule();
      config = {
        radius: radiusConfig,
        filter: filter(new EdgeFinderClass()),
      };
    }

    const edgesFound = this._builderIter(
      config,
      (rad, e) => {
        if (isNumber(rad)) return filletBuilder.Add_2(rad, e);
        return filletBuilder.Add_3(rad[0], rad[1], e);
      },
      isFilletRadius
    );
    if (!edgesFound)
      return err(validationError('FILLET_NO_EDGES', 'Fillet failed: no edges matched the filter'));

    return andThen(cast(filletBuilder.Shape()), (newShape) => {
      if (!isShape3D(newShape))
        return err(typeCastError('FILLET_NOT_3D', 'Fillet did not produce a 3D shape'));
      return ok(newShape);
    });
  }

  /**
   * Creates a new shape with some edges chamfered.
   *
   * @category Shape Modifications
   */
  chamfer(
    radiusConfig: RadiusConfig<ChamferRadius>,
    filter?: (e: EdgeFinder) => EdgeFinder
  ): Result<Shape3D> {
    const r = GCWithScope();

    const chamferBuilder = r(new this.oc.BRepFilletAPI_MakeChamfer(this.wrapped));

    let config: RadiusConfig<ChamferRadius> = radiusConfig;

    if (isChamferRadius(radiusConfig) && filter) {
      const { EdgeFinder: EdgeFinderClass } = getQueryModule();
      config = {
        radius: radiusConfig,
        filter: filter(new EdgeFinderClass()),
      };
    }

    const { FaceFinder: FaceFinderClass } = getQueryModule();

    const edgesFound = this._builderIter(
      config,
      (rad, e) => {
        if (isNumber(rad)) return chamferBuilder.Add_2(rad, e);

        const finder = new FaceFinderClass();
        const face = unwrap(rad.selectedFace(finder).find(this, { unique: true }));

        if ('distances' in rad) {
          const [d1, d2] = rad.distances;
          return chamferBuilder.Add_3(d1, d2, e, face.wrapped);
        }

        if ('distance' in rad) {
          return chamferBuilder.AddDA(rad.distance, rad.angle * DEG2RAD, e, face.wrapped);
        }
      },
      isChamferRadius
    );
    if (!edgesFound)
      return err(
        validationError('CHAMFER_NO_EDGES', 'Chamfer failed: no edges matched the filter')
      );

    return andThen(cast(chamferBuilder.Shape()), (newShape) => {
      if (!isShape3D(newShape))
        return err(typeCastError('CHAMFER_NOT_3D', 'Chamfer did not produce a 3D shape'));
      return ok(newShape);
    });
  }
}

// ---------------------------------------------------------------------------
// Concrete 3D shape classes
// ---------------------------------------------------------------------------

export class Shell extends _3DShape {}
export class Solid extends _3DShape {}
export class CompSolid extends _3DShape {}
export class Compound extends _3DShape {}

// ---------------------------------------------------------------------------
// Local isShape3D (avoids circular reference to cast.ts for internal use)
// ---------------------------------------------------------------------------

export function isShape3D(shape: AnyShape): shape is Shape3D {
  return (
    shape instanceof Shell ||
    shape instanceof Solid ||
    shape instanceof CompSolid ||
    shape instanceof Compound
  );
}

// ---------------------------------------------------------------------------
// Compound builders and batch booleans
// ---------------------------------------------------------------------------

/**
 * Builds a TopoDS_Compound from raw OCCT shape handles.
 * Used internally by both high-level (Shape3D[]) and low-level (OcType[]) APIs.
 */
export function buildCompoundOc(shapes: OcType[]): OcShape {
  const oc = getKernel().oc;
  const builder = new oc.TopoDS_Builder();
  const compound = new oc.TopoDS_Compound();
  builder.MakeCompound(compound);
  for (const s of shapes) {
    builder.Add(compound, s);
  }
  builder.delete();
  return compound;
}

export function buildCompound(shapes: Shape3D[]): OcShape {
  return buildCompoundOc(shapes.map((s) => s.wrapped));
}

export function applyGlue(
  op: { SetGlue(glue: OcType): void },
  optimisation: 'none' | 'commonFace' | 'sameFace'
): void {
  const oc = getKernel().oc;
  if (optimisation === 'commonFace') {
    op.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueShift);
  }
  if (optimisation === 'sameFace') {
    op.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueFull);
  }
}

/**
 * Fuses all given shapes in a single boolean operation.
 *
 * @category Boolean Operations
 */
export function fuseAll(
  shapes: Shape3D[],
  { optimisation = 'none', simplify = false, strategy = 'native' }: BooleanOperationOptions = {}
): Result<Shape3D> {
  if (shapes.length === 0)
    return err(validationError('FUSE_ALL_EMPTY', 'fuseAll requires at least one shape'));
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  if (shapes.length === 1) return ok(shapes[0]!);

  if (strategy === 'native') {
    // Delegate to kernel's native N-way fuse via BRepAlgoAPI_BuilderAlgo
    const result = getKernel().fuseAll(
      shapes.map((s) => s.wrapped),
      { optimisation, simplify, strategy }
    );
    return andThen(cast(result), (newShape) => {
      if (!isShape3D(newShape))
        return err(typeCastError('FUSE_ALL_NOT_3D', 'fuseAll did not produce a 3D shape'));
      return ok(newShape);
    });
  }

  // Pairwise fallback: recursive divide-and-conquer
  // Defer simplification to the final fuse — intermediate simplification is wasted work.
  const mid = Math.ceil(shapes.length / 2);
  const leftResult = fuseAll(shapes.slice(0, mid), { optimisation, simplify: false, strategy });
  if (isErr(leftResult)) return leftResult;
  const rightResult = fuseAll(shapes.slice(mid), { optimisation, simplify: false, strategy });
  if (isErr(rightResult)) return rightResult;

  return leftResult.value.fuse(rightResult.value, { optimisation, simplify });
}

/**
 * Cuts all tool shapes from the base shape in a single boolean operation.
 *
 * @category Boolean Operations
 */
export function cutAll(
  base: Shape3D,
  tools: Shape3D[],
  { optimisation = 'none', simplify = false }: BooleanOperationOptions = {}
): Result<Shape3D> {
  if (tools.length === 0) return ok(base);

  const oc = getKernel().oc;
  const r = GCWithScope();

  const toolCompound = r(buildCompound(tools));

  const progress = r(new oc.Message_ProgressRange_1());
  const cutOp = r(new oc.BRepAlgoAPI_Cut_3(base.wrapped, toolCompound, progress));
  applyGlue(cutOp, optimisation);
  cutOp.Build(progress);
  if (simplify) {
    cutOp.SimplifyResult(true, true, 1e-3);
  }

  return andThen(cast(cutOp.Shape()), (newShape) => {
    if (!isShape3D(newShape))
      return err(typeCastError('CUT_ALL_NOT_3D', 'cutAll did not produce a 3D shape'));
    return ok(newShape);
  });
}
