import type { OcShape, OcType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import { WrappingObj, gcWithScope } from '../core/memory.js';
import { meshShapeEdges as _meshShapeEdges, type ShapeMesh } from './meshFns.js';
import { type SurfaceType, type FaceTriangulation } from './faceFns.js';
import type { Plane, PlaneName } from '../core/planeTypes.js';
import type { Vec3, PointInput } from '../core/types.js';
import { toVec3 } from '../core/types.js';
import { vecRepr } from '../core/vecOps.js';
import { fromOcVec, fromOcPnt, toOcPnt } from '../core/occtBoundary.js';
import { DEG2RAD, HASH_CODE_MAX, uniqueIOFilename } from '../core/constants.js';
import { rotate, translate, mirror, scale as scaleShape } from '../core/geometryHelpers.js';
import { findCurveType, type CurveType } from '../core/definitionMaps.js';
import { cast, downcast, iterTopo, type TopoEntity } from './cast.js';
import type { EdgeFinder, FaceFinder } from '../query/index.js';
import { typeCastError, validationError, ioError, bug } from '../core/errors.js';
import { type Result, ok, err, unwrap, andThen } from '../core/result.js';
import {
  fuseAll as _fuseAll,
  cutAll as _cutAll,
  buildCompound as _buildCompound,
  buildCompoundOc as _buildCompoundOc,
  applyGlue as _applyGlue,
} from './shapeBooleans.js';
import {
  getQueryModule,
  registerQueryModule as _registerQueryModule,
  type ChamferRadius,
  type FilletRadius,
  type RadiusConfig,
  isNumber,
  isChamferRadius,
  isFilletRadius,
} from './shapeModifiers.js';

export type { CurveType };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Union of all concrete shape types in the topology layer. */
export type AnyShape = Vertex | Edge | Wire | Face | Shell | Solid | CompSolid | Compound;

/** Union of shape types that represent 3D bodies (shells, solids, compounds). */
export type Shape3D = Shell | Solid | CompSolid | Compound;

/** Interface for OCCT curve adaptors (BRepAdaptor_Curve / CompCurve). */
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

// Re-export types from functional API for backward compatibility
export type { FaceTriangulation, ShapeMesh, SurfaceType };

// Re-export modifier types from shapeModifiers.ts for backward compatibility
export type { ChamferRadius, FilletRadius, RadiusConfig };
export { isNumber, isChamferRadius, isFilletRadius };

/** Options for boolean operations (fuse, cut, intersect) on OOP Shape classes. */
export type BooleanOperationOptions = {
  optimisation?: 'none' | 'commonFace' | 'sameFace';
  simplify?: boolean;
  strategy?: 'native' | 'pairwise';
};

// ---------------------------------------------------------------------------
// Shape base class
// ---------------------------------------------------------------------------

/**
 * Base class for all BREP topology shapes.
 *
 * Wraps an OCCT TopoDS_Shape handle with GC support and provides common
 * operations (transform, mesh, export). Concrete subclasses: Vertex, Edge,
 * Wire, Face, Shell, Solid, CompSolid, Compound.
 *
 * @see cloneShape — functional equivalent of clone()
 * @see serializeShape — functional equivalent of serialize()
 */
export class Shape<Type extends OcShape = OcShape> extends WrappingObj<Type> {
  /** @deprecated Use cloneShape() instead. */
  clone(): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic constructor access
    return new (this.constructor as any)(unwrap(downcast(this.wrapped)));
  }

  /**
   * Serialize the shape to BREP string format.
   * @see serializeShape — functional equivalent
   */
  serialize(): string {
    const oc = getKernel().oc;
    return oc.BRepToolsWrapper.Write(this.wrapped);
  }

  /** Get the topology hash code of the underlying OCCT shape. */
  get hashCode(): number {
    return (this.wrapped as OcShape).HashCode(HASH_CODE_MAX);
  }

  /** Return true if the underlying OCCT shape handle is null. */
  get isNull(): boolean {
    return (this.wrapped as OcShape).IsNull();
  }

  /** Check if two shapes refer to the same topological entity. */
  isSame(other: AnyShape): boolean {
    return (this.wrapped as OcShape).IsSame(other.wrapped);
  }

  /** Check if two shapes are geometrically equal (same geometry and orientation). */
  isEqual(other: AnyShape): boolean {
    return (this.wrapped as OcShape).IsEqual(other.wrapped);
  }

  /**
   * Simplifies the shape by removing unnecessary edges and faces.
   *
   * @deprecated Use simplifyShape() instead.
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
   * @deprecated Use translateShape() instead.
   * @category Shape Transformations
   */
  translate(xDist: number, yDist: number, zDist: number): this;
  translate(vector: PointInput): this;
  translate(vectorOrxDist: PointInput | number, yDist = 0, zDist = 0): this {
    const translation: PointInput =
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
   * @deprecated Use rotateShape() instead.
   * @category Shape Transformations
   */
  rotate(angle: number, position: PointInput = [0, 0, 0], direction: PointInput = [0, 0, 1]): this {
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
   * @deprecated Use mirrorShape() instead.
   * @category Shape Transformations
   */
  mirror(inputPlane?: Plane | PlaneName | PointInput, origin?: PointInput): this {
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
   * @deprecated Use scaleShape() instead.
   * @category Shape Transformations
   */
  scale(scaleFactor: number, center: PointInput = [0, 0, 0]): this {
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

  /** Get all edges of this shape. */
  get edges(): Edge[] {
    return this._listTopo('edge').map((e) => new Edge(e));
  }

  /** Get all faces of this shape. */
  get faces(): Face[] {
    return this._listTopo('face').map((e) => new Face(e));
  }

  /** Get all wires of this shape. */
  get wires(): Wire[] {
    return this._listTopo('wire').map((e) => new Wire(e));
  }

  protected _mesh({ tolerance = 1e-3, angularTolerance = 0.1 } = {}): void {
    const mesher = new this.oc.BRepMesh_IncrementalMesh_2(
      this.wrapped,
      tolerance,
      false,
      angularTolerance,
      false
    );
    mesher.delete();
  }

  /**
   * Exports the current shape as a set of triangles for rendering.
   *
   * @deprecated Use meshShape() instead.
   * @category Shape Export
   */
  mesh({
    tolerance = 1e-3,
    angularTolerance = 0.1,
    skipNormals = false,
    includeUVs = false,
  }: {
    tolerance?: number;
    angularTolerance?: number;
    skipNormals?: boolean;
    includeUVs?: boolean;
  } = {}): ShapeMesh {
    const result = getKernel().mesh(this.wrapped, {
      tolerance,
      angularTolerance,
      skipNormals,
      includeUVs,
    });

    return {
      vertices: result.vertices,
      normals: result.normals,
      triangles: result.triangles,
      uvs: result.uvs,
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
    const filename = uniqueIOFilename('_blob', 'step');
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
    const filename = uniqueIOFilename('_blob', 'stl');
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

/** A zero-dimensional topological shape representing a single point. */
export class Vertex extends Shape {
  /** Get the 3D coordinates as a `[x, y, z]` tuple. */
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

/**
 * Wrapper around an OCCT curve adaptor for evaluating geometry along a 1D parameter space.
 *
 * @see getCurveType — functional equivalent
 */
export class Curve extends WrappingObj<CurveLike> {
  /** Get a human-readable representation showing start and end points. */
  get repr(): string {
    const { startPoint, endPoint } = this;
    const retVal = `start: (${vecRepr(startPoint)}) end:(${vecRepr(endPoint)})`;
    return retVal;
  }

  /** Get the geometric type of this curve (LINE, CIRCLE, BSPLINE, etc.). */
  get curveType(): CurveType {
    const technicalType = this.wrapped.GetType && this.wrapped.GetType();
    return unwrap(findCurveType(technicalType));
  }

  /** Get the start point of the curve. */
  get startPoint(): Vec3 {
    const umin = this.wrapped.Value(this.wrapped.FirstParameter());
    const result = fromOcPnt(umin);
    umin.delete();
    return result;
  }

  /** Get the end point of the curve. */
  get endPoint(): Vec3 {
    const umax = this.wrapped.Value(this.wrapped.LastParameter());
    const result = fromOcPnt(umax);
    umax.delete();
    return result;
  }

  protected _mapParameter(position: number): number {
    const firstParam = this.wrapped.FirstParameter();
    const lastParam = this.wrapped.LastParameter();

    return firstParam + (lastParam - firstParam) * position;
  }

  /**
   * Evaluate a point on the curve at a normalized position.
   * @param position - Normalized parameter (0 = start, 1 = end, default 0.5 = midpoint).
   */
  pointAt(position = 0.5): Vec3 {
    const pnt = this.wrapped.Value(this._mapParameter(position));
    const result = fromOcPnt(pnt);
    pnt.delete();
    return result;
  }

  /**
   * Evaluate the tangent vector at a normalized position on the curve.
   * @param position - Normalized parameter (0 = start, 1 = end, default 0.5 = midpoint).
   */
  tangentAt(position = 0.5): Vec3 {
    const pos = this._mapParameter(position);

    const tmp = new this.oc.gp_Pnt_1();
    const res = new this.oc.gp_Vec_1();

    this.wrapped.D1(pos, tmp, res);
    const tangent = fromOcVec(res);

    tmp.delete();
    res.delete();

    return tangent;
  }

  /** Return true if the curve forms a closed loop. */
  get isClosed(): boolean {
    return this.wrapped.IsClosed();
  }

  /** Return true if the curve is periodic (e.g., a full circle). */
  get isPeriodic(): boolean {
    return this.wrapped.IsPeriodic();
  }

  /** Get the period length of a periodic curve. */
  get period(): number {
    return this.wrapped.Period();
  }
}

/**
 * Abstract base for one-dimensional shapes (Edge, Wire).
 *
 * Provides curve evaluation (point/tangent at parameter), length,
 * orientation, and period queries.
 */
export abstract class _1DShape<Type extends OcShape = OcShape> extends Shape<Type> {
  protected abstract _geomAdaptor(): CurveLike;

  /** Get a human-readable representation showing start and end points. */
  get repr(): string {
    const { startPoint, endPoint } = this;
    const retVal = `start: (${vecRepr(startPoint)}) end:(${vecRepr(endPoint)})`;
    return retVal;
  }

  /** Get the underlying Curve adaptor for direct parameter evaluation. */
  get curve(): Curve {
    return new Curve(this._geomAdaptor());
  }

  /** Get the start point of the edge or wire. */
  get startPoint(): Vec3 {
    const c = this.curve;
    const result = c.startPoint;
    c.delete();
    return result;
  }

  /** Get the end point of the edge or wire. */
  get endPoint(): Vec3 {
    const c = this.curve;
    const result = c.endPoint;
    c.delete();
    return result;
  }

  /**
   * Evaluate the tangent vector at a normalized position.
   * @param position - Normalized parameter (0 = start, 1 = end).
   */
  tangentAt(position = 0): Vec3 {
    const c = this.curve;
    const result = c.tangentAt(position);
    c.delete();
    return result;
  }

  /**
   * Evaluate a point on the curve at a normalized position.
   * @param position - Normalized parameter (0 = start, 1 = end).
   */
  pointAt(position = 0): Vec3 {
    const c = this.curve;
    const result = c.pointAt(position);
    c.delete();
    return result;
  }

  /** Return true if the curve forms a closed loop. */
  get isClosed(): boolean {
    const c = this.curve;
    const result = c.isClosed;
    c.delete();
    return result;
  }

  /** Return true if the curve is periodic (e.g., a full circle). */
  get isPeriodic(): boolean {
    const c = this.curve;
    const result = c.isPeriodic;
    c.delete();
    return result;
  }

  /** Get the period length of a periodic curve. */
  get period(): number {
    const c = this.curve;
    const result = c.period;
    c.delete();
    return result;
  }

  /** Get the geometric type of this curve (LINE, CIRCLE, BSPLINE, etc.). */
  get geomType(): CurveType {
    const c = this.curve;
    const result = c.curveType;
    c.delete();
    return result;
  }

  /** Get the arc length of the edge or wire. */
  get length(): number {
    const properties = new this.oc.GProp_GProps_1();
    this.oc.BRepGProp.LinearProperties(this.wrapped, properties, true, false);

    const length = properties.Mass();
    properties.delete();
    return length;
  }

  /** Get the topological orientation ('forward' or 'backward'). */
  get orientation(): 'forward' | 'backward' {
    const orient = (this.wrapped as OcShape).Orientation_1();
    if (orient === this.oc.TopAbs_Orientation.TopAbs_FORWARD) return 'forward';
    return 'backward';
  }

  /** Return a copy of this shape with reversed orientation. */
  flipOrientation(): Type {
    const flipped = (this.wrapped as OcShape).Reversed();
    return unwrap(cast(flipped)) as unknown as Type;
  }
}

/** A one-dimensional shape representing a single curve segment between two vertices. */
export class Edge extends _1DShape {
  protected _geomAdaptor(): CurveLike {
    return new this.oc.BRepAdaptor_Curve_2(this.wrapped);
  }
}

/** A one-dimensional shape representing a connected sequence of edges. */
export class Wire extends _1DShape {
  protected _geomAdaptor(): CurveLike {
    return new this.oc.BRepAdaptor_CompCurve_2(this.wrapped, false);
  }

  /**
   * Offset this wire in 2D by a distance. Positive offsets go outward, negative inward.
   * Disposes this wire and returns a new one.
   *
   * @param offset - Offset distance (positive = outward, negative = inward).
   * @param kind - Join type for offset corners.
   * @returns The offset wire, or an error if the operation fails.
   * @see offsetWire2D — functional equivalent (does not dispose input)
   */
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

/** Wrapper around an OCCT surface adaptor for querying surface geometry. */
export class Surface extends WrappingObj<OcType> {
  /** Get the geometric type of this surface (PLANE, CYLINDRE, SPHERE, etc.). */
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

/**
 * A two-dimensional shape representing a bounded surface.
 *
 * @see getSurfaceType — functional equivalent of geomType
 * @see normalAt — functional equivalent in faceFns.ts
 */
export class Face extends Shape {
  protected _geomAdaptor(): OcType {
    return new this.oc.BRepAdaptor_Surface_2(this.wrapped, false);
  }

  /** Get the underlying Surface adaptor for querying surface properties. */
  get surface(): Surface {
    return new Surface(this._geomAdaptor());
  }

  /** Get the topological orientation ('forward' or 'backward'). */
  get orientation(): 'forward' | 'backward' {
    const orient = this.wrapped.Orientation_1();
    if (orient === this.oc.TopAbs_Orientation.TopAbs_FORWARD) return 'forward';
    return 'backward';
  }

  /** Return a copy of this face with reversed orientation. */
  flipOrientation(): Face {
    const flipped = this.wrapped.Reversed();
    return unwrap(cast(flipped)) as Face;
  }

  /** Get the geometric surface type (PLANE, CYLINDRE, SPHERE, etc.). */
  get geomType(): SurfaceType {
    const surface = this.surface;
    try {
      return unwrap(surface.surfaceType);
    } finally {
      surface.delete();
    }
  }

  /** Get the UV parameter bounds of this face's surface. */
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

  /**
   * Evaluate a 3D point on the surface at normalized UV coordinates (0-1 range).
   * @param u - Normalized U parameter (0-1).
   * @param v - Normalized V parameter (0-1).
   */
  pointOnSurface(u: number, v: number): Vec3 {
    const { uMin, uMax, vMin, vMax } = this.UVBounds;
    const surface = this._geomAdaptor();
    const p = new this.oc.gp_Pnt_1();

    const absoluteU = u * (uMax - uMin) + uMin;
    const absoluteV = v * (vMax - vMin) + vMin;

    surface.D0(absoluteU, absoluteV, p);
    const point = fromOcPnt(p);
    surface.delete();
    p.delete();

    return point;
  }

  /**
   * Project a 3D point onto this face and return its UV coordinates.
   * @param point - The 3D point to project onto the surface.
   */
  uvCoordinates(point: PointInput): [number, number] {
    const r = gcWithScope();
    const surface = r(this.oc.BRep_Tool.Surface_2(this.wrapped));

    const projectedPoint = r(
      new this.oc.GeomAPI_ProjectPointOnSurf_2(
        r(toOcPnt(toVec3(point))),
        surface,

        this.oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad
      )
    );

    const uPtr = { current: 0 };
    const vPtr = { current: 0 };

    projectedPoint.LowerDistanceParameters(uPtr, vPtr);
    return [uPtr.current, vPtr.current];
  }

  /**
   * Compute the surface normal at a given point, or at the face center if omitted.
   * @param locationVector - Optional 3D point to evaluate the normal at.
   */
  normalAt(locationVector?: PointInput): Vec3 {
    let u = 0;
    let v = 0;

    const r = gcWithScope();

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

    const normal = fromOcVec(vn);
    return normal;
  }

  /** Get the center of mass of this face. */
  get center(): Vec3 {
    const properties = new this.oc.GProp_GProps_1();
    this.oc.BRepGProp.SurfaceProperties_2(this.wrapped, properties, 1e-7, true);

    const centerPnt = properties.CentreOfMass();
    const center = fromOcPnt(centerPnt);
    centerPnt.delete();
    properties.delete();
    return center;
  }

  /**
   * Extract the outer wire of this face. Deletes the face.
   * @see outerWire — functional equivalent in faceFns.ts (does not dispose input)
   */
  outerWire(): Wire {
    const newVal = new Wire(this.oc.BRepTools.OuterWire(this.wrapped));
    this.delete();
    return newVal;
  }

  /**
   * Extract the inner (hole) wires of this face. Deletes the face.
   * @see innerWires — functional equivalent in faceFns.ts (does not dispose input)
   */
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
    const r = gcWithScope();

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

/**
 * Abstract base for three-dimensional shapes (Shell, Solid, CompSolid, Compound).
 *
 * Provides boolean operations (fuse, cut, intersect), shell, fillet, and chamfer.
 *
 * @see fuseShapes — functional replacement for fuse()
 * @see cutShape — functional replacement for cut()
 */
export class _3DShape<Type extends OcShape = OcShape> extends Shape<Type> {
  /**
   * Builds a new shape out of the two fused shapes.
   *
   * @deprecated Use fuseShapes() instead.
   * @category Shape Modifications
   */
  fuse(
    other: Shape3D,
    { optimisation = 'none', simplify = false }: BooleanOperationOptions = {}
  ): Result<Shape3D> {
    const r = gcWithScope();
    const progress = r(new this.oc.Message_ProgressRange_1());
    const newBody = r(new this.oc.BRepAlgoAPI_Fuse_3(this.wrapped, other.wrapped, progress));
    _applyGlue(newBody, optimisation);

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
   * @deprecated Use cutShape() instead.
   * @category Shape Modifications
   */
  cut(
    tool: Shape3D,
    { optimisation = 'none', simplify = false }: BooleanOperationOptions = {}
  ): Result<Shape3D> {
    const r = gcWithScope();
    const progress = r(new this.oc.Message_ProgressRange_1());
    const cutter = r(new this.oc.BRepAlgoAPI_Cut_3(this.wrapped, tool.wrapped, progress));
    _applyGlue(cutter, optimisation);
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
   * @deprecated Use intersectShapes() instead.
   * @category Shape Modifications
   */
  intersect(tool: AnyShape, { simplify = false }: { simplify?: boolean } = {}): Result<Shape3D> {
    const r = gcWithScope();
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

    const r = gcWithScope();

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
    const r = gcWithScope();

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
    const r = gcWithScope();

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

/** A connected set of faces forming a surface (open or closed). */
export class Shell extends _3DShape {}
/** A closed volume bounded by a shell. The most common 3D shape type. */
export class Solid extends _3DShape {}
/** A composite solid — a set of solids that share common faces. */
export class CompSolid extends _3DShape {}
/** A heterogeneous collection of shapes grouped together. */
export class Compound extends _3DShape {}

// ---------------------------------------------------------------------------
// Local isShape3D (avoids circular reference to cast.ts for internal use)
// ---------------------------------------------------------------------------

/** Type guard: return true if the shape is a 3D body (Shell, Solid, CompSolid, or Compound). */
export function isShape3D(shape: AnyShape): shape is Shape3D {
  return (
    shape instanceof Shell ||
    shape instanceof Solid ||
    shape instanceof CompSolid ||
    shape instanceof Compound
  );
}

// ---------------------------------------------------------------------------
// Re-export boolean operations from shapeBooleans.ts
// ---------------------------------------------------------------------------

export {
  _fuseAll as fuseAll,
  _cutAll as cutAll,
  _buildCompound as buildCompound,
  _buildCompoundOc as buildCompoundOc,
  _applyGlue as applyGlue,
  _registerQueryModule as registerQueryModule,
};
