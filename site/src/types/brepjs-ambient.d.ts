/**
 * AUTO-GENERATED — do not edit manually.
 * Run `npm run generate-types` to regenerate from brepjs package types.
 *
 * Ambient type declarations for brepjs functions available in the playground.
 * These are injected onto globalThis in the web worker, so user code can
 * use them without imports.
 */

/** @internal */ declare abstract class Finder<Type, FilterType> {}
/** @internal */ declare abstract class Finder3d<Type> extends Finder<Type, AnyShape> {}
/** @internal */ interface BlueprintLike {}
/** @internal */ declare abstract class PhysicalProperties {}
/**
 * Return the singleton kernel adapter.
 *
 * @throws If the kernel has not been initialised via {@link initFromOC}.
 */
declare function getKernel(): KernelAdapter;

/** Initialise the brepjs kernel from a loaded OpenCascade WASM instance. */
declare function initFromOC(oc: any): void;

interface Ok<T> {
    readonly ok: true;
    readonly value: T;
}

interface Err<E> {
    readonly ok: false;
    readonly error: E;
}

type Result<T, E = BrepError> = Ok<T> | Err<E>;

type Unit = undefined;

declare function ok<T>(value: T): Ok<T>;

declare function err<E>(error: E): Err<E>;

declare const OK: Ok<Unit>;

declare function isOk<T, E>(result: Result<T, E>): result is Ok<T>;

declare function isErr<T, E>(result: Result<T, E>): result is Err<E>;

declare function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E>;

declare function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F>;

declare function andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E>;

/** Alias for andThen */
declare const flatMap: typeof andThen;

declare function unwrap<T, E>(result: Result<T, E>): T;

declare function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T;

declare function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T;

declare function unwrapErr<T, E>(result: Result<T, E>): E;

declare function match<T, E, U>(result: Result<T, E>, handlers: {
    ok: (value: T) => U;
    err: (error: E) => U;
}): U;

/**
 * Collects an array of Results into a Result of an array.
 * Short-circuits on the first Err.
 */
declare function collect<T, E>(results: Result<T, E>[]): Result<T[], E>;

/**
 * Wraps a throwing function into a Result.
 * The mapError function converts the caught exception into the error type.
 */
declare function tryCatch<T, E>(fn: () => T, mapError: (error: unknown) => E): Result<T, E>;

/**
 * Wraps an async throwing function into a Result.
 * The mapError function converts the caught exception into the error type.
 */
declare function tryCatchAsync<T, E>(fn: () => Promise<T>, mapError: (error: unknown) => E): Promise<Result<T, E>>;

/** A chainable pipeline that short-circuits on the first Err. */
interface ResultPipeline<T, E> {
    /** Chain a Result-returning transform. Short-circuits on Err. */
    then<U>(fn: (value: T) => Result<U, E>): ResultPipeline<U, E>;
    /** Extract the final Result. */
    readonly result: Result<T, E>;
}

/**
 * Create a chainable pipeline from a value or Result.
 *
 * ```ts
 * pipeline(shape)
 *   .then(s => fillet(s, edges, 2))
 *   .then(s => shell(s, [topFace], 1))
 *   .result  // → Result<Shape3D>
 * ```
 */
declare function pipeline<T, E = BrepError>(input: T | Result<T, E>): ResultPipeline<T, E>;

/**
 * Wrap a kernel call that returns an any, automatically casting
 * the result into a branded AnyShape. On exception, returns an Err
 * with the given error code and message.
 */
declare function kernelCall(fn: () => any, code: string, message: string, kind?: BrepErrorKind): Result<AnyShape>;

/**
 * Wrap a kernel call that returns an arbitrary value. On exception,
 * returns an Err with the given error code and message.
 */
declare function kernelCallRaw<T>(fn: () => T, code: string, message: string, kind?: BrepErrorKind): Result<T>;

/**
 * Bug / panic helper — these throw and should never be caught in normal code.
 * Lives in utils (Layer 0) so it can be used by all layers including kernel.
 */
/** Error thrown for invariant violations / programmer bugs (should never be caught). */
declare class BrepBugError extends Error {
    readonly location: string;
    constructor(location: string, message: string);
}

/**
 * Throws a BrepBugError for invariant violations / programmer errors.
 * Equivalent to Rust's panic!() — should never be caught in normal code.
 */
declare function bug(location: string, message: string): never;

/** High-level category for a brepjs error. */
type BrepErrorKind = 'OCCT_OPERATION' | 'VALIDATION' | 'TYPE_CAST' | 'SKETCHER_STATE' | 'MODULE_INIT' | 'COMPUTATION' | 'IO' | 'QUERY';

/**
 * Typed string constants for all known brepjs error codes, grouped by category.
 *
 * Use these instead of raw strings so that typos are caught at compile time.
 */
declare const BrepErrorCode: {
    readonly BSPLINE_FAILED: "BSPLINE_FAILED";
    readonly FACE_BUILD_FAILED: "FACE_BUILD_FAILED";
    readonly SWEEP_FAILED: "SWEEP_FAILED";
    readonly LOFT_FAILED: "LOFT_FAILED";
    readonly FUSE_FAILED: "FUSE_FAILED";
    readonly CUT_FAILED: "CUT_FAILED";
    readonly HEAL_NO_EFFECT: "HEAL_NO_EFFECT";
    readonly ELLIPSE_RADII: "ELLIPSE_RADII";
    readonly FUSE_ALL_EMPTY: "FUSE_ALL_EMPTY";
    readonly FILLET_NO_EDGES: "FILLET_NO_EDGES";
    readonly CHAMFER_NO_EDGES: "CHAMFER_NO_EDGES";
    readonly CHAMFER_ANGLE_NO_EDGES: "CHAMFER_ANGLE_NO_EDGES";
    readonly CHAMFER_ANGLE_BAD_DISTANCE: "CHAMFER_ANGLE_BAD_DISTANCE";
    readonly CHAMFER_ANGLE_BAD_ANGLE: "CHAMFER_ANGLE_BAD_ANGLE";
    readonly BEZIER_MIN_POINTS: "BEZIER_MIN_POINTS";
    readonly POLYGON_MIN_POINTS: "POLYGON_MIN_POINTS";
    readonly ZERO_LENGTH_EXTRUSION: "ZERO_LENGTH_EXTRUSION";
    readonly ZERO_TWIST_ANGLE: "ZERO_TWIST_ANGLE";
    readonly LOFT_EMPTY: "LOFT_EMPTY";
    readonly UNSUPPORTED_PROFILE: "UNSUPPORTED_PROFILE";
    readonly UNKNOWN_PLANE: "UNKNOWN_PLANE";
    readonly NULL_SHAPE_INPUT: "NULL_SHAPE_INPUT";
    readonly INVALID_FILLET_RADIUS: "INVALID_FILLET_RADIUS";
    readonly INVALID_CHAMFER_DISTANCE: "INVALID_CHAMFER_DISTANCE";
    readonly INVALID_THICKNESS: "INVALID_THICKNESS";
    readonly ZERO_OFFSET: "ZERO_OFFSET";
    readonly NO_EDGES: "NO_EDGES";
    readonly NO_FACES: "NO_FACES";
    readonly FUSE_NOT_3D: "FUSE_NOT_3D";
    readonly CUT_NOT_3D: "CUT_NOT_3D";
    readonly INTERSECT_NOT_3D: "INTERSECT_NOT_3D";
    readonly FUSE_ALL_NOT_3D: "FUSE_ALL_NOT_3D";
    readonly CUT_ALL_NOT_3D: "CUT_ALL_NOT_3D";
    readonly LOFT_NOT_3D: "LOFT_NOT_3D";
    readonly SWEEP_NOT_3D: "SWEEP_NOT_3D";
    readonly REVOLUTION_NOT_3D: "REVOLUTION_NOT_3D";
    readonly FILLET_NOT_3D: "FILLET_NOT_3D";
    readonly CHAMFER_NOT_3D: "CHAMFER_NOT_3D";
    readonly CHAMFER_ANGLE_NOT_3D: "CHAMFER_ANGLE_NOT_3D";
    readonly CHAMFER_ANGLE_FAILED: "CHAMFER_ANGLE_FAILED";
    readonly SHELL_NOT_3D: "SHELL_NOT_3D";
    readonly OFFSET_NOT_3D: "OFFSET_NOT_3D";
    readonly NULL_SHAPE: "NULL_SHAPE";
    readonly NO_WRAPPER: "NO_WRAPPER";
    readonly WELD_NOT_SHELL: "WELD_NOT_SHELL";
    readonly SOLID_BUILD_FAILED: "SOLID_BUILD_FAILED";
    readonly OFFSET_NOT_WIRE: "OFFSET_NOT_WIRE";
    readonly UNKNOWN_SURFACE_TYPE: "UNKNOWN_SURFACE_TYPE";
    readonly UNKNOWN_CURVE_TYPE: "UNKNOWN_CURVE_TYPE";
    readonly SWEEP_START_NOT_WIRE: "SWEEP_START_NOT_WIRE";
    readonly SWEEP_END_NOT_WIRE: "SWEEP_END_NOT_WIRE";
    readonly STEP_EXPORT_FAILED: "STEP_EXPORT_FAILED";
    readonly STEP_FILE_READ_ERROR: "STEP_FILE_READ_ERROR";
    readonly STL_EXPORT_FAILED: "STL_EXPORT_FAILED";
    readonly STL_FILE_READ_ERROR: "STL_FILE_READ_ERROR";
    readonly STEP_IMPORT_FAILED: "STEP_IMPORT_FAILED";
    readonly STL_IMPORT_FAILED: "STL_IMPORT_FAILED";
    readonly IGES_EXPORT_FAILED: "IGES_EXPORT_FAILED";
    readonly IGES_IMPORT_FAILED: "IGES_IMPORT_FAILED";
    readonly PARAMETER_NOT_FOUND: "PARAMETER_NOT_FOUND";
    readonly INTERSECTION_FAILED: "INTERSECTION_FAILED";
    readonly SELF_INTERSECTION_FAILED: "SELF_INTERSECTION_FAILED";
    readonly FINDER_NOT_UNIQUE: "FINDER_NOT_UNIQUE";
};
/** Union of all known error code string literals. */
type BrepErrorCode = (typeof BrepErrorCode)[keyof typeof BrepErrorCode];

/**
 * Structured error returned inside `Result<T>` on failure.
 *
 * Every error carries a `kind` (category), a machine-readable `code`,
 * and a human-readable `message`. Optional `cause` preserves the
 * original exception, and `metadata` holds extra context.
 */
interface BrepError {
    readonly kind: BrepErrorKind;
    readonly code: string;
    readonly message: string;
    readonly cause?: unknown;
    readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Create an error for a failed OCCT kernel operation. */
declare function occtError(code: string, message: string, cause?: unknown, metadata?: Record<string, unknown>): BrepError;

/** Create an error for invalid input parameters. */
declare function validationError(code: string, message: string, cause?: unknown, metadata?: Record<string, unknown>): BrepError;

/** Create an error for a failed shape type cast or conversion. */
declare function typeCastError(code: string, message: string, cause?: unknown, metadata?: Record<string, unknown>): BrepError;

/** Create an error for an invalid sketcher state transition. */
declare function sketcherStateError(code: string, message: string, cause?: unknown, metadata?: Record<string, unknown>): BrepError;

/** Create an error for a module initialisation failure. */
declare function moduleInitError(code: string, message: string, cause?: unknown, metadata?: Record<string, unknown>): BrepError;

/** Create an error for a failed geometric computation. */
declare function computationError(code: string, message: string, cause?: unknown, metadata?: Record<string, unknown>): BrepError;

/** Create an error for a file import/export failure. */
declare function ioError(code: string, message: string, cause?: unknown, metadata?: Record<string, unknown>): BrepError;

/** Create an error for a shape query failure (e.g. finder not unique). */
declare function queryError(code: string, message: string, cause?: unknown, metadata?: Record<string, unknown>): BrepError;

/** Maximum hash code value for OCCT shape hashing (2^31 - 1). */
declare const HASH_CODE_MAX = 2147483647;

/** Multiply degrees by this constant to convert to radians. */
declare const DEG2RAD: number;

/** Multiply radians by this constant to convert to degrees. */
declare const RAD2DEG: number;

/** Any object that can be cleaned up by calling `delete()` (OCCT WASM objects). */
interface Deletable {
    delete: () => void;
}

/**
 * Legacy Point type for backward compatibility.
 * Prefer using PointInput or Vec3 from types.ts.
 */
type Point = [number, number, number] | [number, number] | {
    XYZ: () => any;
    delete: () => void;
};

/** Check whether a value is a valid {@link Point} (tuple or OCCT point-like object). */
declare function isPoint(p: unknown): p is Point;

/**
 * Create or copy a {@link Plane}.
 *
 * When called with a `Plane` object, returns a shallow copy.
 * When called with a `PlaneName` string (or no arguments), resolves the named
 * plane with an optional origin offset.
 *
 * @param plane - A `Plane` object to copy, or a `PlaneName` string to resolve.
 * @param origin - Origin point or scalar offset along the plane normal.
 * @default plane `'XY'`
 */
declare function makePlane(plane: Plane): Plane;
declare function makePlane(plane?: PlaneName, origin?: PointInput | number): Plane;

/** Discriminant for the geometric type of a 3D curve. */
type CurveType = 'LINE' | 'CIRCLE' | 'ELLIPSE' | 'HYPERBOLA' | 'PARABOLA' | 'BEZIER_CURVE' | 'BSPLINE_CURVE' | 'OFFSET_CURVE' | 'OTHER_CURVE';

/**
 * Map an OCCT `GeomAbs_CurveType` enum value to its string discriminant.
 *
 * @returns `Ok<CurveType>` on success, or `Err` if the enum value is unrecognised.
 */
declare const findCurveType: (type: any) => Result<CurveType>;

/** String literal identifying a topological entity type for TopExp_Explorer iteration. */
type TopoEntity = 'vertex' | 'edge' | 'wire' | 'face' | 'shell' | 'solid' | 'solidCompound' | 'compound' | 'shape';

/** An OCCT shape after downcast — same underlying type, used for clarity. */
type GenericTopo = any;

/** Convert a TopoEntity string to its OCCT TopAbs_ShapeEnum value. */
declare const asTopo: (entity: TopoEntity) => any;

/**
 * Iterate over all sub-shapes of a given type within a shape.
 *
 * @remarks Uses the kernel adapter's iterShapes rather than direct TopExp_Explorer.
 */
declare const iterTopo: (shape: any, topo: TopoEntity) => IterableIterator<any>;

/** Get the TopAbs_ShapeEnum type of an OCCT shape, returning Err for null shapes. */
declare const shapeType: (shape: any) => Result<any>;

/**
 * Downcast a generic any to its concrete OCCT type (e.g., TopoDS_Face).
 *
 * @remarks WASM requires explicit downcasting via `oc.TopoDS.Face_1()` etc.
 * @returns Ok with the downcasted shape, or Err if the shape type is unknown.
 */
declare function downcast(shape: any): Result<GenericTopo>;

/**
 * Cast a raw OCCT shape to its corresponding branded brepjs type (Vertex, Edge, Face, etc.).
 *
 * Performs downcast + branded handle creation in one step.
 *
 * @returns Ok with a typed AnyShape, or Err if the shape type is unknown.
 */
declare function cast(shape: any): Result<AnyShape>;

/** Type guard: return true if the shape is a CompSolid. */
declare function isCompSolid(shape: AnyShape): shape is CompSolid;

/**
 * Deserialize a shape from a BREP string representation.
 *
 * @param data - BREP string produced by toBREP().
 * @returns Ok with the deserialized shape, or Err if parsing fails.
 */
declare function fromBREP(data: string): Result<AnyShape>;

/**
 * Applies glue optimization to a boolean operation.
 *
 * @param op - Boolean operation builder with SetGlue method
 * @param optimisation - Optimization level: 'none', 'commonFace', or 'sameFace'
 */
declare function applyGlue(op: {
    SetGlue(glue: any): void;
}, optimisation: 'none' | 'commonFace' | 'sameFace'): void;

/**
 * A chamfer radius specification.
 *
 * - A number for symmetric chamfer.
 * - Two distances for asymmetric chamfer (first distance for the selected face).
 * - A distance and angle for asymmetric chamfer.
 */
type ChamferRadius = number | {
    distances: [number, number];
    selectedFace: (f: FaceFinder) => FaceFinder;
} | {
    distance: number;
    angle: number;
    selectedFace: (f: FaceFinder) => FaceFinder;
};

/**
 * A generic way to define radii for fillet or chamfer operations.
 */
type RadiusConfig<R = number> = ((e: Edge) => R | null) | R | {
    filter: EdgeFinder;
    radius: R;
    keep?: boolean;
};

declare function isNumber(r: unknown): r is number;

declare function isChamferRadius(r: unknown): r is ChamferRadius;

declare function isFilletRadius(r: unknown): r is FilletRadius;

/** Interface for OCCT curve adaptors (BRepAdaptor_Curve / CompCurve). */
interface CurveLike {
    delete(): void;
    Value(v: number): any;
    IsPeriodic(): boolean;
    Period(): number;
    IsClosed(): boolean;
    FirstParameter(): number;
    LastParameter(): number;
    GetType?(): any;
    D1(v: number, p: any, vPrime: any): void;
}

/** Create a straight edge between two 3D points. */
declare const makeLine: (v1: Vec3, v2: Vec3) => Edge;

/** Create a circular edge with the given radius, center, and normal. */
declare const makeCircle: (radius: number, center?: Vec3, normal?: Vec3) => Edge;

/**
 * Create an elliptical edge with the given radii.
 *
 * @param xDir - Optional direction for the major axis.
 * @returns An error if `minorRadius` exceeds `majorRadius`.
 */
declare const makeEllipse: (majorRadius: number, minorRadius: number, center?: Vec3, normal?: Vec3, xDir?: Vec3) => Result<Edge>;

/**
 * Create a helical wire with the given pitch, height, and radius.
 *
 * @param pitch - Vertical distance per full turn.
 * @param lefthand - Wind the helix in the left-hand direction.
 */
declare const makeHelix: (pitch: number, height: number, radius: number, center?: Vec3, dir?: Vec3, lefthand?: boolean) => Wire;

/**
 * Create a circular arc edge passing through three points.
 *
 * @param v1 - Start point.
 * @param v2 - Mid point (on the arc).
 * @param v3 - End point.
 */
declare const makeThreePointArc: (v1: Vec3, v2: Vec3, v3: Vec3) => Edge;

/**
 * Create an elliptical arc edge between two angles.
 *
 * @param startAngle - Start angle in radians.
 * @param endAngle - End angle in radians.
 * @param xDir - Optional direction for the major axis.
 * @returns An error if `minorRadius` exceeds `majorRadius`.
 */
declare const makeEllipseArc: (majorRadius: number, minorRadius: number, startAngle: number, endAngle: number, center?: Vec3, normal?: Vec3, xDir?: Vec3) => Result<Edge>;

/** Configuration for {@link makeBSplineApproximation}. */
interface BSplineApproximationConfig {
    /** Maximum allowed distance between the curve and the input points. */
    tolerance?: number;
    /** Maximum B-spline degree. */
    degMax?: number;
    /** Minimum B-spline degree. */
    degMin?: number;
    /** Optional `[weight1, weight2, weight3]` smoothing weights, or `null` to disable. */
    smoothing?: null | [number, number, number];
}

/**
 * Create a B-spline edge that approximates a set of 3D points.
 *
 * @returns An error if the OCCT approximation algorithm fails.
 */
declare const makeBSplineApproximation: (points: Vec3[], { tolerance, smoothing, degMax, degMin }?: BSplineApproximationConfig) => Result<Edge>;

/**
 * Create a Bezier curve edge from control points.
 *
 * @param points - Two or more control points defining the curve.
 * @returns Ok with the edge, or Err if fewer than 2 points are provided.
 */
declare const makeBezierCurve: (points: Vec3[]) => Result<Edge>;

/**
 * Create a circular arc edge tangent to a direction at the start point.
 *
 * @param startTgt - Tangent direction at the start point.
 */
declare const makeTangentArc: (startPoint: Vec3, startTgt: Vec3, endPoint: Vec3) => Edge;

/**
 * Assemble edges and/or wires into a single connected wire.
 *
 * @returns An error if the edges cannot form a valid wire (e.g. disconnected).
 */
declare const assembleWire: (listOfEdges: (Edge | Wire)[]) => Result<Wire>;

/**
 * Create a planar face from a closed wire, optionally with hole wires.
 *
 * @returns An error if the wire is non-planar or the face cannot be built.
 */
declare const makeFace: (wire: Wire, holes?: Wire[]) => Result<Face>;

/**
 * Create a face bounded by a wire on an existing face's underlying surface.
 *
 * @param originFace - Face whose surface geometry is reused.
 * @param wire - Wire that defines the boundary on that surface.
 */
declare const makeNewFaceWithinFace: (originFace: Face, wire: Wire) => Face;

/**
 * Create a non-planar face from a wire using surface filling.
 *
 * @returns An error if the filling algorithm fails to produce a face.
 */
declare const makeNonPlanarFace: (wire: Wire) => Result<Face>;

/**
 * Creates a cylinder with the given radius and height.
 *
 * @category Solids
 */
declare const makeCylinder: (radius: number, height: number, location?: Vec3, direction?: Vec3) => Solid;

/**
 * Creates a sphere with the given radius.
 *
 * @category Solids
 */
declare const makeSphere: (radius: number) => Solid;

/**
 * Creates a cone (or frustum) with the given radii and height.
 *
 * @category Solids
 */
declare const makeCone: (radius1: number, radius2: number, height: number, location?: Vec3, direction?: Vec3) => Solid;

/**
 * Creates a torus with the given major and minor radii.
 *
 * @category Solids
 */
declare const makeTorus: (majorRadius: number, minorRadius: number, location?: Vec3, direction?: Vec3) => Solid;

/**
 * Creates an ellipsoid with the given axis lengths.
 *
 * @category Solids
 */
declare const makeEllipsoid: (aLength: number, bLength: number, cLength: number) => Solid;

/**
 * Creates a box with the given corner points.
 *
 * @category Solids
 */
declare const makeBox: (corner1: Vec3, corner2: Vec3) => Solid;

/** Create a vertex at a 3D point. */
declare const makeVertex: (point: Vec3) => Vertex;

/**
 * Create an offset shape from a face.
 *
 * @param offset - Signed offset distance (positive = outward).
 * @param tolerance - Geometric tolerance for the offset algorithm.
 * @returns An error if the result is not a valid 3D shape.
 */
declare const makeOffset: (face: Face, offset: number, tolerance?: number) => Result<Shape3D>;

/**
 * Build a compound from multiple shapes.
 *
 * @param shapeArray - Shapes to group into a single compound.
 * @returns A new Compound containing all input shapes.
 */
declare const makeCompound: (shapeArray: AnyShape[]) => Compound;

/**
 * Welds faces and shells into a single shell.
 *
 * @param facesOrShells - An array of faces and shells to be welded.
 * @param ignoreType - If true, the function will not check if the result is a shell.
 * @returns A shell that contains all the faces and shells.
 */
declare function weldShellsAndFaces(facesOrShells: Array<Face | Shell>, ignoreType?: boolean): Result<Shell>;

/**
 * Welds faces and shells into a single shell and then makes a solid.
 *
 * @param facesOrShells - An array of faces and shells to be welded.
 * @returns A solid that contains all the faces and shells.
 *
 * @category Solids
 */
declare function makeSolid(facesOrShells: Array<Face | Shell>): Result<Solid>;

/**
 * Add hole wires to an existing face.
 *
 * Orientation of the holes is automatically fixed.
 */
declare const addHolesInFace: (face: Face, holes: Wire[]) => Face;

/**
 * Create a polygonal face from three or more coplanar points.
 *
 * @returns An error if fewer than 3 points are provided or the face cannot be built.
 */
declare const makePolygon: (points: Vec3[]) => Result<Face>;

/**
 * Extrude a face along a vector to produce a solid (OOP API).
 *
 * @param face - The planar face to extrude.
 * @param extrusionVec - Direction and magnitude of the extrusion.
 * @returns A new {@link Solid} created by the linear extrusion.
 *
 * @see {@link extrudeFns!extrude | extrude} for the functional API equivalent.
 */
declare const basicFaceExtrusion: (face: Face, extrusionVec: PointInput) => Solid;

/**
 * Revolve a face around an axis to create a solid of revolution (OOP API).
 *
 * @param face - The face to revolve.
 * @param center - A point on the rotation axis. Defaults to the origin.
 * @param direction - Direction vector of the rotation axis. Defaults to Z-up.
 * @param angle - Rotation angle in degrees (0-360). Defaults to a full revolution.
 * @returns `Result` containing the revolved 3D shape, or an error if the result is not 3D.
 *
 * @see {@link extrudeFns!revolve | revolve} for the functional API equivalent.
 */
declare const revolution: (face: Face, center?: PointInput, direction?: PointInput, angle?: number) => Result<Shape3D>;

declare function genericSweep(wire: Wire, spine: Wire, sweepConfig: GenericSweepConfig, shellMode: true): Result<[Shape3D, Wire, Wire]>;
declare function genericSweep(wire: Wire, spine: Wire, sweepConfig: GenericSweepConfig, shellMode?: false): Result<Shape3D>;

/** Disposable handle wrapping an XCAF document for STEP assembly export. */
type AssemblyExporter = OcHandle<any>;

/**
 * Create an XCAF assembly document from a list of shape configurations.
 *
 * Each shape is added as a named, colored node in the XCAF document tree.
 * The returned {@link AssemblyExporter} wraps the live `TDocStd_Document` and
 * must be deleted after use to avoid memory leaks.
 *
 * @returns An {@link AssemblyExporter} wrapping the XCAF document.
 *
 * @see {@link exportSTEP} which calls this internally to produce a STEP blob.
 */
declare function createAssembly(shapes?: ShapeConfig[]): AssemblyExporter;

/** A 2D point or vector represented as an `[x, y]` tuple. */
type Point2D = [number, number];

/**
 * Axis-aligned 2D bounding box backed by an OCCT `Bnd_Box2d`.
 *
 * Provides bounds queries, containment tests, and union operations for
 * spatial indexing of 2D geometry.
 */
declare class BoundingBox2d {
    private readonly _wrapped;
    private _deleted;
    constructor(wrapped?: any);
    get wrapped(): any;
    delete(): void;
    /** Return a human-readable string of the form `(xMin,yMin) - (xMax,yMax)`. */
    get repr(): string;
    /** Return the `[min, max]` corner points of the bounding box. */
    get bounds(): [Point2D, Point2D];
    /** Return the center point of the bounding box. */
    get center(): Point2D;
    /** Return the width (x-extent) of the bounding box. */
    get width(): number;
    /** Return the height (y-extent) of the bounding box. */
    get height(): number;
    /**
     * Return a point guaranteed to lie outside the bounding box.
     *
     * @param paddingPercent - Extra padding as a percentage of the box dimensions.
     */
    outsidePoint(paddingPercent?: number): Point2D;
    /** Expand this bounding box to include `other`. */
    add(other: BoundingBox2d): void;
    /** Test whether this bounding box and `other` are completely disjoint. */
    isOut(other: BoundingBox2d): boolean;
    /** Test whether the given point lies inside (or on the boundary of) this box. */
    containsPoint(other: Point2D): boolean;
}

/** Create an OCCT `gp_Ax2d` (2D axis) from a point and a direction. */
declare const axis2d: (point: Point2D, direction: Point2D) => any;

/**
 * Handle-wrapped 2D parametric curve backed by an OCCT `Geom2d_Curve`.
 *
 * Provides evaluation, splitting, projection, tangent queries, and distance
 * computations on a single parametric curve.
 */
declare class Curve2D {
    private readonly _wrapped;
    private _deleted;
    _boundingBox: null | BoundingBox2d;
    private _firstPoint;
    private _lastPoint;
    constructor(handle: any);
    get wrapped(): any;
    delete(): void;
    /** Compute (and cache) the 2D bounding box of this curve. */
    get boundingBox(): BoundingBox2d;
    /** Return a human-readable representation, e.g. `LINE (0,0) - (1,1)`. */
    get repr(): string;
    /** Access the underlying OCCT `Geom2d_Curve` (unwrapped from its handle). */
    get innerCurve(): any;
    /** Serialize this curve to a string that can be restored with {@link deserializeCurve2D}. */
    serialize(): string;
    /** Evaluate the curve at the given parameter, returning the 2D point. */
    value(parameter: number): Point2D;
    /** Return the point at the start of the curve (cached after first access). */
    get firstPoint(): Point2D;
    /** Return the point at the end of the curve (cached after first access). */
    get lastPoint(): Point2D;
    /** Return the parameter value at the start of the curve. */
    get firstParameter(): number;
    /** Return the parameter value at the end of the curve. */
    get lastParameter(): number;
    /** Create a `Geom2dAdaptor_Curve` for algorithmic queries (caller must delete). */
    adaptor(): any;
    /** Return the geometric type of this curve (e.g. `LINE`, `CIRCLE`, `BSPLINE_CURVE`). */
    get geomType(): CurveType;
    /** Create an independent deep copy of this curve. */
    clone(): Curve2D;
    /** Reverse the orientation of this curve in place. */
    reverse(): void;
    private distanceFromPoint;
    private distanceFromCurve;
    /** Compute the minimum distance from this curve to a point or another curve. */
    distanceFrom(element: Curve2D | Point2D): number;
    /** Test whether a point lies on the curve within a tight tolerance (1e-9). */
    isOnCurve(point: Point2D): boolean;
    /**
     * Project a point onto the curve and return its parameter value.
     *
     * @returns `Ok(parameter)` when the point is on the curve, or an error result otherwise.
     */
    parameter(point: Point2D, precision?: number): Result<number>;
    /**
     * Compute the tangent vector at a parameter position or at the projection of a point.
     *
     * @param index - A normalized parameter (0..1) or a Point2D to project onto the curve.
     */
    tangentAt(index: number | Point2D): Point2D;
    /**
     * Split this curve at the given points or parameter values.
     *
     * @returns An array of sub-curves whose union covers the original curve.
     */
    splitAt(points: Point2D[] | number[], precision?: number): Curve2D[];
}

/**
 * Groups an array of blueprints such that blueprints that correspond to holes
 * in other blueprints are set in a `CompoundBlueprint`.
 *
 * The current algorithm does not handle cases where blueprints cross each
 * other
 */
declare const organiseBlueprints: (blueprints: Blueprint[]) => Blueprints;

/** Plain data returned by blueprint sketchOnPlane/sketchOnFace (Layer 2).
 *  Layer 3 wraps this in a Sketch class. */
interface SketchData {
    wire: Wire;
    defaultOrigin?: Vec3;
    defaultDirection?: Vec3;
    baseFace?: Face | null;
}

interface DrawingInterface {
    clone(): DrawingInterface;
    boundingBox: BoundingBox2d;
    stretch(ratio: number, direction: Point2D, origin: Point2D): DrawingInterface;
    rotate(angle: number, center: Point2D): DrawingInterface;
    translate(xDist: number, yDist: number): DrawingInterface;
    translate(translationVector: Point2D): DrawingInterface;
    /**
     * Returns the mirror image of this drawing made with a single point (in
     * center mode, the default, or a plane, (plane mode, with both direction and
     * origin of the plane).
     */
    mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): DrawingInterface;
    /**
     * Returns sketch data for the drawing on a plane.
     */
    sketchOnPlane(inputPlane?: PlaneName | Plane, origin?: PointInput | number): SketchData | SketchData[] | (SketchData | SketchData[])[];
    /**
     * Returns sketch data for the drawing on a face.
     *
     * The scale mode corresponds to the way the coordinates of the drawing are
     * interpreted match with the face:
     *
     * - `original` uses global coordinates (1mm in the drawing is 1mm on the
     *   face). This is the default, but currently supported only for planar
     *   and circular faces
     * - `bounds` normalises the UV parameters on the face to [0,1] intervals.
     * - `native` uses the default UV parameters of opencascade
     */
    sketchOnFace(face: Face, scaleMode: ScaleMode): SketchData | SketchData[] | (SketchData | SketchData[])[];
    /**
     * Formats the drawing as an SVG image
     */
    toSVG(margin: number): string;
    /**
     * Returns the SVG viewbox that corresponds to this drawing
     */
    toSVGViewBox(margin?: number): string;
    /**
     * Formats the drawing as a list of SVG paths
     */
    toSVGPaths(): string[] | string[][];
}

/**
 * Create a regular polygon blueprint inscribed in a circle of the given radius.
 *
 * @param radius - Circumscribed circle radius.
 * @param sidesCount - Number of sides (3 = triangle, 6 = hexagon, etc.).
 * @param sagitta - When non-zero, sides are replaced by sagitta arcs (bulge height).
 * @returns A closed Blueprint representing the polygon.
 *
 * @example
 * ```ts
 * const hexagon = polysidesBlueprint(10, 6);
 * const roundedTriangle = polysidesBlueprint(10, 3, 2);
 * ```
 */
declare const polysidesBlueprint: (radius: number, sidesCount: number, sagitta?: number) => Blueprint;

/**
 * Create an axis-aligned rectangle blueprint with optional rounded corners.
 *
 * The rectangle is centered at the origin. When `r` is zero the corners
 * are sharp; otherwise they are filleted with circular or elliptical arcs.
 *
 * @param width - Total width of the rectangle.
 * @param height - Total height of the rectangle.
 * @param r - Corner radius. Pass a number for uniform rounding, or
 *   `{ rx, ry }` for elliptical corners. Clamped to half the respective
 *   dimension.
 * @returns A closed Blueprint representing the rectangle.
 *
 * @example
 * ```ts
 * const sharp = roundedRectangleBlueprint(20, 10);
 * const rounded = roundedRectangleBlueprint(20, 10, 3);
 * const elliptical = roundedRectangleBlueprint(20, 10, { rx: 4, ry: 2 });
 * ```
 */
declare const roundedRectangleBlueprint: (width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}) => Blueprint;

/**
 * Compute the boolean union of two simple blueprints.
 *
 * Segments each blueprint at their intersection points, discards segments
 * inside the other shape, and reassembles the remaining curves.
 *
 * @param first - First blueprint operand.
 * @param second - Second blueprint operand.
 * @returns The fused outline, a {@link Blueprints} if the result is
 *   disjoint, or `null` if the operation produces no geometry.
 *
 * @remarks Both blueprints must be closed. For compound or multi-blueprint
 * inputs, use {@link fuse2D} instead.
 */
declare const fuseBlueprints: (first: Blueprint, second: Blueprint) => null | Blueprint | Blueprints;

/**
 * Compute the boolean difference of two simple blueprints (first minus second).
 *
 * Segments the blueprints at their intersections, keeps segments of the first
 * that are outside the second, and segments of the second that are inside the
 * first (reversed to form the boundary of the cut).
 *
 * @param first - Base blueprint to cut from.
 * @param second - Tool blueprint to subtract.
 * @returns The remaining outline, or `null` if nothing remains.
 *
 * @remarks Both blueprints must be closed. For compound inputs use {@link cut2D}.
 */
declare const cutBlueprints: (first: Blueprint, second: Blueprint) => null | Blueprint | Blueprints;

/**
 * Compute the boolean intersection of two simple blueprints.
 *
 * Keeps only the segments of each blueprint that lie inside the other,
 * producing the overlapping region.
 *
 * @param first - First blueprint operand.
 * @param second - Second blueprint operand.
 * @returns The intersection outline, or `null` if the blueprints do not overlap.
 *
 * @remarks Both blueprints must be closed. For compound inputs use {@link intersect2D}.
 */
declare const intersectBlueprints: (first: Blueprint, second: Blueprint) => null | Blueprint | Blueprints;

/**
 * Union type for all 2D shape representations, including `null` for empty results.
 *
 * Used throughout the 2D boolean API as both input and output of operations.
 */
type Shape2D = Blueprint | Blueprints | CompoundBlueprint | null;

/**
 * Compute the boolean union of two 2D shapes.
 *
 * Handles all combinations of {@link Blueprint}, {@link CompoundBlueprint},
 * {@link Blueprints}, and `null`. When both inputs are simple blueprints the
 * operation delegates to {@link fuseBlueprints}; compound and multi-blueprint
 * cases are decomposed recursively.
 *
 * @param first - First operand (or `null` for empty).
 * @param second - Second operand (or `null` for empty).
 * @returns The fused shape, or `null` if both operands are empty.
 *
 * @example
 * ```ts
 * const union = fuse2D(circleBlueprint, squareBlueprint);
 * ```
 *
 * @see {@link fuseBlueprint2D} for the functional API wrapper.
 */
declare const fuse2D: (first: Shape2D, second: Shape2D) => Blueprint | Blueprints | CompoundBlueprint | null;

/**
 * Compute the boolean difference of two 2D shapes (first minus second).
 *
 * Removes the region covered by `second` from `first`. When the tool is fully
 * inside the base, the result is a {@link CompoundBlueprint} (base with a
 * hole).
 *
 * @param first - Base shape to cut from.
 * @param second - Tool shape to subtract.
 * @returns The remaining shape, or `null` if nothing remains.
 *
 * @example
 * ```ts
 * const withHole = cut2D(outerRect, innerCircle);
 * ```
 *
 * @see {@link cutBlueprint2D} for the functional API wrapper.
 */
declare const cut2D: (first: Shape2D, second: Shape2D) => Blueprint | Blueprints | CompoundBlueprint | null;

/**
 * Compute the boolean intersection of two 2D shapes.
 *
 * Returns only the region common to both shapes. Compound and multi-blueprint
 * operands are decomposed recursively, with holes handled via complementary
 * cut operations.
 *
 * @param first - First operand.
 * @param second - Second operand.
 * @returns The intersection shape, or `null` if the shapes do not overlap.
 *
 * @example
 * ```ts
 * const overlap = intersect2D(circle, rectangle);
 * ```
 *
 * @see {@link intersectBlueprint2D} for the functional API wrapper.
 */
declare function intersect2D(first: Shape2D, second: Shape2D): Blueprint | Blueprints | CompoundBlueprint | null;

/** How to map 2D sketch coordinates onto a face's parametric UV space. */
type ScaleMode = 'original' | 'bounds' | 'native';

/**
 * Return a reversed copy of the curve (non-mutating).
 *
 * @returns A new `Curve2D` with swapped start/end orientation.
 */
declare function reverseCurve(curve: Curve2D): Curve2D;

/** Get the bounding box of a 2D curve. */
declare function curve2dBoundingBox(curve: Curve2D): BoundingBox2d;

/** Get the first point of a 2D curve. */
declare function curve2dFirstPoint(curve: Curve2D): Point2D;

/** Get the last point of a 2D curve. */
declare function curve2dLastPoint(curve: Curve2D): Point2D;

/**
 * Split a curve at the given parameters or points.
 *
 * @param params - Parameter values or `Point2D` locations at which to split.
 * @returns An ordered array of sub-curves covering the original curve.
 */
declare function curve2dSplitAt(curve: Curve2D, params: Point2D[] | number[], precision?: number): Curve2D[];

/**
 * Find the parameter on the curve closest to the given point.
 *
 * @returns `Ok(parameter)` when the point is on the curve, or an error result.
 */
declare function curve2dParameter(curve: Curve2D, point: Point2D, precision?: number): Result<number>;

/**
 * Get the tangent vector at a parameter position on the curve.
 *
 * @param param - A normalized parameter (0..1) or a `Point2D` to project onto the curve.
 */
declare function curve2dTangentAt(curve: Curve2D, param: number | Point2D): Point2D;

/** Check if a point lies on the curve. */
declare function curve2dIsOnCurve(curve: Curve2D, point: Point2D): boolean;

/** Compute the distance from a point to the curve. */
declare function curve2dDistanceFrom(curve: Curve2D, point: Point2D): number;

/**
 * Create a new Blueprint from an ordered array of 2D curves.
 *
 * @see {@link Blueprint} constructor.
 */
declare function createBlueprint(curves: Blueprint['curves']): Blueprint;

/**
 * Get the axis-aligned bounding box of a blueprint.
 *
 * @see {@link Blueprint.boundingBox}
 */
declare function blueprintBoundingBox(bp: Blueprint): BoundingBox2d;

/**
 * Get the winding direction of a blueprint (`'clockwise'` or `'counterClockwise'`).
 *
 * @see {@link Blueprint.orientation}
 */
declare function blueprintOrientation(bp: Blueprint): 'clockwise' | 'counterClockwise';

/**
 * Translate a blueprint by the given x and y distances.
 *
 * @returns A new translated Blueprint.
 * @see {@link Blueprint.translate}
 */
declare function translateBlueprint(bp: Blueprint, dx: number, dy: number): Blueprint;

/**
 * Rotate a blueprint by the given angle in degrees.
 *
 * @param center - Center of rotation (defaults to the origin).
 * @returns A new rotated Blueprint.
 * @see {@link Blueprint.rotate}
 */
declare function rotateBlueprint(bp: Blueprint, angle: number, center?: Point2D): Blueprint;

/**
 * Uniformly scale a blueprint by a factor around a center point.
 *
 * @param center - Center of scaling (defaults to the bounding box center).
 * @returns A new scaled Blueprint.
 * @see {@link Blueprint.scale}
 */
declare function scaleBlueprint(bp: Blueprint, factor: number, center?: Point2D): Blueprint;

/**
 * Mirror a blueprint across a point or plane.
 *
 * @param mode - `'center'` for point symmetry, `'plane'` for reflection across an axis.
 * @returns A new mirrored Blueprint.
 * @see {@link Blueprint.mirror}
 */
declare function mirrorBlueprint(bp: Blueprint, centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): Blueprint;

/**
 * Stretch a blueprint along a direction by a given ratio.
 *
 * @returns A new stretched Blueprint.
 * @see {@link Blueprint.stretch}
 */
declare function stretchBlueprint(bp: Blueprint, ratio: number, direction: Point2D, origin?: Point2D): Blueprint;

/**
 * Convert a blueprint to an SVG path `d` attribute string.
 *
 * @see {@link Blueprint.toSVGPathD}
 */
declare function blueprintToSVGPathD(bp: Blueprint): string;

/**
 * Test whether a 2D point lies strictly inside the blueprint.
 *
 * @returns `true` if the point is inside (boundary points return `false`).
 * @see {@link Blueprint.isInside}
 */
declare function blueprintIsInside(bp: Blueprint, point: Point2D): boolean;

/**
 * Project a blueprint onto a 3D plane, producing sketch data.
 *
 * @see {@link Blueprint.sketchOnPlane}
 */
declare function sketchBlueprintOnPlane(bp: Blueprint, inputPlane?: PlaneName | Plane, origin?: PointInput | number): any;

/**
 * Map a blueprint onto a 3D face's UV surface, producing sketch data.
 *
 * @see {@link Blueprint.sketchOnFace}
 */
declare function sketchBlueprintOnFace(bp: Blueprint, face: Face, scaleMode?: ScaleMode): any;

/**
 * Compute the boolean union of two 2D shapes.
 *
 * @returns The fused shape, or `null` if the result is empty.
 * @see {@link fuse2D}
 *
 * @example
 * ```ts
 * const union = fuseBlueprint2D(circle, rectangle);
 * ```
 */
declare function fuseBlueprint2D(a: Blueprint | CompoundBlueprint | Blueprints, b: Blueprint | CompoundBlueprint | Blueprints): Shape2D;

/**
 * Compute the boolean difference of two 2D shapes (base minus tool).
 *
 * @param base - The shape to cut from.
 * @param tool - The shape to subtract.
 * @returns The remaining shape, or `null` if nothing remains.
 * @see {@link cut2D}
 *
 * @example
 * ```ts
 * const withHole = cutBlueprint2D(outerRect, innerCircle);
 * ```
 */
declare function cutBlueprint2D(base: Blueprint | CompoundBlueprint | Blueprints, tool: Blueprint | CompoundBlueprint | Blueprints): Shape2D;

/**
 * Compute the boolean intersection of two 2D shapes.
 *
 * @returns The overlapping region, or `null` if the shapes do not overlap.
 * @see {@link intersect2D}
 *
 * @example
 * ```ts
 * const overlap = intersectBlueprint2D(circle, rectangle);
 * ```
 */
declare function intersectBlueprint2D(a: Blueprint | CompoundBlueprint | Blueprints, b: Blueprint | CompoundBlueprint | Blueprints): Shape2D;

/** A junction between two consecutive curves in a 2D profile. */
type Corner = {
    /** The curve arriving at the corner point. */
    firstCurve: Curve2D;
    /** The curve departing from the corner point. */
    secondCurve: Curve2D;
    /** The shared endpoint where the two curves meet. */
    point: Point2D;
};

/**
 * Input that resolves to a single face — a direct Face, a FaceFinder/FaceFinderFn,
 * or a finder callback.
 */
type SingleFace = Face | FaceFinder | FaceFinderFn | ((f: FaceFinderFn) => FaceFinderFn) | ((f: FaceFinder) => FaceFinder);

/** Resolve a {@link SingleFace} input to a concrete Face from the given shape. */
declare function getSingleFace(f: SingleFace, shape: AnyShape): Result<Face>;

/** Element + normal pair passed to each finder filter function. */
type FilterFcn<Type> = {
    element: Type;
    normal: Vec3 | null;
};

/**
 * Combine a set of finder filters (defined with radius) to pass as a filter
 * function.
 *
 * @param filters - An array of objects containing a filter and its radius.
 * @returns A tuple containing a filter function and a cleanup function.
 *
 * @category Finders
 */
declare const combineFinderFilters: <Type, T, R = number>(filters: {
    filter: Finder<Type, T>;
    radius: R;
}[]) => [(v: Type) => R | null, () => void];

/**
 * Export a ShapeMesh as a Wavefront OBJ string.
 *
 * Produces vertices (`v`), normals (`vn`), and face indices (`f`) with
 * OBJ's 1-based indexing. When `faceGroups` are present, each group
 * becomes a named OBJ group (`g face_<id>`).
 *
 * @param mesh - Triangulated mesh from `mesh()`.
 * @returns A Wavefront OBJ string ready to save as a `.obj` file.
 *
 * @example
 * ```ts
 * const mesh = mesh(solid);
 * const objString = exportOBJ(mesh);
 * ```
 */
declare function exportOBJ(mesh: ShapeMesh): string;

/**
 * PBR material definition for glTF export.
 *
 * Maps to the glTF 2.0 `pbrMetallicRoughness` material model.
 * Assign instances to face IDs via {@link GltfExportOptions.materials}.
 */
interface GltfMaterial {
    name?: string;
    /** RGBA base color factor, each component 0–1. Default: [0.8, 0.8, 0.8, 1.0] */
    baseColor?: [number, number, number, number];
    /** Metallic factor 0–1. Default: 0 */
    metallic?: number;
    /** Roughness factor 0–1. Default: 0.5 */
    roughness?: number;
}

/**
 * Options for glTF/GLB export.
 *
 * When `materials` is provided, faces are grouped into separate
 * glTF primitives by material, enabling per-face coloring.
 */
interface GltfExportOptions {
    /** Map of faceId → material. FaceIds come from ShapeMesh.faceGroups[].faceId. */
    materials?: Map<number, GltfMaterial>;
}

/**
 * Export a ShapeMesh to a glTF 2.0 JSON string with an embedded base64 buffer.
 *
 * The resulting string is a self-contained `.gltf` file that can be loaded
 * directly by three.js, Babylon.js, or any glTF viewer.
 *
 * @param mesh - Triangulated mesh from `mesh()`.
 * @param options - Optional material assignments.
 * @returns A JSON string representing the complete glTF document.
 *
 * @example
 * ```ts
 * const mesh = mesh(solid);
 * const gltfJson = exportGltf(mesh);
 * ```
 *
 * @see {@link exportGlb} for the binary GLB variant.
 */
declare function exportGltf(mesh: ShapeMesh, options?: GltfExportOptions): string;

/**
 * Export a ShapeMesh to a `.glb` binary (ArrayBuffer).
 *
 * GLB packs the JSON header and binary buffer into a single file,
 * which is more efficient for network transfer than base64-encoded glTF.
 *
 * @param mesh - Triangulated mesh from `mesh()`.
 * @param options - Optional material assignments.
 * @returns An ArrayBuffer containing the complete GLB binary.
 *
 * @example
 * ```ts
 * const mesh = mesh(solid);
 * const glbBuffer = exportGlb(mesh);
 * const blob = new Blob([glbBuffer], { type: 'model/gltf-binary' });
 * ```
 *
 * @see {@link exportGltf} for the JSON variant.
 */
declare function exportGlb(mesh: ShapeMesh, options?: GltfExportOptions): ArrayBuffer;

/**
 * A single DXF entity (LINE or POLYLINE).
 *
 * LINE maps directly to a DXF LINE entity.
 * POLYLINE maps to an LWPOLYLINE with optional closure.
 */
type DXFEntity = {
    type: 'LINE';
    start: Point2D;
    end: Point2D;
    layer?: string;
} | {
    type: 'POLYLINE';
    points: Point2D[];
    closed?: boolean;
    layer?: string;
};

/** Options controlling DXF ASCII export formatting. */
interface DXFExportOptions {
    /** Default layer name for entities. Default: "0" */
    layer?: string;
    /** Number of segments for curve approximation. Default: 32 */
    curveSegments?: number;
}

/**
 * Export DXF entities to a DXF R12 ASCII string.
 *
 * Produces a complete DXF document with HEADER, TABLES, ENTITIES, and EOF
 * sections. Layer definitions are generated automatically from entities.
 *
 * @param entities - Array of LINE or POLYLINE entities to write.
 * @param options - Layer name and formatting options.
 * @returns A complete DXF ASCII string ready to save as a `.dxf` file.
 *
 * @example
 * ```ts
 * const entities: DXFEntity[] = [
 *   { type: 'LINE', start: [0, 0], end: [10, 0] },
 * ];
 * const dxfString = exportDXF(entities);
 * ```
 *
 * @see {@link blueprintToDXF} for a higher-level API that converts Blueprints directly.
 */
declare function exportDXF(entities: DXFEntity[], options?: DXFExportOptions): string;

/**
 * Convert a Blueprint (or CompoundBlueprint/Blueprints) to a DXF string.
 *
 * Each straight segment becomes a LINE entity; arcs, ellipses, splines,
 * and other curves are approximated as LWPOLYLINE entities.
 *
 * @param drawing - A Blueprint, CompoundBlueprint, or Blueprints collection.
 * @param options - Layer name and curve approximation settings.
 * @returns A complete DXF ASCII string.
 *
 * @example
 * ```ts
 * const dxf = blueprintToDXF(myBlueprint, { curveSegments: 64 });
 * ```
 *
 * @see {@link exportDXF} for the lower-level entity-based API.
 */
declare function blueprintToDXF(drawing: Blueprint | CompoundBlueprint | Blueprints, options?: DXFExportOptions): string;

/** Options controlling 3MF archive export. */
interface ThreeMFExportOptions {
    /** Name of the model object inside the 3MF archive. Default: `"model"`. */
    name?: string;
    /** Unit of measurement for vertex coordinates. Default: `"millimeter"`. */
    unit?: 'micron' | 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot';
}

/**
 * Export a ShapeMesh to 3MF format (ArrayBuffer).
 *
 * 3MF is the standard format for modern 3D printing slicers
 * (PrusaSlicer, Cura, etc.). The output is a store-only ZIP archive
 * containing the OPC content types, relationships, and 3D model XML.
 *
 * @param mesh - Triangulated mesh from `mesh()`.
 * @param options - Model name and unit settings.
 * @returns An ArrayBuffer containing the 3MF ZIP archive.
 *
 * @remarks No external compression library is needed; the archive uses
 * store-only (uncompressed) ZIP entries with CRC-32 integrity checks.
 *
 * @example
 * ```ts
 * const mesh = mesh(solid);
 * const buf = exportThreeMF(mesh, { unit: 'millimeter' });
 * const blob = new Blob([buf], { type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml' });
 * ```
 */
declare function exportThreeMF(mesh: ShapeMesh, options?: ThreeMFExportOptions): ArrayBuffer;

/** Options controlling SVG import behavior. */
interface SVGImportOptions {
    /** Whether to flip the Y axis (default: true, since SVG Y is down). */
    flipY?: boolean;
}

/**
 * Import a single SVG path data string (`d` attribute) as a Blueprint.
 *
 * Supports all SVG path commands: M, L, H, V, C, S, Q, T, A, Z
 * (both absolute and relative). The Y axis is flipped to match
 * brepjs coordinates (Y up).
 *
 * @param pathD - The SVG path data string (e.g., `"M 0 0 L 10 0 L 10 10 Z"`).
 * @returns A `Result` wrapping the Blueprint, or an error if parsing fails.
 *
 * @example
 * ```ts
 * const bp = unwrap(importSVGPathD('M 0 0 L 10 0 L 10 10 Z'));
 * ```
 *
 * @see {@link importSVG} to extract all `<path>` elements from a full SVG string.
 */
declare function importSVGPathD(pathD: string): Result<Blueprint>;

/**
 * Import all `<path>` elements from an SVG string as Blueprints.
 *
 * Uses regex extraction (no DOM parser dependency) to find `<path d="...">`.
 * Each path becomes a separate Blueprint with its curves.
 *
 * @remarks Paths that fail to parse are silently skipped. Only the
 * successfully parsed paths appear in the result. If no paths are found
 * at all, an error `Result` is returned.
 *
 * @param svgString - Complete SVG XML string.
 * @returns A `Result` wrapping an array of Blueprints (one per `<path>` element).
 *
 * @example
 * ```ts
 * const blueprints = unwrap(importSVG(svgFileContents));
 * blueprints.forEach(bp => console.log(bp.curves.length));
 * ```
 *
 * @see {@link importSVGPathD} to import a single path `d` attribute directly.
 */
declare function importSVG(svgString: string): Result<Blueprint[]>;

/**
 * Base class for 2D sketchers that accumulate {@link Curve2D} segments.
 *
 * Provides the shared pen-drawing API (lines, arcs, ellipses, beziers, splines)
 * used by {@link FaceSketcher}, {@link BlueprintSketcher}, and {@link DrawingPen}.
 * Subclasses implement `done()` / `close()` to produce the appropriate output type.
 *
 * @category Sketching
 */
declare class BaseSketcher2d {
    protected pointer: Point2D;
    protected firstPoint: Point2D;
    protected pendingCurves: Curve2D[];
    protected _nextCorner: null | ((f: Curve2D, s: Curve2D) => Curve2D[]);
    constructor(origin?: Point2D);
    protected _convertToUV([x, y]: Point2D): Point2D;
    protected _convertFromUV([u, v]: Point2D): Point2D;
    /**
     * Returns the current pen position as [x, y] coordinates
     *
     * @category Drawing State
     */
    get penPosition(): Point2D;
    /**
     * Returns the current pen angle in degrees
     *
     * The angle represents the tangent direction at the current pen position,
     * based on the last drawing operation (line, arc, bezier, etc.).
     * Returns 0 if nothing has been drawn yet.
     *
     * @category Drawing State
     */
    get penAngle(): number;
    /** Move the pen to an absolute 2D position before drawing any curves. */
    movePointerTo(point: Point2D): this;
    protected saveCurve(curve: Curve2D): void;
    /** Draw a straight line to an absolute 2D point. */
    lineTo(point: Point2D): this;
    /** Draw a straight line by relative horizontal and vertical distances. */
    line(xDist: number, yDist: number): this;
    /** Draw a vertical line of the given signed distance. */
    vLine(distance: number): this;
    /** Draw a horizontal line of the given signed distance. */
    hLine(distance: number): this;
    /** Draw a vertical line to an absolute Y coordinate. */
    vLineTo(yPos: number): this;
    /** Draw a horizontal line to an absolute X coordinate. */
    hLineTo(xPos: number): this;
    /** Draw a line to a point given in polar coordinates [r, theta] from the origin. */
    polarLineTo([r, theta]: Point2D): this;
    /** Draw a line in polar coordinates (distance and angle in degrees) from the current point. */
    polarLine(distance: number, angle: number): this;
    /** Draw a line tangent to the previous curve, extending by the given distance. */
    tangentLine(distance: number): this;
    /** Draw a circular arc passing through a mid-point to an absolute end point. */
    threePointsArcTo(end: Point2D, midPoint: Point2D): this;
    /** Draw a circular arc through a via-point to an end point, both as relative distances. */
    threePointsArc(xDist: number, yDist: number, viaXDist: number, viaYDist: number): this;
    /** Draw a circular arc to an absolute end point, bulging by the given sagitta. */
    sagittaArcTo(end: Point2D, sagitta: number): this;
    /** Draw a circular arc to a relative end point, bulging by the given sagitta. */
    sagittaArc(xDist: number, yDist: number, sagitta: number): this;
    /** Draw a vertical sagitta arc of the given distance and bulge. */
    vSagittaArc(distance: number, sagitta: number): this;
    /** Draw a horizontal sagitta arc of the given distance and bulge. */
    hSagittaArc(distance: number, sagitta: number): this;
    /** Draw an arc to an absolute end point using a bulge factor (sagitta as fraction of half-chord). */
    bulgeArcTo(end: Point2D, bulge: number): this;
    /** Draw an arc to a relative end point using a bulge factor. */
    bulgeArc(xDist: number, yDist: number, bulge: number): this;
    /** Draw a vertical bulge arc of the given distance and bulge factor. */
    vBulgeArc(distance: number, bulge: number): this;
    /** Draw a horizontal bulge arc of the given distance and bulge factor. */
    hBulgeArc(distance: number, bulge: number): this;
    /** Draw a circular arc tangent to the previous curve, ending at an absolute point. */
    tangentArcTo(end: Point2D): this;
    /** Draw a circular arc tangent to the previous curve, ending at a relative offset. */
    tangentArc(xDist: number, yDist: number): this;
    /** Draw an elliptical arc to an absolute end point (SVG-style parameters). */
    ellipseTo(end: Point2D, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;
    /** Draw an elliptical arc to a relative end point (SVG-style parameters). */
    ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;
    /** Draw a half-ellipse arc to an absolute end point with a given minor radius. */
    halfEllipseTo(end: Point2D, minorRadius: number, sweep?: boolean): this;
    /** Draw a half-ellipse arc to a relative end point with a given minor radius. */
    halfEllipse(xDist: number, yDist: number, minorRadius: number, sweep?: boolean): this;
    /** Draw a Bezier curve to an absolute end point through one or more control points. */
    bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;
    /** Draw a quadratic Bezier curve to an absolute end point with a single control point. */
    quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;
    /** Draw a cubic Bezier curve to an absolute end point with start and end control points. */
    cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;
    /** Draw a smooth cubic Bezier spline to an absolute end point, blending tangent with the previous curve. */
    smoothSplineTo(end: Point2D, config?: SplineConfig): this;
    /** Draw a smooth cubic Bezier spline to a relative end point, blending tangent with the previous curve. */
    smoothSpline(xDist: number, yDist: number, splineConfig?: SplineConfig): this;
    /**
     * Changes the corner between the previous and next segments.
     */
    customCorner(radius: number | ((first: Curve2D, second: Curve2D) => Curve2D[]), mode?: 'fillet' | 'chamfer'): this;
    protected _customCornerLastWithFirst(radius: number | ((f: Curve2D, s: Curve2D) => Curve2D[]), mode?: 'fillet' | 'chamfer' | 'dogbone'): void;
    protected _closeSketch(): void;
    protected _closeWithMirror(): void;
}

/**
 * Configuration for {@link GenericSketcher.smoothSplineTo}.
 *
 * Can be a single tangent value (applied to the end), or an object with
 * separate start/end tangents and distance factors.
 */
type SplineConfig = SplineTangent | {
    endTangent?: SplineTangent;
    startTangent?: StartSplineTangent;
    startFactor?: number;
    endFactor?: number;
};

/**
 * Sketchers allow the user to draw a two dimensional shape using segments of
 * curve. You start by defining where your sketch will start (with the method
 * `movePointerTo`).
 * Each sketching method corresponds to drawing a curve of some type (line,
 * arc, elliptic arc, bezier curve) to a new point. The next segment will start
 * from the end point of the previous segment.
 * Once you end your sketch you will receive a `Sketch` object that allows you
 * to give some three dimensionality to your finished sketch.
 *
 * @category Sketching
 */
interface GenericSketcher<ReturnType> {
    /**
     * Changes the point to start your drawing from
     */
    movePointerTo(point: Point2D): this;
    /**
     * Draws a line from the current point to the point given in argument
     *
     * @category Line Segment
     */
    lineTo(point: Point2D): this;
    /**
     * Draws a line at the horizontal distance xDist and the vertical distance
     * yDist of the current point
     *
     * @category Line Segment
     */
    line(xDist: number, yDist: number): this;
    /**
     * Draws a vertical line of length distance from the current point
     *
     * @category Line Segment
     */
    vLine(distance: number): this;
    /**
     * Draws an horizontal line of length distance from the current point
     *
     * @category Line Segment
     */
    hLine(distance: number): this;
    /**
     * Draws a vertical line to the y coordinate
     *
     * @category Line Segment
     */
    vLineTo(yPos: number): this;
    /**
     * Draws an horizontal line to the x coordinate
     *
     * @category Line Segment
     */
    hLineTo(xPos: number): this;
    /**
     * Draws a line from the current point to the point defined in polar
     * coordinates, of radius r and angle theta (in degrees) from the origin
     *
     * @category Line Segment
     */
    polarLineTo([r, theta]: [number, number]): this;
    /**
     * Draws a line from the current point to the point defined in polar
     * coordinates, of radius r and angle theta (in degrees) from the current
     * point
     *
     * @category Line Segment
     */
    polarLine(r: number, theta: number): this;
    /**
     * Draws a line from the current point as a tangent to the previous part of
     * curve drawn. The distance defines how long the line will be.
     *
     * @category Line Segment
     */
    tangentLine(distance: number): this;
    /** Draws an arc of circle by defining its end point and a third point
     * through which the arc will pass.
     *
     * @category Arc Segment
     */
    threePointsArcTo(end: Point2D, innerPoint: Point2D): this;
    /** Draws an arc of circle by defining its end point and a third point
     * through which the arc will pass. Both points are defined in horizontal
     * (x) and vertical (y) distances from the start point.
     *
     * @category Arc Segment
     */
    threePointsArc(xDist: number, yDist: number, viaXDist: number, viaYDist: number): this;
    /** Draws an arc of circle by defining its end point and the sagitta - the
     * maximum distance between the arc and the straight line going from start to
     * end point.
     *
     * @category Arc Segment
     */
    sagittaArcTo(end: Point2D, sagitta: number): this;
    /** Draws an arc of circle by defining its end point and the sagitta - the
     * maximum distance between the arc and the straight line going from start to
     * end point. The end point is defined by its horizontal and vertical
     * distances from the start point.
     *
     * @category Arc Segment
     */
    sagittaArc(xDist: number, yDist: number, sagitta: number): this;
    /** Draws a vertical arc of circle by defining its end point and the sagitta
     * - the maximum distance between the arc and the straight line going from
     * start to end point. The end point is defined by its vertical distance from
     * the start point.
     *
     * @category Arc Segment
     */
    vSagittaArc(distance: number, sagitta: number): this;
    /** Draws an horizontal arc of circle by defining its end point and the
     * sagitta - the maximum distance between the arc and the straight line going
     * from start to end point. The end point is defined by its horizontal
     * distance from the start point.
     *
     * @category Arc Segment
     */
    hSagittaArc(distance: number, sagitta: number): this;
    /** Draws an arc of circle by defining its end point and the bulge - the
     * maximum distance between the arc and the straight line going from start to
     * end point.
     *
     * @category Arc Segment
     */
    bulgeArcTo(end: Point2D, bulge: number): this;
    /** Draws an arc of circle by defining its end point and the bulge - the
     * maximum distance between the arc and the straight line going from start to
     * end point in units of half the chord. The end point is defined by its horizontal and vertical distances
     * from the start point.
     *
     * @category Arc Segment
     */
    bulgeArc(xDist: number, yDist: number, bulge: number): this;
    /** Draws a vertical arc of circle by defining its end point and the bulge
     * - the maximum distance between the arc and the straight line going from
     * start to end point in units of half the chord. The end point is defined by its vertical distance from
     * the start point.
     *
     * @category Arc Segment
     */
    vBulgeArc(distance: number, bulge: number): this;
    /** Draws an horizontal arc of circle by defining its end point and the bulge
     * - the maximum distance between the arc and the straight line going from
     * start to end point in units of half the chord. The end point is defined by
     * its horizontal distance from the start point.
     *
     * @category Arc Segment
     */
    hBulgeArc(distance: number, bulge: number): this;
    /**
     * Draws an arc of circle from the current point as a tangent to the previous
     * part of curve drawn.
     *
     * @category Arc Segment
     */
    tangentArcTo(end: Point2D): this;
    /**
     * Draws an arc of circle from the current point as a tangent to the previous
     * part of curve drawn. The end point is defined by its horizontal and vertical
     * distances from the start point.
     *
     * @category Arc Segment
     */
    tangentArc(xDist: number, yDist: number): this;
    /**
     * Draws an arc of ellipse by defining its end point and an ellipse.
     *
     * The shape of the ellipse is defined by both its radiuses, its angle
     * relative to the current coordinate system, as well as the long and sweep
     * flags (as defined for SVG paths)
     *
     * @category Ellipse Arc Segment
     */
    ellipseTo(end: Point2D, horizontalRadius: number, verticalRadius: number, rotation: number, longAxis: boolean, sweep: boolean): this;
    /**
     * Draws an arc of ellipse by defining its end point and an ellipse. The end
     * point is defined by distances from the start point.
     *
     * The shape of the ellipse is defined by both its radiuses, its angle
     * relative to the current coordinate system, as well as the long and sweep
     * flags (as defined for SVG paths)
     *
     * @category Ellipse Arc Segment
     */
    ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation: number, longAxis: boolean, sweep: boolean): this;
    /**
     * Draws an arc as half an ellipse, defined by the sagitta of the ellipse
     * (which corresponds to the radius in the axe orthogonal to the straight
     * line).
     *
     * The sweep flag is to be understood as defined for SVG paths.
     *
     * @category Ellipse Arc Segment
     */
    halfEllipseTo(end: Point2D, radius: number, sweep: boolean): this;
    /**
     * Draws an arc as half an ellipse, defined by the sagitta of the ellipse
     * (which corresponds to the radius in the axe orthogonal to the straight
     * line). The end point is defined by distances from the start point.
     *
     * The sweep flag is to be understood as defined for SVG paths.
     *
     * @category Ellipse Arc Segment
     */
    halfEllipse(xDist: number, yDist: number, radius: number, sweep: boolean): this;
    /** Draws a generic bezier curve to the end point, going using a set of
     * control points.
     *
     * This is the generic definition of a bezier curve, you might want to use
     * either the quadratic or cubic (most common) version, unless you know
     * exactly what you are aiming at.
     *
     * @category Bezier Curve
     */
    bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;
    /** Draws a quadratic bezier curve to the end point, using the single control
     * point.
     *
     * @category Bezier Curve
     */
    quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;
    /** Draws a cubic bezier curve to the end point, using the start and end
     * control point to define its shape. This corresponds to the most commonly
     * used bezier curve.
     *
     * If you are struggling setting your control points, the smoothSpline might
     * be better for your needs.
     *
     * @category Bezier Curve
     */
    cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;
    /** Draws a cubic bezier curve to the end point, attempting to make the line
     * smooth with the previous segment.
     *
     * It will base its first control point so that its tangent is the same as
     * the previous segment.
     *
     * The control point relative to the end is by default set to be in the
     * direction of the straight line between start and end. You can specify the
     * `endSkew` either as an angle (in degrees) to this direction, or as an
     * absolute direction in the coordinate system (a Point).
     *
     * The start- and end- factors decide on how far the control point is from
     * the start and end point. At a factor of 1, the distance corresponds to
     * a quarter of the straight line distance.
     *
     * @category Bezier Curve
     */
    smoothSplineTo(end: Point2D, config?: SplineConfig): this;
    /** Draws a cubic bezier curve to the end point, attempting to make the line
     * smooth with the previous segment. The end point is defined by its distance
     * to the first point.
     *
     * It will base its first control point so that its tangent is the same as
     * the previous segment. You can force another tangent by defining
     * `startTangent`.
     *
     * You can configure the tangent of the end point by configuring the
     * `endTangent`, either as "symmetric" to reproduce the start angle, as an
     * angle from the X axis (in the coordinate system) or a 2d direction (still
     * in the coordinate system).
     *
     * The start- and end- factors decide on how far the control point is from
     * the start and end point. At a factor of 1, the distance corresponds to
     * a quarter of the straight line distance.
     *
     * @category Bezier Curve
     */
    smoothSpline(xDist: number, yDist: number, splineConfig: SplineConfig): this;
    /**
     * Stop drawing and returns the sketch.
     */
    done(): ReturnType;
    /**
     * Stop drawing, make sure the sketch is closed (by adding a straight line to
     * from the last point to the first) and returns the sketch.
     */
    close(): ReturnType;
    /**
     * Stop drawing, make sure the sketch is closed (by mirroring the lines
     * between the first and last points drawn) and returns the sketch.
     */
    closeWithMirror(): ReturnType;
}

/** Common interface for sketch-like objects that can be extruded, revolved, or lofted. */
interface SketchInterface {
    /**
     * Transforms the lines into a face. The lines should be closed.
     */
    face(): Face;
    /**
     * Revolves the drawing on an axis (defined by its direction and an origin
     * (defaults to the sketch origin)
     */
    revolve(revolutionAxis?: PointInput, config?: {
        origin?: PointInput;
    }): Shape3D;
    /**
     * Extrudes the sketch to a certain distance (along the default direction
     * and origin of the sketch).
     *
     * You can define another extrusion direction or origin,
     *
     * It is also possible to twist extrude with an angle (in degrees), or to
     * give a profile to the extrusion (the endFactor will scale the face, and
     * the profile will define how the scale is applied (either linearly or with
     * a s-shape).
     */
    extrude(extrusionDistance: number, extrusionConfig?: {
        extrusionDirection?: PointInput;
        extrusionProfile?: ExtrusionProfile;
        twistAngle?: number;
        origin?: PointInput;
    }): Shape3D;
    /**
     * Loft between this sketch and another sketch (or an array of them)
     *
     * You can also define a `startPoint` for the loft (that will be placed
     * before this sketch) and an `endPoint` after the last one.
     *
     * You can also define if you want the loft to result in a ruled surface.
     *
     * Note that all sketches will be deleted by this operation
     */
    loftWith(otherSketches: this | this[], loftConfig: LoftConfig, returnShell?: boolean): Shape3D;
}

/**
 * Batch wrapper around multiple {@link Sketch} or {@link CompoundSketch} instances.
 *
 * Applies the same operation (extrude, revolve, etc.) to every contained sketch
 * and returns the results combined into a single compound shape.
 *
 * @category Sketching
 */
declare class Sketches {
    sketches: Array<Sketch | CompoundSketch>;
    constructor(sketches: Array<Sketch | CompoundSketch>);
    /** Return all wires combined into a single compound shape. */
    wires(): AnyShape;
    /** Return all sketch faces combined into a single compound shape. */
    faces(): AnyShape;
    /** Extrudes the sketch to a certain distance (along the default direction
     * and origin of the sketch).
     *
     * You can define another extrusion direction or origin,
     *
     * It is also possible to twist extrude with an angle (in degrees), or to
     * give a profile to the extrusion (the endFactor will scale the face, and
     * the profile will define how the scale is applied (either linearly or with
     * a s-shape).
     */
    extrude(extrusionDistance: number, extrusionConfig?: {
        extrusionDirection?: PointInput;
        extrusionProfile?: ExtrusionProfile;
        twistAngle?: number;
        origin?: PointInput;
    }): AnyShape;
    /**
     * Revolves the drawing on an axis (defined by its direction and an origin
     * (defaults to the sketch origin)
     */
    revolve(revolutionAxis?: PointInput, config?: {
        origin?: PointInput;
    }): AnyShape;
}

/**
 * Create a circular Sketch on a given plane.
 *
 * @param radius - Radius of the circle.
 * @param planeConfig - Plane name / origin to sketch on (defaults to XY at origin).
 * @returns A closed circular {@link Sketch}.
 *
 * @example
 * ```ts
 * const circle = sketchCircle(10, { plane: "XZ", origin: 5 });
 * const cylinder = circle.extrude(20);
 * ```
 *
 * @category Sketching
 */
declare const sketchCircle: (radius: number, planeConfig?: PlaneConfig) => Sketch;

/**
 * Create an elliptical Sketch on a given plane.
 *
 * @param xRadius - Semi-axis length along the plane X direction.
 * @param yRadius - Semi-axis length along the plane Y direction.
 * @param planeConfig - Plane name / origin to sketch on (defaults to XY at origin).
 * @returns A closed elliptical {@link Sketch}.
 *
 * @category Sketching
 */
declare const sketchEllipse: (xRadius?: number, yRadius?: number, planeConfig?: PlaneConfig) => Sketch;

/**
 * Create a rectangular Sketch centered on a given plane.
 *
 * @param xLength - Width along the plane X direction.
 * @param yLength - Height along the plane Y direction.
 * @param planeConfig - Plane name / origin to sketch on (defaults to XY at origin).
 * @returns A closed rectangular {@link Sketch}.
 *
 * @example
 * ```ts
 * const rect = sketchRectangle(30, 20);
 * const box = rect.extrude(10);
 * ```
 *
 * @category Sketching
 */
declare const sketchRectangle: (xLength: number, yLength: number, planeConfig?: PlaneConfig) => Sketch;

/**
 * Create a rounded-rectangle Sketch centered on a given plane.
 *
 * @param width - Width of the rectangle.
 * @param height - Height of the rectangle.
 * @param r - Corner radius, or `{ rx, ry }` for elliptical corners (0 = sharp).
 * @param planeConfig - Plane name / origin to sketch on (defaults to XY at origin).
 * @returns A closed rounded-rectangle {@link Sketch}.
 *
 * @category Sketching
 */
declare const sketchRoundedRectangle: (width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}, planeConfig?: PlaneConfig) => Sketch;

/**
 * Create a regular-polygon Sketch on a given plane.
 *
 * Sides may optionally be arcs (sagitta != 0). The outer radius is measured
 * to the vertices when sagitta is zero.
 *
 * @param radius - Circumscribed (outer) radius.
 * @param sidesCount - Number of polygon sides.
 * @param sagitta - Arc sagitta per side (0 = straight edges).
 * @param planeConfig - Plane name / origin to sketch on.
 * @returns A closed polygon {@link Sketch}.
 *
 * @example
 * ```ts
 * const hex = sketchPolysides(15, 6);
 * ```
 *
 * @category Sketching
 */
declare const sketchPolysides: (radius: number, sidesCount: number, sagitta?: number, planeConfig?: PlaneConfig) => Sketch;

/**
 * Compute the apothem (inner radius) of a regular polygon, accounting for sagitta.
 *
 * @param outerRadius - Circumscribed radius.
 * @param sidesCount - Number of polygon sides.
 * @param sagitta - Arc sagitta per side (0 = straight edges).
 * @returns The inscribed radius (distance from center to the nearest edge midpoint).
 */
declare const polysideInnerRadius: (outerRadius: number, sidesCount: number, sagitta?: number) => number;

/**
 * Create a Sketch by offsetting the outer wire of a face.
 *
 * A negative offset shrinks inward; a positive offset expands outward.
 *
 * @param face - The face whose outer wire to offset.
 * @param offset - Signed offset distance.
 * @returns A {@link Sketch} of the offset wire, inheriting the face normal.
 *
 * @category Sketching
 */
declare const sketchFaceOffset: (face: Face, offset: number) => Sketch;

/**
 * Create a Sketch from a parametric 2D function, approximated as a B-spline.
 *
 * The function is sampled at `pointsCount + 1` evenly spaced parameter values
 * between `start` and `stop`, then fit with a B-spline approximation.
 *
 * @param func - Parametric function mapping `t` to a 2D point.
 * @param planeConfig - Plane to sketch on (defaults to XY at origin).
 * @param approximationConfig - B-spline fitting options (tolerance, degree, etc.).
 * @returns A {@link Sketch} containing the approximated curve.
 *
 * @category Sketching
 */
declare const sketchParametricFunction: (func: (t: number) => Point2D, planeConfig?: PlaneConfig, { pointsCount, start, stop }?: {
    pointsCount?: number | undefined;
    start?: number | undefined;
    stop?: number | undefined;
}, approximationConfig?: BSplineApproximationConfig) => Sketch;

/**
 * Create a helical Sketch (open wire) with the given pitch, height, and radius.
 *
 * @param pitch - Axial distance per full revolution.
 * @param height - Total height of the helix along its axis.
 * @param radius - Radius of the helix.
 * @param center - Center point of the helix base.
 * @param dir - Axis direction of the helix.
 * @param lefthand - If true, generate a left-handed helix.
 * @returns A {@link Sketch} wrapping the helical wire.
 *
 * @category Sketching
 */
declare const sketchHelix: (pitch: number, height: number, radius: number, center?: PointInput, dir?: PointInput, lefthand?: boolean) => Sketch;

/**
 * Create a box centered on the XY plane and extruded along Z.
 *
 * @param xLength - Width of the box along X.
 * @param yLength - Depth of the box along Y.
 * @param zLength - Height of the box along Z (extrusion distance).
 * @returns The extruded 3D box shape.
 *
 * @example
 * ```ts
 * const box = makeBaseBox(10, 20, 5);
 * ```
 */
declare const makeBaseBox: (xLength: number, yLength: number, zLength: number) => Shape3D;

/**
 * @categoryDescription Drawing
 *
 * Drawing are shapes in the 2D space. You can either use a "builder pen" to
 * draw a shape, or use some of the canned shapes like circles or rectangles.
 */
/**
 * Immutable wrapper around a 2D shape ({@link Blueprint}, {@link CompoundBlueprint}, or {@link Blueprints}).
 *
 * A Drawing can be transformed (translate, rotate, scale, mirror), combined
 * with Boolean operations (cut, fuse, intersect), filleted/chamfered,
 * serialized, and ultimately projected onto a 3D plane via `sketchOnPlane`.
 *
 * @example
 * ```ts
 * const profile = drawRectangle(40, 20)
 *   .fillet(3)
 *   .cut(drawCircle(5).translate(10, 0));
 * const sketch = profile.sketchOnPlane("XY");
 * ```
 *
 * @category Drawing
 */
declare class Drawing {
    private readonly innerShape;
    constructor(innerShape?: Shape2D);
    /** Create an independent deep copy of this drawing. */
    clone(): Drawing;
    /** Serialize the drawing to a JSON string for persistence or transfer. */
    serialize(): string;
    /** Get the axis-aligned 2D bounding box of this drawing. */
    get boundingBox(): BoundingBox2d;
    /** Stretch the drawing by a ratio along a direction from an origin point. */
    stretch(ratio: number, direction: Point2D, origin: Point2D): Drawing;
    /** Return a human-readable string representation of the drawing. */
    get repr(): string;
    /** Rotate the drawing by an angle (in degrees) around an optional center point. */
    rotate(angle: number, center?: Point2D): Drawing;
    /** Translate the drawing by horizontal and vertical distances. */
    translate(xDist: number, yDist: number): Drawing;
    /** Translate the drawing by a 2D vector. */
    translate(translationVector: Point2D): Drawing;
    /** Uniformly scale the drawing by a factor around an optional center point. */
    scale(scaleFactor: number, center?: Point2D): Drawing;
    /** Mirror the drawing about a point or a line defined by direction and origin. */
    mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): Drawing;
    /**
     * Builds a new drawing by cutting another drawing into this one
     *
     * @category Drawing Modifications
     */
    cut(other: Drawing): Drawing;
    /**
     * Builds a new drawing by merging another drawing into this one
     *
     * @category Drawing Modifications
     */
    fuse(other: Drawing): Drawing;
    /**
     * Builds a new drawing by intersection this drawing with another
     *
     * @category Drawing Modifications
     */
    intersect(other: Drawing): Drawing;
    /**
     * Creates a new drawing with some corners filleted, as specified by the
     * radius and the corner finder function
     *
     * @category Drawing Modifications
     */
    fillet(radius: number, filter?: (c: CornerFinderFn) => CornerFinderFn): Drawing;
    /**
     * Creates a new drawing with some corners chamfered, as specified by the
     * radius and the corner finder function
     *
     * @category Drawing Modifications
     */
    chamfer(radius: number, filter?: (c: CornerFinderFn) => CornerFinderFn): Drawing;
    /** Project this drawing onto a 3D plane, producing a Sketch or Sketches. */
    sketchOnPlane(inputPlane: Plane): SketchInterface | Sketches;
    /** Project this drawing onto a named plane at an optional origin. */
    sketchOnPlane(inputPlane?: PlaneName, origin?: PointInput | number): SketchInterface | Sketches;
    /** Project this drawing onto a 3D face surface with the given scale mode. */
    sketchOnFace(face: Face, scaleMode: ScaleMode): SketchInterface | Sketches;
    /** Punch the drawing's profile as a hole through a 3D shape on the given face. */
    punchHole(shape: AnyShape, faceFinder: SingleFace, options?: {
        height?: number;
        origin?: PointInput;
        draftAngle?: number;
    }): AnyShape;
    /** Export the drawing as a complete SVG string. */
    toSVG(margin?: number): string;
    /** Return the SVG `viewBox` attribute string for this drawing. */
    toSVGViewBox(margin?: number): string;
    /** Return the SVG `<path>` `d` attribute strings for this drawing. */
    toSVGPaths(): string[] | string[][];
    /** Offset the drawing contour by a signed distance (positive = outward). */
    offset(distance: number, offsetConfig?: Offset2DConfig): Drawing;
    /** Approximate the drawing curves for a target format (currently only `'svg'`). */
    approximate(target: 'svg' | 'arcs', options?: ApproximationOptions): Drawing;
    /** Access the underlying {@link Blueprint}, throwing if the drawing is compound. */
    get blueprint(): Blueprint;
}

/**
 * Deserializes a drawing from a string. String is expected to be in the format
 * generated by `Drawing.serialize()`.
 */
declare function deserializeDrawing(data: string): Drawing;

/**
 * Creates a drawing pen to programatically draw in 2D.
 *
 * @category Drawing
 */
declare function draw(initialPoint?: Point2D): DrawingPen;

/**
 * Creates the `Drawing` of a rectangle with (optional) rounded corners.
 *
 * The rectangle is centered on [0, 0]
 *
 * @category Drawing
 */
declare function drawRoundedRectangle(width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}): Drawing;

/** Alias for {@link drawRoundedRectangle}. Creates a rectangle (sharp corners when `r` is 0). */
declare const drawRectangle: typeof drawRoundedRectangle;

/**
 * Creates the `Drawing` of a circle as one single curve.
 *
 * The circle is centered on [0, 0]
 *
 * @category Drawing
 */
declare function drawSingleCircle(radius: number): Drawing;

/**
 * Creates the `Drawing` of an ellipse as one single curve.
 *
 * The ellipse is centered on [0, 0], with axes aligned with the coordinates.
 *
 * @category Drawing
 */
declare function drawSingleEllipse(majorRadius: number, minorRadius: number): Drawing;

/**
 * Creates the `Drawing` of a circle.
 *
 * The circle is centered on [0, 0]
 *
 * @category Drawing
 */
declare function drawCircle(radius: number): Drawing;

/**
 * Creates the `Drawing` of an ellipse.
 *
 * The ellipse is centered on [0, 0], with axes aligned with the coordinates.
 *
 * @category Drawing
 */
declare function drawEllipse(majorRadius: number, minorRadius: number): Drawing;

/**
 * Creates the `Drawing` of a polygon in a defined plane
 *
 * The sides of the polygon can be arcs of circle with a defined sagitta.
 * The radius defines the outer radius of the polygon without sagitta
 *
 * @category Drawing
 */
declare function drawPolysides(radius: number, sidesCount: number, sagitta?: number): Drawing;

/**
 * Creates the `Drawing` of a text, in a defined font size and a font family
 * (which will be the default).
 *
 * @category Drawing
 */
declare function drawText(text: string, { startX, startY, fontSize, fontFamily }?: {
    startX?: number | undefined;
    startY?: number | undefined;
    fontSize?: number | undefined;
    fontFamily?: string | undefined;
}): Drawing;

/**
 * Creates the `Drawing` by interpolating points as a curve
 *
 * The drawing will be a spline approximating the points. Note that the
 * degree should be at maximum 3 if you need to export the drawing as an SVG.
 *
 * @category Drawing
 */
declare const drawPointsInterpolation: (points: Point2D[], approximationConfig?: BSplineApproximationConfig, options?: {
    closeShape?: boolean;
}) => Drawing;

/**
 * Creates the `Drawing` of parametric function
 *
 * The drawing will be a spline approximating the function. Note that the
 * degree should be at maximum 3 if you need to export the drawing as an SVG.
 *
 * @category Drawing
 */
declare const drawParametricFunction: (func: (t: number) => Point2D, { pointsCount, start, stop, closeShape }?: {
    pointsCount?: number | undefined;
    start?: number | undefined;
    stop?: number | undefined;
    closeShape?: boolean | undefined;
}, approximationConfig?: BSplineApproximationConfig) => Drawing;

/**
 * Creates the `Drawing` of a projection of a shape on a plane.
 *
 * The projection is done by projecting the edges of the shape on the plane.
 *
 * @category Drawing
 */
declare function drawProjection(shape: AnyShape, projectionCamera?: ProjectionPlane | Camera): {
    visible: Drawing;
    hidden: Drawing;
};

/**
 * Creates the `Drawing` out of a face
 *
 * @category Drawing
 */
declare function drawFaceOutline(face: Face): Drawing;

/**
 * Extrude a sketch to a given distance along its default (or overridden) direction.
 *
 * @param sketch - The sketch to extrude. Consumed (deleted) by this call.
 * @param height - Extrusion distance.
 * @param config - Optional direction, profile, twist angle, or origin overrides.
 * @returns The extruded 3D solid.
 *
 * @see {@link Sketch.extrude} for the OOP equivalent.
 */
declare function sketchExtrude(sketch: Sketch, height: number, config?: {
    extrusionDirection?: PointInput;
    extrusionProfile?: ExtrusionProfile;
    twistAngle?: number;
    origin?: PointInput;
}): Shape3D;

/**
 * Revolve a sketch around an axis to produce a solid of revolution.
 *
 * @param sketch - The sketch to revolve. Consumed (deleted) by this call.
 * @param revolutionAxis - Axis direction (defaults to sketch default direction).
 * @param options - Optional origin override.
 * @returns The revolved 3D solid.
 *
 * @see {@link Sketch.revolve} for the OOP equivalent.
 */
declare function sketchRevolve(sketch: Sketch, revolutionAxis?: PointInput, options?: {
    origin?: PointInput;
}): Shape3D;

/**
 * Loft between this sketch and one or more other sketches.
 *
 * @param sketch - The starting sketch. Consumed by this call.
 * @param otherSketches - Target sketch(es) to loft toward.
 * @param loftConfig - Loft options (ruled surface, start/end points, etc.).
 * @param returnShell - If true, return a shell instead of a solid.
 * @returns The lofted 3D shape.
 *
 * @see {@link Sketch.loftWith} for the OOP equivalent.
 */
declare function sketchLoft(sketch: Sketch, otherSketches: Sketch | Sketch[], loftConfig?: LoftConfig, returnShell?: boolean): Shape3D;

/**
 * Sweep a profile sketch along this sketch's wire path.
 *
 * @param sketch - The path sketch. Consumed by this call.
 * @param sketchOnPlane - Function that builds the profile sketch at the sweep start.
 * @param sweepConfig - Sweep options (auxiliary spine, orthogonality, etc.).
 * @returns The swept 3D shape.
 *
 * @see {@link Sketch.sweepSketch} for the OOP equivalent.
 */
declare function sketchSweep(sketch: Sketch, sketchOnPlane: Parameters<Sketch['sweepSketch']>[0], sweepConfig?: GenericSweepConfig): Shape3D;

/**
 * Build a face from a sketch's closed wire.
 *
 * @param sketch - A sketch with a closed wire.
 * @returns The planar face.
 *
 * @see {@link Sketch.face} for the OOP equivalent.
 */
declare function sketchFace(sketch: Sketch): Face;

/**
 * Get a clone of the wire from a sketch.
 *
 * @param sketch - The source sketch.
 * @returns A cloned wire.
 *
 * @see {@link Sketch.wires} for the OOP equivalent.
 */
declare function sketchWires(sketch: Sketch): Wire;

/**
 * Extrude a compound sketch (outer + holes) to a given distance.
 *
 * @param sketch - The compound sketch to extrude.
 * @param height - Extrusion distance.
 * @param config - Optional direction, profile, twist angle, or origin overrides.
 * @returns The extruded 3D solid.
 *
 * @see {@link CompoundSketch.extrude} for the OOP equivalent.
 */
declare function compoundSketchExtrude(sketch: CompoundSketch, height: number, config?: {
    extrusionDirection?: PointInput;
    extrusionProfile?: ExtrusionProfile;
    twistAngle?: number;
    origin?: PointInput;
}): Shape3D;

/**
 * Revolve a compound sketch around an axis to produce a solid of revolution.
 *
 * @param sketch - The compound sketch to revolve.
 * @param revolutionAxis - Axis direction.
 * @param options - Optional origin override.
 * @returns The revolved 3D solid.
 *
 * @see {@link CompoundSketch.revolve} for the OOP equivalent.
 */
declare function compoundSketchRevolve(sketch: CompoundSketch, revolutionAxis?: PointInput, options?: {
    origin?: PointInput;
}): Shape3D;

/**
 * Build a face from a compound sketch (outer boundary with holes).
 *
 * @param sketch - The compound sketch.
 * @returns A face with inner wires subtracted as holes.
 *
 * @see {@link CompoundSketch.face} for the OOP equivalent.
 */
declare function compoundSketchFace(sketch: CompoundSketch): Face;

/**
 * Loft between two compound sketches that have the same number of sub-sketches.
 *
 * @param sketch - Starting compound sketch.
 * @param other - Target compound sketch.
 * @param loftConfig - Loft options (ruled surface, etc.).
 * @returns The lofted 3D solid.
 *
 * @see {@link CompoundSketch.loftWith} for the OOP equivalent.
 */
declare function compoundSketchLoft(sketch: CompoundSketch, other: CompoundSketch, loftConfig: LoftConfig): Shape3D;

/**
 * Sketch a drawing onto a 3D plane, producing a Sketch or Sketches.
 *
 * @param drawing - The 2D drawing to project.
 * @param inputPlane - Named plane or Plane object.
 * @param origin - Origin offset on the plane.
 * @returns A Sketch (single profile) or Sketches (multiple profiles).
 *
 * @see {@link Drawing.sketchOnPlane} for the OOP equivalent.
 */
declare function drawingToSketchOnPlane(drawing: Drawing, inputPlane?: PlaneName | Plane, origin?: PointInput | number): any;

/**
 * Fuse two drawings with a Boolean union.
 *
 * @param a - First drawing.
 * @param b - Second drawing to merge.
 * @returns A new Drawing containing the fused shape.
 *
 * @see {@link Drawing.fuse} for the OOP equivalent.
 */
declare function drawingFuse(a: Drawing, b: Drawing): Drawing;

/**
 * Cut one drawing from another with a Boolean subtraction.
 *
 * @param a - Base drawing.
 * @param b - Drawing to subtract.
 * @returns A new Drawing with `b` removed from `a`.
 *
 * @see {@link Drawing.cut} for the OOP equivalent.
 */
declare function drawingCut(a: Drawing, b: Drawing): Drawing;

/**
 * Intersect two drawings with a Boolean intersection.
 *
 * @param a - First drawing.
 * @param b - Second drawing.
 * @returns A new Drawing containing only the overlapping region.
 *
 * @see {@link Drawing.intersect} for the OOP equivalent.
 */
declare function drawingIntersect(a: Drawing, b: Drawing): Drawing;

/**
 * Fillet corners of a drawing.
 *
 * @param drawing - The drawing to modify.
 * @param radius - Fillet radius.
 * @param filter - Optional corner filter to select which corners to fillet.
 * @returns A new Drawing with filleted corners.
 *
 * @see {@link Drawing.fillet} for the OOP equivalent.
 */
declare function drawingFillet(drawing: Drawing, radius: number, filter?: (c: CornerFinderFn) => CornerFinderFn): Drawing;

/**
 * Chamfer corners of a drawing.
 *
 * @param drawing - The drawing to modify.
 * @param radius - Chamfer distance.
 * @param filter - Optional corner filter to select which corners to chamfer.
 * @returns A new Drawing with chamfered corners.
 *
 * @see {@link Drawing.chamfer} for the OOP equivalent.
 */
declare function drawingChamfer(drawing: Drawing, radius: number, filter?: (c: CornerFinderFn) => CornerFinderFn): Drawing;

/**
 * Translate a drawing by horizontal and vertical distances.
 *
 * @param drawing - The drawing to translate.
 * @param dx - Horizontal distance.
 * @param dy - Vertical distance.
 * @returns A new translated Drawing.
 *
 * @see {@link Drawing.translate} for the OOP equivalent.
 */
declare function translateDrawing(drawing: Drawing, dx: number, dy: number): Drawing;
/** Translate a drawing by a 2D vector. */
declare function translateDrawing(drawing: Drawing, vector: Point2D): Drawing;

/**
 * Rotate a drawing by an angle (in degrees) around an optional center point.
 *
 * @param drawing - The drawing to rotate.
 * @param angle - Rotation angle in degrees.
 * @param center - Optional center of rotation (defaults to origin).
 * @returns A new rotated Drawing.
 *
 * @see {@link Drawing.rotate} for the OOP equivalent.
 */
declare function rotateDrawing(drawing: Drawing, angle: number, center?: Point2D): Drawing;

/**
 * Uniformly scale a drawing by a factor around an optional center point.
 *
 * @param drawing - The drawing to scale.
 * @param factor - Scale factor.
 * @param center - Optional center of scaling (defaults to origin).
 * @returns A new scaled Drawing.
 *
 * @see {@link Drawing.scale} for the OOP equivalent.
 */
declare function scaleDrawing(drawing: Drawing, factor: number, center?: Point2D): Drawing;

/**
 * Mirror a drawing about a point or a line defined by direction and origin.
 *
 * @param drawing - The drawing to mirror.
 * @param centerOrDirection - Mirror center point or line direction.
 * @param origin - Origin point when mirroring about a line.
 * @param mode - `'center'` for point mirror, `'plane'` for line mirror.
 * @returns A new mirrored Drawing.
 *
 * @see {@link Drawing.mirror} for the OOP equivalent.
 */
declare function mirrorDrawing(drawing: Drawing, centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): Drawing;

/**
 * Load and register an OpenType/TrueType font for use with text drawing functions.
 *
 * The font is fetched (if a URL string) or parsed (if an ArrayBuffer) and
 * stored in an internal registry keyed by `fontFamily`. The first font loaded
 * is also registered as `'default'`.
 *
 * @param fontPath - URL string or raw ArrayBuffer of the font file.
 * @param fontFamily - Registry key for later retrieval (defaults to `'default'`).
 * @param force - If true, overwrite a previously loaded font with the same key.
 * @returns The parsed opentype.js Font object.
 */
declare function loadFont(fontPath: string | ArrayBuffer, fontFamily?: string, force?: boolean): Promise<any>;

/**
 * Retrieve a previously loaded font by family name.
 *
 * @param fontFamily - Registry key (defaults to `'default'`).
 * @returns The opentype.js Font object, or `undefined` if not loaded.
 */
declare const getFont: (fontFamily?: string) => any;

/**
 * Convert a text string into 2D Blueprints using a loaded font.
 *
 * Each glyph outline is traced as a series of line/bezier curves, then
 * organised into a {@link Blueprints} collection (outer contours + holes).
 *
 * @param text - The string to render.
 * @returns A Blueprints instance representing the text outlines.
 *
 * @remarks Requires a font to be loaded via {@link loadFont} before use.
 */
declare function textBlueprints(text: string, { startX, startY, fontSize, fontFamily }?: {
    startX?: number | undefined;
    startY?: number | undefined;
    fontSize?: number | undefined;
    fontFamily?: string | undefined;
}): Blueprints;

/**
 * Render text as 3D sketch outlines on a plane.
 *
 * Combines {@link textBlueprints} with `sketchOnPlane` to produce a
 * {@link Sketches} collection that can be extruded, revolved, etc.
 *
 * @param text - The string to render.
 * @param textConfig - Font size, family, and start position.
 * @param planeConfig - Plane name / origin to sketch on (defaults to XY at origin).
 * @returns A {@link Sketches} collection of the text outlines.
 *
 * @example
 * ```ts
 * await loadFont("/fonts/Roboto.ttf");
 * const textSketches = sketchText("Hello", { fontSize: 24 });
 * const solid = textSketches.extrude(2);
 * ```
 */
declare function sketchText(text: string, textConfig?: {
    startX?: number;
    startY?: number;
    fontSize?: number;
    fontFamily?: string;
}, planeConfig?: {
    plane?: PlaneName | Plane;
    origin?: PointInput | number;
}): Sketches;

/** Named face of an axis-aligned bounding cube. */
type CubeFace = 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';

/** Named projection plane — axis pairs or cube face names. */
type ProjectionPlane = 'XY' | 'XZ' | 'YZ' | 'YX' | 'ZX' | 'ZY' | 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';

/** Type guard — check if a value is a valid {@link ProjectionPlane} name. */
declare function isProjectionPlane(plane: unknown): plane is ProjectionPlane;

/**
 * Project a 3D shape onto a 2D plane using hidden-line removal (HLR).
 *
 * @param camera - Camera defining the projection plane.
 * @param withHiddenLines - If `true`, also returns hidden (occluded) edges.
 * @returns Separate arrays of visible and hidden projected edges.
 */
declare function makeProjectedEdges(shape: AnyShape, camera: Camera, withHiddenLines?: boolean): {
    visible: Edge[];
    hidden: Edge[];
};

/**
 * Core type definitions for brepjs.
 * Vec3 tuples replace the old Vector class.
 * All operations on vectors are pure functions in vecOps.ts.
 */
/** 3D vector/point as a readonly tuple */
type Vec3 = readonly [number, number, number];

/** 2D point as a readonly tuple */
type Vec2 = readonly [number, number];

/**
 * Flexible point input — accepts various formats for convenience.
 * Use `toVec3()` to normalize to Vec3.
 */
type PointInput = Vec3 | Vec2 | readonly [number, number, number] | readonly [number, number];

/** Normalize any point input to Vec3 */
declare function toVec3(p: PointInput): Vec3;

/** Normalize to Vec2 (drops z) */
declare function toVec2(p: PointInput): Vec2;

/** Direction shorthand — a named axis (`'X'`, `'Y'`, `'Z'`) or an explicit {@link Vec3}. */
type Direction = Vec3 | 'X' | 'Y' | 'Z';

/**
 * Resolve a {@link Direction} shorthand to a unit {@link Vec3}.
 *
 * @throws If the string is not a recognised axis name.
 */
declare function resolveDirection(d: Direction): Vec3;

/** Add two 3D vectors component-wise. */
declare function vecAdd(a: Vec3, b: Vec3): Vec3;

/** Subtract vector `b` from vector `a` component-wise. */
declare function vecSub(a: Vec3, b: Vec3): Vec3;

/** Multiply each component of a 3D vector by a scalar. */
declare function vecScale(v: Vec3, s: number): Vec3;

/** Negate all components of a 3D vector. */
declare function vecNegate(v: Vec3): Vec3;

/** Compute the dot product of two 3D vectors. */
declare function vecDot(a: Vec3, b: Vec3): number;

/** Compute the cross product of two 3D vectors. */
declare function vecCross(a: Vec3, b: Vec3): Vec3;

/** Compute the Euclidean length of a 3D vector. */
declare function vecLength(v: Vec3): number;

/** Compute the squared length of a 3D vector (avoids a sqrt). */
declare function vecLengthSq(v: Vec3): number;

/** Compute the Euclidean distance between two 3D points. */
declare function vecDistance(a: Vec3, b: Vec3): number;

/** Return a unit-length vector in the same direction, or `[0,0,0]` for near-zero input. */
declare function vecNormalize(v: Vec3): Vec3;

/**
 * Test whether two 3D vectors are approximately equal.
 *
 * @param tolerance - Per-component absolute tolerance.
 * @default tolerance `1e-5`
 */
declare function vecEquals(a: Vec3, b: Vec3, tolerance?: number): boolean;

/**
 * Test whether a 3D vector is approximately zero-length.
 *
 * @param tolerance - Length threshold below which the vector is considered zero.
 * @default tolerance `1e-10`
 */
declare function vecIsZero(v: Vec3, tolerance?: number): boolean;

/**
 * Compute the unsigned angle between two 3D vectors in **radians**.
 *
 * @returns Angle in `[0, PI]`, or `0` if either vector is zero-length.
 */
declare function vecAngle(a: Vec3, b: Vec3): number;

/** Project vector onto plane defined by its normal */
declare function vecProjectToPlane(v: Vec3, planeOrigin: Vec3, planeNormal: Vec3): Vec3;

/** Rotate vector around an axis by angle (radians) */
declare function vecRotate(v: Vec3, axis: Vec3, angleRad: number): Vec3;

/** Format a Vec3 as a human-readable string rounded to 3 decimal places. */
declare function vecRepr(v: Vec3): string;

/** Convert Vec3 to OCCT gp_Vec. Caller must call .delete() when done. */
declare function toOcVec(v: Vec3): any;

/** Extract Vec3 from OCCT gp_Vec */
declare function fromOcVec(ocVec: any): Vec3;

/** Extract Vec3 from OCCT gp_Pnt */
declare function fromOcPnt(ocPnt: any): Vec3;

/** Extract Vec3 from OCCT gp_Dir */
declare function fromOcDir(ocDir: any): Vec3;

/** Execute fn with a temporary OCCT gp_Vec, auto-deleted after. */
declare function withOcVec<T>(v: Vec3, fn: (ocVec: any) => T): T;

/** Execute fn with a temporary OCCT gp_Pnt, auto-deleted after. */
declare function withOcPnt<T>(v: Vec3, fn: (ocPnt: any) => T): T;

/** Execute fn with a temporary OCCT gp_Dir, auto-deleted after. */
declare function withOcDir<T>(v: Vec3, fn: (ocDir: any) => T): T;

/** String discriminant identifying the topological type of a shape. */
type ShapeKind = 'vertex' | 'edge' | 'wire' | 'face' | 'shell' | 'solid' | 'compsolid' | 'compound';

/** A topological vertex (0D point). */
type Vertex = ShapeHandle & {
    readonly [__brand]: 'vertex';
};

/** A topological edge (1D curve segment). */
type Edge = ShapeHandle & {
    readonly [__brand]: 'edge';
};

/** An ordered sequence of connected edges forming a path or loop. */
type Wire = ShapeHandle & {
    readonly [__brand]: 'wire';
};

/** A bounded portion of a surface. */
type Face = ShapeHandle & {
    readonly [__brand]: 'face';
};

/** A connected set of faces sharing edges. */
type Shell = ShapeHandle & {
    readonly [__brand]: 'shell';
};

/** A closed volume bounded by shells. */
type Solid = ShapeHandle & {
    readonly [__brand]: 'solid';
};

/** A set of solids connected by faces. */
type CompSolid = ShapeHandle & {
    readonly [__brand]: 'compsolid';
};

/** A heterogeneous collection of shapes. */
type Compound = ShapeHandle & {
    readonly [__brand]: 'compound';
};

/** Any branded shape type */
type AnyShape = Vertex | Edge | Wire | Face | Shell | Solid | CompSolid | Compound;

/** 1D shapes (edges and wires) */
type Shape1D = Edge | Wire;

/** 3D shapes (solid-like) */
type Shape3D = Shell | Solid | CompSolid | Compound;

/** Wrap a raw OCCT shape as a branded {@link Vertex} handle. */
declare function createVertex(ocShape: any): Vertex;

/** Wrap a raw OCCT shape as a branded {@link Edge} handle. */
declare function createEdge(ocShape: any): Edge;

/** Wrap a raw OCCT shape as a branded {@link Wire} handle. */
declare function createWire(ocShape: any): Wire;

/** Wrap a raw OCCT shape as a branded {@link Face} handle. */
declare function createFace(ocShape: any): Face;

/** Wrap a raw OCCT shape as a branded {@link Shell} handle. */
declare function createShell(ocShape: any): Shell;

/** Wrap a raw OCCT shape as a branded {@link Solid} handle. */
declare function createSolid(ocShape: any): Solid;

/** Wrap a raw OCCT shape as a branded {@link Compound} handle. */
declare function createCompound(ocShape: any): Compound;

/** Query the OCCT runtime for the topological type of a shape. */
declare function getShapeKind(shape: AnyShape): ShapeKind;

/** Type guard — check if a shape is a {@link Vertex}. */
declare function isVertex(s: AnyShape): s is Vertex;

/** Type guard — check if a shape is an {@link Edge}. */
declare function isEdge(s: AnyShape): s is Edge;

/** Type guard — check if a shape is a {@link Wire}. */
declare function isWire(s: AnyShape): s is Wire;

/** Type guard — check if a shape is a {@link Face}. */
declare function isFace(s: AnyShape): s is Face;

/** Type guard — check if a shape is a {@link Shell}. */
declare function isShell(s: AnyShape): s is Shell;

/** Type guard — check if a shape is a {@link Solid}. */
declare function isSolid(s: AnyShape): s is Solid;

/** Type guard — check if a shape is a {@link Compound}. */
declare function isCompound(s: AnyShape): s is Compound;

/** Type guard — check if a shape is a 3D shape (shell, solid, compsolid, or compound). */
declare function isShape3D(s: AnyShape): s is Shape3D;

/** Type guard — check if a shape is a 1D shape (edge or wire). */
declare function isShape1D(s: AnyShape): s is Shape1D;

/** Wrap a raw OCCT shape handle into a properly branded type.
 *  Performs a TopoDS downcast and wraps in a disposable handle. */
declare function castShape(ocShape: any): AnyShape;

/** A shape wrapper with Symbol.dispose for auto-cleanup. */
interface ShapeHandle {
    /** The raw OCCT shape handle */
    readonly wrapped: any;
    /** Manually dispose the OCCT handle */
    [Symbol.dispose](): void;
    /** Alias for Symbol.dispose — required for localGC / Deletable compatibility. */
    delete(): void;
    /** Check if this handle has been disposed */
    readonly disposed: boolean;
}

/** Create a disposable shape handle. */
declare function createHandle(ocShape: any): ShapeHandle;

/** Execute a function with a disposal scope. Resources registered with the scope
 *  are automatically cleaned up when the function returns. */
declare function withScope<T>(fn: (scope: DisposalScope) => T): T;

/** Immutable plane defined by origin and three orthogonal direction vectors. */
interface Plane {
    readonly origin: Vec3;
    readonly xDir: Vec3;
    readonly yDir: Vec3;
    readonly zDir: Vec3;
}

/**
 * Named standard planes.
 *
 * Axis pairs (`'XY'`, `'YZ'`, …) and view names (`'front'`, `'top'`, …)
 * are both supported. The axis-pair order determines the normal direction.
 */
type PlaneName = 'XY' | 'YZ' | 'ZX' | 'XZ' | 'YX' | 'ZY' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

/** Accept either an explicit {@link Plane} object or a {@link PlaneName} string. */
type PlaneInput = Plane | PlaneName;

/**
 * Create a {@link Plane} from an origin, optional X direction, and a normal.
 *
 * If `xDirection` is omitted, the X axis is derived automatically via OCCT `gp_Ax3`.
 *
 * @param origin - Origin point of the plane.
 * @param xDirection - Explicit X axis direction, or `null` to auto-derive.
 * @param normal - Plane normal (Z direction).
 * @throws If the normal or derived xDir is zero-length.
 */
declare function createPlane(origin: Vec3, xDirection?: Vec3 | null, normal?: Vec3): Plane;

/**
 * Create a standard named plane with an optional origin offset.
 *
 * @param name - One of the predefined {@link PlaneName} values.
 * @param sourceOrigin - Origin point, or a scalar offset along the plane normal.
 * @returns `Ok<Plane>` on success, or `Err` if the name is unknown.
 */
declare function createNamedPlane(name: PlaneName, sourceOrigin?: PointInput | number): Result<Plane>;

/**
 * Resolve a {@link PlaneInput} to a concrete {@link Plane}.
 *
 * @throws If a named plane cannot be resolved.
 */
declare function resolvePlane(input: PlaneInput, origin?: PointInput | number): Plane;

/** Translate a plane by a vector. */
declare function translatePlane(plane: Plane, offset: Vec3): Plane;

/**
 * Pivot a plane by rotating its axes around a world-space axis.
 *
 * @param angleDeg - Rotation angle in **degrees**.
 * @param axis - World-space axis to rotate around.
 */
declare function pivotPlane(plane: Plane, angleDeg: number, axis?: Vec3): Plane;

/** Serialize a shape to BREP string format. */
declare function toBREP(shape: AnyShape): string;

/** Get the topology hash code of a shape. */
declare function getHashCode(shape: AnyShape): number;

/** Check if a shape is null. */
declare function isEmpty(shape: AnyShape): boolean;

/** Check if two shapes are the same topological entity. */
declare function isSameShape(a: AnyShape, b: AnyShape): boolean;

/** Check if two shapes are geometrically equal. */
declare function isEqualShape(a: AnyShape, b: AnyShape): boolean;

/** Get all edges of a shape as branded Edge handles. Results are cached per shape. */
declare function getEdges(shape: AnyShape): Edge[];

/** Get all faces of a shape as branded Face handles. Results are cached per shape. */
declare function getFaces(shape: AnyShape): Face[];

/** Get all wires of a shape as branded Wire handles. Results are cached per shape. */
declare function getWires(shape: AnyShape): Wire[];

/** Get all vertices of a shape as branded Vertex handles. */
declare function getVertices(shape: AnyShape): Vertex[];

/** Lazily iterate edges of a shape, yielding branded Edge handles one at a time. */
declare function iterEdges(shape: AnyShape): Generator<Edge>;

/** Lazily iterate faces of a shape, yielding branded Face handles one at a time. */
declare function iterFaces(shape: AnyShape): Generator<Face>;

/** Lazily iterate wires of a shape, yielding branded Wire handles one at a time. */
declare function iterWires(shape: AnyShape): Generator<Wire>;

/** Lazily iterate vertices of a shape, yielding branded Vertex handles one at a time. */
declare function iterVertices(shape: AnyShape): Generator<Vertex>;

/** Bounding box as a plain object. */
interface Bounds3D {
    readonly xMin: number;
    readonly xMax: number;
    readonly yMin: number;
    readonly yMax: number;
    readonly zMin: number;
    readonly zMax: number;
}

/** Get the axis-aligned bounding box of a shape. */
declare function getBounds(shape: AnyShape): Bounds3D;

/** A summary of a shape's topology, geometry, and validity. */
interface ShapeDescription {
    readonly kind: ShapeKind;
    readonly faceCount: number;
    readonly edgeCount: number;
    readonly wireCount: number;
    readonly vertexCount: number;
    readonly valid: boolean;
    readonly bounds: Bounds3D;
}

/** Get a quick summary of a shape for debugging and inspection. */
declare function describe(shape: AnyShape): ShapeDescription;

/** Get the position of a vertex as a Vec3 tuple. */
declare function vertexPosition(vertex: Vertex): Vec3;

/**
 * Chamfer edges of a shape using distance + angle.
 *
 * The distance is measured along the face that contains the edge, and the
 * angle (in degrees) determines how the chamfer cuts into the adjacent face.
 *
 * @param shape   - The 3D shape to chamfer.
 * @param edges   - Edges to chamfer (must not be empty).
 * @param distance - Chamfer distance along the face (must be positive).
 * @param angleDeg - Chamfer angle in degrees (must be in range (0, 90)).
 * @returns Ok with the chamfered shape, or Err on invalid input or kernel failure.
 *
 * @remarks Uses `BRepFilletAPI_MakeChamfer.AddDA(dist, angle, edge, face)` internally.
 */
declare function chamferDistAngleShape(shape: Shape3D, edges: Edge[], distance: number, angleDeg: number): Result<Shape3D>;

/**
 * Get all faces adjacent to a given edge within a parent shape.
 *
 * An edge typically borders exactly two faces in a solid, or one face
 * if the edge is on a boundary.
 *
 * @param parent - The parent shape to search within.
 * @param edge - The edge whose adjacent faces to find.
 * @returns Array of unique faces containing the given edge.
 */
declare function facesOfEdge(parent: AnyShape, edge: Edge): Face[];

/**
 * Get all edges bounding a face.
 *
 * @param face - The face whose edges to enumerate.
 * @returns Array of unique edges forming the face boundary.
 */
declare function edgesOfFace(face: Face): Edge[];

/**
 * Get all wires of a face (outer wire + inner hole wires).
 *
 * @param face - The face whose wires to enumerate.
 */
declare function wiresOfFace(face: Face): Wire[];

/**
 * Get the start and end vertices of an edge.
 *
 * @param edge - The edge whose vertices to retrieve.
 * @returns Array of 1-2 vertices (1 if degenerate/closed, 2 otherwise).
 */
declare function verticesOfEdge(edge: Edge): Vertex[];

/**
 * Get all faces that share at least one edge with the given face.
 *
 * The returned list does not include the input face itself.
 *
 * @param parent - The parent shape to search within.
 * @param face - The face whose neighbors to find.
 * @returns Array of unique adjacent faces (excluding the input face).
 */
declare function adjacentFaces(parent: AnyShape, face: Face): Face[];

/**
 * Get all edges shared between two faces.
 *
 * @param face1 - The first face.
 * @param face2 - The second face.
 * @returns Array of edges present in both faces (via IsSame comparison).
 */
declare function sharedEdges(face1: Face, face2: Face): Edge[];

/**
 * Get the geometric curve type of an edge or wire (LINE, CIRCLE, BSPLINE, etc.).
 */
declare function getCurveType(shape: Edge | Wire): CurveType;

/** Get the start point of a curve. */
declare function curveStartPoint(shape: Edge | Wire): Vec3;

/** Get the end point of a curve. */
declare function curveEndPoint(shape: Edge | Wire): Vec3;

/**
 * Get a point at a normalized parameter position on the curve.
 * @param shape - Edge or wire to evaluate.
 * @param position - Normalized parameter (0 = start, 0.5 = midpoint, 1 = end).
 */
declare function curvePointAt(shape: Edge | Wire, position?: number): Vec3;

/**
 * Get the tangent vector at a normalized parameter position on the curve.
 * @param shape - Edge or wire to evaluate.
 * @param position - Normalized parameter (0 = start, 0.5 = midpoint, 1 = end).
 */
declare function curveTangentAt(shape: Edge | Wire, position?: number): Vec3;

/** Get the arc length of an edge or wire. */
declare function curveLength(shape: Edge | Wire): number;

/** Check if the curve is closed. */
declare function curveIsClosed(shape: Edge | Wire): boolean;

/** Check if the curve is periodic. */
declare function curveIsPeriodic(shape: Edge | Wire): boolean;

/** Get the period of a periodic curve. */
declare function curvePeriod(shape: Edge | Wire): number;

/** Get the topological orientation of an edge or wire. */
declare function getOrientation(shape: Edge | Wire): 'forward' | 'backward';

/** Flip the orientation of an edge or wire. Returns a new shape. */
declare function flipOrientation(shape: Edge | Wire): Edge | Wire;

/** Options for BSpline interpolation through points. */
interface InterpolateCurveOptions {
    /** If true, create a periodic (closed) BSpline. */
    periodic?: boolean;
    /** Fitting tolerance (default varies by kernel). */
    tolerance?: number;
}

/** Options for BSpline approximation through points. */
interface ApproximateCurveOptions {
    /** Maximum deviation from the input points. */
    tolerance?: number;
    /** Minimum BSpline degree. */
    degMin?: number;
    /** Maximum BSpline degree. */
    degMax?: number;
    /** Smoothing weights `[weight1, weight2, weight3]` or null to disable. */
    smoothing?: [number, number, number] | null;
}

/**
 * Interpolate a smooth BSpline curve that passes exactly through the given points.
 *
 * @param points - At least 2 points defining the curve path.
 * @param options - Interpolation options.
 * @returns An Edge representing the interpolated curve.
 */
declare function interpolateCurve(points: Vec3[], options?: InterpolateCurveOptions): Result<Edge>;

/**
 * Approximate a BSpline curve that passes near the given points.
 *
 * @param points - At least 2 points defining the curve path.
 * @param options - Approximation options.
 * @returns An Edge representing the approximated curve.
 */
declare function approximateCurve(points: Vec3[], options?: ApproximateCurveOptions): Result<Edge>;

/**
 * Offset a wire in 2D. Returns a new wire. Does NOT dispose the input.
 *
 * @param wire - The wire to offset.
 * @param offset - Offset distance (positive = outward, negative = inward).
 * @param kind - Join type for offset corners ('arc', 'intersection', or 'tangent').
 * @returns Ok with the offset wire, or Err if the operation fails.
 */
declare function offsetWire2D(wire: Wire, offset: number, kind?: 'arc' | 'intersection' | 'tangent'): Result<Wire>;

/**
 * Get the geometric surface type of a face.
 *
 * @returns Ok with the surface type, or Err for unrecognized OCCT surface types.
 */
declare function getSurfaceType(face: Face): Result<SurfaceType>;

/** Get the surface type of a face (unwrapped convenience). */
declare function faceGeomType(face: Face): SurfaceType;

/** Get the topological orientation of a face. */
declare function faceOrientation(face: Face): 'forward' | 'backward';

/** Flip the orientation of a face. Returns a new face. */
declare function flipFaceOrientation(face: Face): Face;

/** UV parameter bounds of a face. */
interface UVBounds {
    readonly uMin: number;
    readonly uMax: number;
    readonly vMin: number;
    readonly vMax: number;
}

/** Get the UV parameter bounds of a face. */
declare function uvBounds(face: Face): UVBounds;

/**
 * Get a point on a face surface at normalized UV coordinates (0-1 range).
 *
 * @param face - The face to evaluate.
 * @param u - Normalized U parameter (0-1).
 * @param v - Normalized V parameter (0-1).
 */
declare function pointOnSurface(face: Face, u: number, v: number): Vec3;

/** Get the UV coordinates on a face for a given 3D point. */
declare function uvCoordinates(face: Face, point: PointInput): [number, number];

/** Result of projecting a point onto a face surface. */
interface PointProjectionResult {
    /** UV coordinates on the surface. */
    readonly uv: [number, number];
    /** The closest 3D point on the surface. */
    readonly point: Vec3;
    /** Distance from the input point to the projected point. */
    readonly distance: number;
}

/**
 * Project a 3D point onto a face surface.
 *
 * Returns the projected point, its UV coordinates, and the distance
 * from the original point to the surface.
 */
declare function projectPointOnFace(face: Face, point: PointInput): Result<PointProjectionResult>;

/** Get the surface normal at a point (or at the center if no point given). */
declare function normalAt(face: Face, locationPoint?: PointInput): Vec3;

/** Get the center of mass of a face. */
declare function faceCenter(face: Face): Vec3;

/**
 * Classify a 3D point's position relative to a face boundary.
 * Projects the point onto the face's surface and classifies the UV result.
 *
 * @returns 'in' if inside, 'on' if on the boundary, 'out' if outside
 */
declare function classifyPointOnFace(face: Face, point: PointInput, tolerance?: number): 'in' | 'on' | 'out';

/** Get the outer wire of a face. Returns a new Wire. */
declare function outerWire(face: Face): Wire;

/** Get the inner wires (holes) of a face. */
declare function innerWires(face: Face): Wire[];

/** Triangle mesh data extracted from a shape, ready for GPU rendering. */
interface ShapeMesh {
    /** Triangle vertex indices (3 per triangle). */
    triangles: Uint32Array;
    /** Flat array of vertex positions (x,y,z interleaved). */
    vertices: Float32Array;
    /** Flat array of vertex normals (x,y,z interleaved). */
    normals: Float32Array;
    /** Flat array of UV coordinates (u,v interleaved), empty if not requested. */
    uvs: Float32Array;
    /** Per-face triangle index ranges for multi-material rendering. */
    faceGroups: {
        start: number;
        count: number;
        faceId: number;
    }[];
}

/** Line segment mesh data for edge rendering (wireframe). */
interface EdgeMesh {
    /** Flat array of line vertex positions (x,y,z interleaved, 2 vertices per segment). */
    lines: number[];
    /** Per-edge line segment index ranges for highlighting individual edges. */
    edgeGroups: {
        start: number;
        count: number;
        edgeId: number;
    }[];
}

/** Shared options for meshing operations. */
interface MeshOptions {
    /** Linear deflection tolerance (default 1e-3). Smaller = finer mesh. */
    tolerance?: number;
    /** Angular deflection tolerance in radians (default 0.1). Smaller = finer mesh on curved surfaces. */
    angularTolerance?: number;
    /** Abort signal to cancel mesh generation between face iterations. */
    signal?: AbortSignal;
}

/**
 * Mesh a shape as a set of triangles for rendering.
 *
 * Results are cached by default (keyed by shape identity + tolerance parameters).
 * Delegates to the kernel adapter's bulk C++ mesh extraction for performance.
 *
 * @returns A ShapeMesh containing typed arrays ready for GPU upload.
 * @see toBufferGeometryData — convert to Three.js BufferGeometry format
 */
declare function mesh(shape: AnyShape, { tolerance, angularTolerance, skipNormals, includeUVs, cache, signal, }?: MeshOptions & {
    skipNormals?: boolean;
    includeUVs?: boolean;
    cache?: boolean;
}): ShapeMesh;

/**
 * Mesh the edges of a shape as line segments for wireframe rendering.
 *
 * Results are cached by default (keyed by shape identity + tolerance parameters).
 *
 * @returns An EdgeMesh containing line vertex positions and per-edge groups.
 * @see toLineGeometryData — convert to Three.js LineSegments format
 */
declare function meshEdges(shape: AnyShape, { tolerance, angularTolerance, cache }?: MeshOptions & {
    cache?: boolean;
}): EdgeMesh;

/**
 * Export a shape as a STEP file Blob.
 *
 * @returns Ok with a Blob (MIME type `application/STEP`), or Err on failure.
 */
declare function exportSTEP(shape: AnyShape): Result<Blob>;

/**
 * Export a shape as an STL file Blob.
 *
 * @returns Ok with a Blob (MIME type `application/sla`), or Err on failure.
 */
declare function exportSTL(shape: AnyShape, { tolerance, angularTolerance, binary, }?: MeshOptions & {
    binary?: boolean;
}): Result<Blob>;

/**
 * Export a shape as an IGES file Blob.
 *
 * @returns Ok with a Blob (MIME type `application/iges`), or Err on failure.
 */
declare function exportIGES(shape: AnyShape): Result<Blob>;

/**
 * Clear all mesh caches. Call this after modifying shapes to avoid stale results.
 */
declare function clearMeshCache(): void;

/**
 * An isolated mesh cache context for per-viewer or per-worker use.
 *
 * Provides the same get/set interface as the global cache but with
 * independent state, so multiple viewers can cache independently.
 */
interface MeshCacheContext {
    getMesh(shape: any, key: string): ShapeMesh | undefined;
    setMesh(shape: any, key: string, value: ShapeMesh): void;
    getEdgeMesh(shape: any, key: string): EdgeMesh | undefined;
    setEdgeMesh(shape: any, key: string, value: EdgeMesh): void;
    clear(): void;
}

/** Create an isolated mesh cache that doesn't share state with the global cache. */
declare function createMeshCache(): MeshCacheContext;

/** Data ready to be used with THREE.BufferGeometry. */
interface BufferGeometryData {
    /** Flat float array of vertex positions (x,y,z interleaved). */
    position: Float32Array;
    /** Flat float array of vertex normals (x,y,z interleaved). */
    normal: Float32Array;
    /** Triangle index array (3 indices per triangle). */
    index: Uint32Array;
}

/** Line segment data ready for THREE.LineSegments or THREE.Line. */
interface LineGeometryData {
    /** Flat float array of line vertex positions (x,y,z interleaved). */
    position: Float32Array;
}

/**
 * Convert a ShapeMesh into BufferGeometry-compatible typed arrays.
 *
 * The returned arrays can be used directly with Three.js:
 * ```ts
 * const geo = new THREE.BufferGeometry();
 * geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
 * geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
 * geo.setIndex(new THREE.BufferAttribute(data.index, 1));
 * ```
 */
declare function toBufferGeometryData(mesh: ShapeMesh): BufferGeometryData;

/** A material group entry compatible with THREE.BufferGeometry.addGroup(). */
interface BufferGeometryGroup {
    /** Start index in the triangle index buffer. */
    readonly start: number;
    /** Number of indices in this group. */
    readonly count: number;
    /** Sequential material index (0-based). */
    readonly materialIndex: number;
    /** Face topology ID for correlation with the shape's face. */
    readonly faceId: number;
}

/**
 * Convert a ShapeMesh into grouped BufferGeometry data with face material groups.
 *
 * Each face becomes a separate group, allowing per-face materials in Three.js:
 * ```ts
 * const data = toGroupedBufferGeometryData(mesh);
 * const geo = new THREE.BufferGeometry();
 * geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
 * geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
 * geo.setIndex(new THREE.BufferAttribute(data.index, 1));
 * for (const g of data.groups) {
 *   geo.addGroup(g.start, g.count, g.materialIndex);
 * }
 * ```
 */
declare function toGroupedBufferGeometryData(mesh: ShapeMesh): GroupedBufferGeometryData;

/**
 * Convert an EdgeMesh into position data for THREE.LineSegments.
 *
 * ```ts
 * const geo = new THREE.BufferGeometry();
 * geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
 * const lines = new THREE.LineSegments(geo, material);
 * ```
 */
declare function toLineGeometryData(mesh: EdgeMesh): LineGeometryData;

/** Options shared by all boolean and compound operations. */
interface BooleanOptions {
    /** Glue algorithm hint for faces shared between operands. */
    optimisation?: 'none' | 'commonFace' | 'sameFace';
    /** Merge same-domain faces/edges after the boolean. */
    simplify?: boolean;
    /** Algorithm selection: 'native' uses N-way BRepAlgoAPI_BuilderAlgo; 'pairwise' uses recursive divide-and-conquer. */
    strategy?: 'native' | 'pairwise';
    /** Abort signal to cancel long-running operations between steps. */
    signal?: AbortSignal;
}

/**
 * Fuse two 3D shapes together (boolean union). Returns a new shape.
 *
 * @param a - The first operand.
 * @param b - The second operand.
 * @param options - Boolean operation options.
 * @returns Ok with the fused shape, or Err if the result is not 3D.
 *
 * @example
 * ```ts
 * const result = fuse(box, cylinder);
 * if (isOk(result)) console.log(describe(result.value));
 * ```
 */
declare function fuse(a: Shape3D, b: Shape3D, { optimisation, simplify, signal }?: BooleanOptions): Result<Shape3D>;

/**
 * Cut a tool shape from a base shape (boolean subtraction). Returns a new shape.
 *
 * @param base - The shape to cut from.
 * @param tool - The shape to subtract.
 * @param options - Boolean operation options.
 * @returns Ok with the cut shape, or Err if the result is not 3D.
 *
 * @example
 * ```ts
 * const result = cut(box, hole);
 * ```
 */
declare function cut(base: Shape3D, tool: Shape3D, { optimisation, simplify, signal }?: BooleanOptions): Result<Shape3D>;

/**
 * Compute the intersection of two shapes (boolean common). Returns a new shape.
 *
 * @param a - The first operand.
 * @param b - The second operand.
 * @param options - Boolean operation options.
 * @returns Ok with the intersection, or Err if the result is not 3D.
 */
declare function intersect(a: Shape3D, b: Shape3D, { simplify, signal }?: BooleanOptions): Result<Shape3D>;

/**
 * Fuse all shapes in a single boolean operation.
 *
 * With `strategy: 'native'` (default), uses N-way BRepAlgoAPI_BuilderAlgo.
 * With `strategy: 'pairwise'`, uses recursive divide-and-conquer.
 *
 * @param shapes - Array of 3D shapes to fuse (at least one required).
 * @param options - Boolean operation options.
 * @returns Ok with the fused shape, or Err if the array is empty or the result is not 3D.
 *
 * @example
 * ```ts
 * const result = fuseAll([box1, box2, box3], { simplify: true });
 * ```
 */
declare function fuseAll(shapes: Shape3D[], { optimisation, simplify, strategy, signal }?: BooleanOptions): Result<Shape3D>;

/**
 * Cut all tool shapes from a base shape in a single boolean operation.
 *
 * Combines all tools into a compound before cutting to avoid accumulated
 * floating-point drift from sequential pair-wise cuts.
 *
 * @param base - The shape to cut from.
 * @param tools - Array of tool shapes to subtract.
 * @param options - Boolean operation options.
 * @returns Ok with the cut shape, or the base shape unchanged if tools is empty.
 */
declare function cutAll(base: Shape3D, tools: Shape3D[], { optimisation, simplify, signal }?: BooleanOptions): Result<Shape3D>;

/**
 * Section (cross-section) a shape with a plane, returning the intersection
 * edges and wires. Useful for slicing solids to get 2D cross-section profiles.
 *
 * @param shape The shape to section (typically a solid or shell)
 * @param plane Plane definition — a named plane ("XY", "XZ", etc.) or a Plane object
 * @param options.approximation Whether to approximate the section curves (default true)
 * @param options.planeSize Half-size of the cutting plane (default 1e4)
 * @returns The section result as a shape (typically containing wires/edges)
 */
declare function section(shape: AnyShape, plane: PlaneInput, { approximation, planeSize }?: {
    approximation?: boolean;
    planeSize?: number;
}): Result<AnyShape>;

/**
 * Split a shape with one or more tool shapes using BRepAlgoAPI_Splitter.
 * Returns all pieces from the split as a compound.
 */
declare function split(shape: AnyShape, tools: AnyShape[]): Result<AnyShape>;

/**
 * Slice a shape with multiple planes, returning one cross-section per plane.
 * Each result entry corresponds to the input plane at the same index.
 */
declare function slice(shape: AnyShape, planes: PlaneInput[], options?: {
    approximation?: boolean;
    planeSize?: number;
}): Result<AnyShape[]>;

/**
 * Thickens a surface (face or shell) into a solid by offsetting it.
 *
 * Takes a planar or non-planar surface shape and creates a solid
 * by offsetting it by the given thickness. Positive thickness offsets
 * along the surface normal; negative thickness offsets against it.
 */
declare function thicken(shape: Face | Shell, thickness: number): Result<Solid>;

/**
 * Apply a fillet (rounded edge) to selected edges of a 3D shape.
 *
 * @param shape - The shape to modify.
 * @param edges - Edges to fillet. Pass `undefined` to fillet all edges.
 * @param radius - Constant radius, variable radius `[r1, r2]`, or per-edge callback.
 */
declare function fillet(shape: Shape3D, edges: ReadonlyArray<Edge> | undefined, radius: number | [number, number] | ((edge: Edge) => number | [number, number] | null)): Result<Shape3D>;

/**
 * Apply a chamfer (beveled edge) to selected edges of a 3D shape.
 *
 * @param shape - The shape to modify.
 * @param edges - Edges to chamfer. Pass `undefined` to chamfer all edges.
 * @param distance - Symmetric distance, asymmetric `[d1, d2]`, or per-edge callback.
 */
declare function chamfer(shape: Shape3D, edges: ReadonlyArray<Edge> | undefined, distance: number | [number, number] | ((edge: Edge) => number | [number, number] | null)): Result<Shape3D>;

/**
 * Create a hollow shell by removing faces and offsetting remaining walls.
 *
 * @param shape - The solid to hollow out.
 * @param faces - Faces to remove.
 * @param thickness - Wall thickness.
 * @param tolerance - Shell operation tolerance (default 1e-3).
 */
declare function shell(shape: Shape3D, faces: ReadonlyArray<Face>, thickness: number, tolerance?: number): Result<Shape3D>;

/**
 * Offset all faces of a shape by a given distance.
 *
 * @param shape - The shape to offset (must be a 3D shape with faces).
 * @param distance - Offset distance (positive = outward, negative = inward).
 * @param tolerance - Offset tolerance (default 1e-6).
 */
declare function offset(shape: Shape3D, distance: number, tolerance?: number): Result<Shape3D>;

/**
 * Check if a shape is valid according to OCCT geometry and topology checks.
 */
declare function isValid(shape: AnyShape): boolean;

/**
 * Attempt to heal/fix a solid shape.
 *
 * Uses ShapeFix_Solid to repair topology issues like gaps, wrong orientation, etc.
 */
declare function healSolid(solid: Solid): Result<Solid>;

/**
 * Attempt to heal/fix a face.
 *
 * Uses ShapeFix_Face to repair wire ordering, orientation, and geometry issues.
 */
declare function healFace(face: Face): Result<Face>;

/**
 * Attempt to heal/fix a wire.
 *
 * Uses ShapeFix_Wire to repair edge connectivity, gaps, and self-intersections.
 * Requires a face for surface context; pass `undefined` to use a default planar context.
 */
declare function healWire(wire: Wire, face?: Face): Result<Wire>;

/** Diagnostic for a single healing step. */
interface HealingStepDiagnostic {
    readonly name: string;
    readonly attempted: boolean;
    readonly succeeded: boolean;
    readonly detail?: string;
}

/** Options for autoHeal. All default to true. */
interface AutoHealOptions {
    /** Fix wire issues (gaps, connectivity). Default: true. */
    fixWires?: boolean;
    /** Fix face issues (orientation, geometry). Default: true. */
    fixFaces?: boolean;
    /** Fix solid issues (shell gaps, orientation). Default: true. */
    fixSolids?: boolean;
    /** Tolerance for sewing. If provided, applies sewing as a healing step. */
    sewTolerance?: number;
    /** Fix self-intersections in wires. Default: false. */
    fixSelfIntersection?: boolean;
}

/** Report of what the auto-heal pipeline did. */
interface HealingReport {
    readonly isValid: boolean;
    /** True when the shape was already valid before healing was attempted. */
    readonly alreadyValid: boolean;
    readonly wiresHealed: number;
    readonly facesHealed: number;
    readonly solidHealed: boolean;
    readonly steps: ReadonlyArray<string>;
    readonly diagnostics: ReadonlyArray<HealingStepDiagnostic>;
}

/**
 * Automatically heal a shape using the appropriate shape-level fixer.
 *
 * If the shape is already valid, returns it unchanged with a no-op report.
 * Uses ShapeFix_Solid/Face/Wire depending on shape type, which internally
 * handles sub-shape healing and reconstruction.
 */
declare function autoHeal(shape: AnyShape, options?: AutoHealOptions): Result<{
    shape: AnyShape;
    report: HealingReport;
}>;

/** Configuration for sweep/pipe operations along a spine. */
interface SweepConfig {
    /** Use Frenet trihedron for profile orientation */
    frenet?: boolean;
    /** Auxiliary spine for twist control */
    auxiliarySpine?: {
        wrapped: any;
    };
    /** Scaling law along the path */
    law?: any;
    /** Transition mode at corners: 'right' (sharp), 'transformed', or 'round' */
    transitionMode?: 'right' | 'transformed' | 'round';
    /** Enable contact detection */
    withContact?: boolean;
    /** Support surface for constrained sweeps */
    support?: any;
    /** Force profile to be orthogonal to spine */
    forceProfileSpineOthogonality?: boolean;
}

/** Configuration for extrusion profile scaling along the path. */
interface ExtrusionProfile {
    /** Profile curve type: 's-curve' for smooth easing, 'linear' for constant scaling */
    profile?: 's-curve' | 'linear';
    /** End scale factor (1 = same size, 0.5 = half size at end) */
    endFactor?: number;
}

/**
 * Extrude a face along a vector to produce a solid.
 *
 * @param face - The planar face to extrude.
 * @param extrusionVec - Direction and magnitude of the extrusion as `[x, y, z]`.
 * @returns A new solid created by the linear extrusion.
 *
 * @example
 * ```ts
 * const box = extrude(squareFace, [0, 0, 10]);
 * ```
 *
 * @see {@link extrude!basicFaceExtrusion | basicFaceExtrusion} for the OOP API equivalent.
 */
declare function extrude(face: Face, extrusionVec: Vec3): Solid;

/**
 * Revolve a face around an axis to create a solid of revolution.
 *
 * @param face - The face to revolve.
 * @param center - A point on the rotation axis. Defaults to the origin.
 * @param direction - Direction vector of the rotation axis. Defaults to Z-up.
 * @param angle - Rotation angle in degrees (0-360). Defaults to a full revolution.
 * @returns `Result` containing the revolved 3D shape, or an error if the result is not 3D.
 *
 * @see {@link extrude!revolution | revolution} for the OOP API equivalent.
 */
declare function revolve(face: Face, center?: Vec3, direction?: Vec3, angle?: number): Result<Shape3D>;

/**
 * Sweep a wire profile along a spine wire to create a 3D shape.
 *
 * Supports Frenet framing, auxiliary spine twist, scaling laws, contact
 * detection, and configurable corner transition modes.
 *
 * @param wire - The profile wire to sweep.
 * @param spine - The path wire to sweep along.
 * @param config - Sweep configuration (frenet, transition mode, scaling law, etc.).
 * @param shellMode - When `true`, return `[shell, startWire, endWire]` instead of a solid.
 * @returns `Result` containing either a solid or a `[Shape3D, Wire, Wire]` tuple in shell mode.
 *
 * @remarks
 * In WASM, `BRepOffsetAPI_MakePipeShell` supports only a single `Add_1` call per builder.
 * Multi-profile sweeps will silently ignore additional profiles.
 *
 * @see {@link extrude!genericSweep | genericSweep} for the OOP API equivalent.
 */
declare function sweep(wire: Wire, spine: Wire, config?: SweepConfig, shellMode?: boolean): Result<Shape3D | [Shape3D, Wire, Wire]>;

/**
 * Extrude a wire along a normal constrained to a support surface.
 *
 * Constructs a linear spine from `center` to `center + normal` and sweeps
 * the profile wire along it, constrained by the support surface geometry.
 *
 * @param wire - The profile wire to sweep.
 * @param center - Start point of the extrusion spine.
 * @param normal - Direction and length of the extrusion.
 * @param support - OCCT support surface that constrains the sweep.
 * @returns `Result` containing the swept 3D shape.
 *
 * @see {@link extrude!supportExtrude | supportExtrude (OOP)} for the class-based equivalent.
 */
declare function supportExtrude(wire: Wire, center: Vec3, normal: Vec3, support: any): Result<Shape3D>;

/**
 * Extrude a wire along a normal with optional profile scaling.
 *
 * Builds a linear spine from `center` to `center + normal` and sweeps the
 * profile wire. When `profileShape` is provided, a scaling law (s-curve or
 * linear) modulates the cross-section size along the path.
 *
 * @param wire - The profile wire to sweep.
 * @param center - Start point of the extrusion spine.
 * @param normal - Direction and length of the extrusion. Must be non-zero.
 * @param profileShape - Optional scaling profile applied along the extrusion.
 * @param shellMode - When `true`, return `[shell, startWire, endWire]` instead of a solid.
 * @returns `Result` containing the extruded shape or a shell tuple.
 *
 * @example
 * ```ts
 * const tapered = complexExtrude(wire, [0,0,0], [0,0,50], {
 *   profile: 'linear', endFactor: 0.5
 * });
 * ```
 *
 * @see {@link extrude!complexExtrude | complexExtrude (OOP)} for the class-based equivalent.
 */
declare function complexExtrude(wire: Wire, center: Vec3, normal: Vec3, profileShape?: ExtrusionProfile, shellMode?: boolean): Result<Shape3D | [Shape3D, Wire, Wire]>;

/**
 * Extrude a wire along a normal with helical twist and optional profile scaling.
 *
 * Constructs a helical auxiliary spine that rotates the profile by
 * `angleDegrees` over the extrusion length. Combines twist with optional
 * s-curve or linear scaling when `profileShape` is provided.
 *
 * @param wire - The profile wire to sweep.
 * @param angleDegrees - Total twist rotation in degrees. Must be non-zero.
 * @param center - Start point of the extrusion spine.
 * @param normal - Direction and length of the extrusion. Must be non-zero.
 * @param profileShape - Optional scaling profile applied along the extrusion.
 * @param shellMode - When `true`, return `[shell, startWire, endWire]` instead of a solid.
 * @returns `Result` containing the twisted extruded shape or a shell tuple.
 *
 * @see {@link extrude!twistExtrude | twistExtrude (OOP)} for the class-based equivalent.
 */
declare function twistExtrude(wire: Wire, angleDegrees: number, center: Vec3, normal: Vec3, profileShape?: ExtrusionProfile, shellMode?: boolean): Result<Shape3D | [Shape3D, Wire, Wire]>;

/** Configuration for the functional loft operation. */
interface LoftConfig {
    /** Use ruled (straight) interpolation between profiles. Defaults to `true`. */
    ruled?: boolean;
    /** Optional start vertex before the first wire profile. */
    startPoint?: PointInput;
    /** Optional end vertex after the last wire profile. */
    endPoint?: PointInput;
}

/**
 * Loft through a set of wire profiles to create a 3D shape.
 *
 * Builds a `BRepOffsetAPI_ThruSections` surface through the given wires,
 * optionally starting and/or ending at point vertices. Produces a solid
 * by default, or a shell when `returnShell` is `true`.
 *
 * @param wires - Ordered wire profiles to loft through.
 * @param config - Loft configuration (ruled interpolation, start/end points).
 * @param returnShell - When `true`, return a shell instead of a solid.
 * @returns `Result` containing the lofted 3D shape, or an error on failure.
 *
 * @example
 * ```ts
 * const result = loft([bottomWire, topWire], { ruled: false });
 * ```
 *
 * @see {@link loft!loft | loft} for the OOP API equivalent.
 */
declare function loft(wires: Wire[], { ruled, startPoint, endPoint }?: LoftConfig, returnShell?: boolean): Result<Shape3D>;

/** Supported length units for STEP export. */
type SupportedUnit = 'M' | 'CM' | 'MM' | 'INCH' | 'FT' | 'm' | 'mm' | 'cm' | 'inch' | 'ft';

/** Configuration for a single shape within a functional assembly export. */
interface ShapeConfig {
    /** The branded shape to include in the assembly. */
    shape: AnyShape;
    /** Hex color string (e.g. `'#ff0000'`). Defaults to red. */
    color?: string;
    /** Opacity from 0 (transparent) to 1 (opaque). Defaults to 1. */
    alpha?: number;
    /** Display name for the shape node. Auto-generated UUID if omitted. */
    name?: string;
}

/**
 * Create an XCAF document from shape configs and export as a STEP blob.
 *
 * Builds an in-memory XCAF assembly with named, colored shape nodes, writes
 * it through `STEPCAFControl_Writer`, and returns the file contents as a
 * `Blob`. The XCAF document is deleted after export to avoid memory leaks.
 *
 * @param shapes - Shapes to include in the STEP file.
 * @param options - Optional unit settings for the STEP writer.
 * @param options.unit - Write unit (e.g. `'MM'`, `'INCH'`).
 * @param options.modelUnit - Model unit; defaults to the write unit.
 * @returns `Result` containing a `Blob` with MIME type `application/STEP`.
 *
 * @example
 * ```ts
 * const result = exportAssemblySTEP(
 *   [{ shape: myBox, color: '#00ff00', name: 'box' }],
 *   { unit: 'MM' }
 * );
 * if (result.ok) saveAs(result.value, 'model.step');
 * ```
 *
 * @see {@link exporters!exportSTEP | exportSTEP} for the OOP API equivalent.
 */
declare function exportAssemblySTEP(shapes?: ShapeConfig[], { unit, modelUnit }?: {
    unit?: SupportedUnit;
    modelUnit?: SupportedUnit;
}): Result<Blob>;

/**
 * Create a linear pattern of a shape along a direction.
 *
 * @param shape - The shape to replicate
 * @param direction - Direction vector for the pattern
 * @param count - Total number of copies (including the original)
 * @param spacing - Distance between each copy along the direction
 * @param options - Boolean options for the fuse operation
 * @returns Fused shape of all copies
 */
declare function linearPattern(shape: Shape3D, direction: Vec3, count: number, spacing: number, options?: BooleanOptions): Result<Shape3D>;

/**
 * Create a circular pattern of a shape around an axis.
 *
 * @param shape - The shape to replicate
 * @param axis - Rotation axis direction
 * @param count - Total number of copies (including the original)
 * @param fullAngle - Total angle to spread copies over in degrees (default: 360)
 * @param center - Center point of rotation (default: [0,0,0])
 * @param options - Boolean options for the fuse operation
 * @returns Fused shape of all copies
 */
declare function circularPattern(shape: Shape3D, axis: Vec3, count: number, fullAngle?: number, center?: Vec3, options?: BooleanOptions): Result<Shape3D>;

interface AssemblyNode {
    readonly name: string;
    readonly shape?: AnyShape;
    readonly translate?: Vec3;
    readonly rotate?: {
        angle: number;
        axis?: Vec3;
    };
    readonly metadata?: Readonly<Record<string, unknown>>;
    readonly children: ReadonlyArray<AssemblyNode>;
}

interface AssemblyNodeOptions {
    shape?: AnyShape;
    translate?: Vec3;
    rotate?: {
        angle: number;
        axis?: Vec3;
    };
    metadata?: Record<string, unknown>;
}

/** Create a new assembly node. */
declare function createAssemblyNode(name: string, options?: AssemblyNodeOptions): AssemblyNode;

/** Add a child node. Returns a new parent node. */
declare function addChild(parent: AssemblyNode, child: AssemblyNode): AssemblyNode;

/** Remove a child by name (first match). Returns a new parent node. */
declare function removeChild(parent: AssemblyNode, childName: string): AssemblyNode;

/** Update a node's properties. Returns a new node. */
declare function updateNode(node: AssemblyNode, updates: Partial<AssemblyNodeOptions>): AssemblyNode;

/** Find a node by name (depth-first). Returns undefined if not found. */
declare function findNode(root: AssemblyNode, name: string): AssemblyNode | undefined;

/** Walk the tree depth-first, calling visitor for each node. */
declare function walkAssembly(root: AssemblyNode, visitor: (node: AssemblyNode, depth: number) => void, depth?: number): void;

/** Count all nodes in the tree. */
declare function countNodes(root: AssemblyNode): number;

/** Collect all shapes in the tree (depth-first). */
declare function collectShapes(root: AssemblyNode): AnyShape[];

interface OperationStep {
    readonly id: string;
    readonly type: string;
    readonly parameters: Readonly<Record<string, unknown>>;
    readonly inputIds: ReadonlyArray<string>;
    readonly outputId: string;
    readonly timestamp: number;
    readonly metadata?: Readonly<Record<string, unknown>>;
}

interface ModelHistory {
    readonly steps: ReadonlyArray<OperationStep>;
    readonly shapes: ReadonlyMap<string, AnyShape>;
}

/** Create a new empty history. */
declare function createHistory(): ModelHistory;

/** Add a step and its output shape. Returns a new history. */
declare function addStep(history: ModelHistory, step: Omit<OperationStep, 'timestamp'>, outputShape: AnyShape): ModelHistory;

/** Remove the last step and clean up orphaned shapes. Returns a new history. */
declare function undoLast(history: ModelHistory): ModelHistory;

/** Find a step by its ID. */
declare function findStep(history: ModelHistory, stepId: string): OperationStep | undefined;

/** Retrieve a shape by its ID. */
declare function getShape(history: ModelHistory, shapeId: string): AnyShape | undefined;

/** Return the number of steps in the history. */
declare function stepCount(history: ModelHistory): number;

/** Return all steps from a given step ID onwards (inclusive). */
declare function stepsFrom(history: ModelHistory, stepId: string): ReadonlyArray<OperationStep>;

/** Register an initial shape without an operation step. Returns a new history. */
declare function registerShape(history: ModelHistory, id: string, shape: AnyShape): ModelHistory;

/** A function that executes a modelling operation. */
type OperationFn = (inputs: AnyShape[], params: Record<string, unknown>) => AnyShape;

/** An immutable registry of named operations. */
interface OperationRegistry {
    readonly operations: ReadonlyMap<string, OperationFn>;
}

/** Create an empty operation registry. */
declare function createRegistry(): OperationRegistry;

/** Register an operation. Returns a new registry (immutable). */
declare function registerOperation(registry: OperationRegistry, type: string, fn: OperationFn): OperationRegistry;

/**
 * Replay an entire history from scratch using the given registry.
 *
 * All initial shapes (those not produced by any step) must already be in the
 * history's shapes map. Steps are replayed in order. Returns a new history
 * with fresh output shapes.
 */
declare function replayHistory(history: ModelHistory, registry: OperationRegistry): Result<ModelHistory>;

/**
 * Replay history from a specific step onwards.
 *
 * Steps before `stepId` are kept as-is. Steps from `stepId` onwards are
 * re-executed using the registry.
 */
declare function replayFrom(history: ModelHistory, stepId: string, registry: OperationRegistry): Result<ModelHistory>;

/**
 * Modify a step's parameters and replay from that point.
 *
 * Creates a new history with the updated parameters for the specified step,
 * then replays from that step onwards.
 */
declare function modifyStep(history: ModelHistory, stepId: string, newParams: Readonly<Record<string, unknown>>, registry: OperationRegistry): Result<ModelHistory>;

interface CurvatureResult {
    /** Mean curvature: H = (k1 + k2) / 2 */
    mean: number;
    /** Gaussian curvature: K = k1 * k2 */
    gaussian: number;
    /** Maximum principal curvature */
    maxCurvature: number;
    /** Minimum principal curvature */
    minCurvature: number;
    /** Direction of maximum curvature */
    maxDirection: [number, number, number];
    /** Direction of minimum curvature */
    minDirection: [number, number, number];
}

/** Base physical properties returned by BRepGProp measurements. */
interface PhysicalProps {
    /** Raw mass property from BRepGProp (volume, area, or length depending on measurement type). */
    readonly mass: number;
    /** Center of mass as an [x, y, z] tuple. */
    readonly centerOfMass: Vec3;
}

/**
 * Measure volume properties of a 3D shape.
 *
 * @param shape - A solid or compound shape.
 * @returns Volume, center of mass, and raw mass property.
 * @see {@link measureVolume} for a shorthand that returns only the volume number.
 *
 * @example
 * ```ts
 * const props = measureVolumeProps(mySolid);
 * console.log(props.volume, props.centerOfMass);
 * ```
 */
declare function measureVolumeProps(shape: Shape3D): VolumeProps;

/**
 * Measure surface properties of a face or 3D shape.
 *
 * @param shape - A Face or any 3D shape (the total outer surface area is measured).
 * @returns Surface area, center of mass, and raw mass property.
 * @see {@link measureArea} for a shorthand that returns only the area number.
 */
declare function measureSurfaceProps(shape: Face | Shape3D): SurfaceProps;

/**
 * Measure linear properties of any shape.
 *
 * For edges this is the arc length; for wires/compounds it is the total
 * length of all edges.
 *
 * @param shape - Any shape whose linear extent is to be measured.
 * @returns Length, center of mass, and raw mass property.
 * @see {@link measureLength} for a shorthand that returns only the length number.
 */
declare function measureLinearProps(shape: AnyShape): LinearProps;

/**
 * Get the volume of a 3D shape.
 *
 * @see {@link measureVolumeProps} for the full property set including center of mass.
 */
declare function measureVolume(shape: Shape3D): number;

/**
 * Get the surface area of a face or 3D shape.
 *
 * @see {@link measureSurfaceProps} for the full property set including center of mass.
 */
declare function measureArea(shape: Face | Shape3D): number;

/**
 * Get the arc length of a shape.
 *
 * @see {@link measureLinearProps} for the full property set including center of mass.
 */
declare function measureLength(shape: AnyShape): number;

/**
 * Measure the minimum distance between two shapes.
 *
 * @example
 * ```ts
 * const gap = measureDistance(boxA, boxB);
 * ```
 */
declare function measureDistance(shape1: AnyShape, shape2: AnyShape): number;

/**
 * Create a reusable distance query from a reference shape.
 *
 * Keeps the reference shape loaded in the OCCT distance tool so that
 * multiple `distanceTo` calls avoid re-loading overhead.
 *
 * @remarks Call `dispose()` when done to free the WASM-allocated distance tool.
 *
 * @param referenceShape - The shape to measure distances from.
 * @returns An object with `distanceTo(other)` and `dispose()` methods.
 *
 * @example
 * ```ts
 * const query = createDistanceQuery(referenceBox);
 * const d1 = query.distanceTo(otherBox);
 * const d2 = query.distanceTo(sphere);
 * query.dispose();
 * ```
 */
declare function createDistanceQuery(referenceShape: AnyShape): {
    distanceTo: (other: AnyShape) => number;
    dispose: () => void;
};

/**
 * Measure surface curvature at a (u, v) parameter point on a face.
 *
 * Returns mean, Gaussian, and principal curvatures with directions.
 * The u, v parameters correspond to the face's parametric domain.
 *
 * @param face - The face to evaluate.
 * @param u - Parameter in the U direction.
 * @param v - Parameter in the V direction.
 *
 * @example
 * ```ts
 * const curv = measureCurvatureAt(cylinderFace, 0.5, 0.5);
 * console.log(curv.meanCurvature, curv.gaussianCurvature);
 * ```
 */
declare function measureCurvatureAt(face: Face, u: number, v: number): CurvatureResult;

/**
 * Measure surface curvature at the mid-point of a face's UV bounds.
 *
 * Uses `BRepTools::UVBounds` for the actual trimmed face UV region,
 * avoiding singularities that can occur with surface-level parameter bounds.
 *
 * @param face - The face to evaluate at its parametric center.
 * @see {@link measureCurvatureAt} to evaluate at an arbitrary (u, v) point.
 */
declare function measureCurvatureAtMid(face: Face): CurvatureResult;

/** Result of a pairwise interference check between two shapes. */
interface InterferenceResult {
    /** True if shapes are touching or overlapping (distance within tolerance). */
    readonly hasInterference: boolean;
    /** Minimum distance between the shapes. 0 when touching or overlapping. */
    readonly minDistance: number;
    /** Closest point on the first shape as [x, y, z]. */
    readonly pointOnShape1: Vec3;
    /** Closest point on the second shape as [x, y, z]. */
    readonly pointOnShape2: Vec3;
}

/** A pair of shapes that were found to interfere during batch checking. */
interface InterferencePair {
    /** Index of the first shape in the input array. */
    readonly i: number;
    /** Index of the second shape in the input array. */
    readonly j: number;
    /** Detailed interference result for this pair. */
    readonly result: InterferenceResult;
}

/**
 * Check for interference (collision/contact) between two shapes.
 *
 * Returns detailed proximity information including the minimum distance
 * and closest points. Shapes are considered interfering when their
 * minimum distance is within the given tolerance.
 *
 * @param shape1 - First shape.
 * @param shape2 - Second shape.
 * @param tolerance - Distance threshold below which shapes are considered interfering. Default: 1e-6.
 * @returns A `Result` wrapping the {@link InterferenceResult}.
 *
 * @example
 * ```ts
 * const result = unwrap(checkInterference(boxA, boxB));
 * if (result.hasInterference) {
 *   console.log('Collision at distance', result.minDistance);
 * }
 * ```
 */
declare function checkInterference(shape1: AnyShape, shape2: AnyShape, tolerance?: number): Result<InterferenceResult>;

/**
 * Check all pairs in an array of shapes for interference.
 *
 * Returns only pairs that have interference (distance within tolerance).
 * For N shapes, checks N*(N-1)/2 unique pairs.
 *
 * @param shapes - Array of shapes to test pairwise.
 * @param tolerance - Distance threshold for interference. Default: 1e-6.
 * @returns Array of {@link InterferencePair} entries, one per colliding pair.
 *
 * @example
 * ```ts
 * const collisions = checkAllInterferences([box, sphere, cylinder]);
 * collisions.forEach(({ i, j }) => console.log(`Shape ${i} hits shape ${j}`));
 * ```
 */
declare function checkAllInterferences(shapes: ReadonlyArray<AnyShape>, tolerance?: number): InterferencePair[];

/**
 * Import a STEP file from a Blob.
 *
 * Writes the blob to the WASM virtual filesystem, reads it with
 * `STEPControl_Reader`, and returns the resulting shape.
 *
 * @param blob - A Blob or File containing STEP data (.step / .stp).
 * @returns A `Result` wrapping the imported shape, or an error if parsing fails.
 *
 * @remarks The temporary file on the WASM FS is cleaned up automatically.
 *
 * @example
 * ```ts
 * const file = new File([stepData], 'part.step');
 * const shape = unwrap(await importSTEP(file));
 * ```
 */
declare function importSTEP(blob: Blob): Promise<Result<AnyShape>>;

/**
 * Import an STL file from a Blob.
 *
 * Reads the mesh, unifies same-domain faces with `ShapeUpgrade_UnifySameDomain`,
 * and wraps the result as a solid.
 *
 * @param blob - A Blob or File containing STL data (binary or ASCII).
 * @returns A `Result` wrapping the imported solid, or an error if parsing fails.
 *
 * @remarks The temporary file on the WASM FS is cleaned up automatically.
 *
 * @example
 * ```ts
 * const shape = unwrap(await importSTL(stlBlob));
 * ```
 */
declare function importSTL(blob: Blob): Promise<Result<AnyShape>>;

/**
 * Import an IGES file from a Blob.
 *
 * @param blob - A Blob or File containing IGES data (.iges / .igs).
 * @returns A `Result` wrapping the imported shape, or an error if parsing fails.
 *
 * @remarks The temporary file on the WASM FS is cleaned up automatically.
 *
 * @example
 * ```ts
 * const shape = unwrap(await importIGES(igesBlob));
 * ```
 */
declare function importIGES(blob: Blob): Promise<Result<AnyShape>>;

/** Create an immutable edge finder. */
declare function edgeFinder(): EdgeFinderFn;

/** Create an immutable face finder. */
declare function faceFinder(): FaceFinderFn;

/** Create an immutable wire finder. */
declare function wireFinder(): WireFinderFn;

/** Create an immutable vertex finder. */
declare function vertexFinder(): VertexFinderFn;

/** Common interface satisfied by both CornerFinder class and cornerFinder() factory. */
interface CornerFilter {
    readonly shouldKeep: (corner: Corner) => boolean;
}

/** Create an immutable corner finder for 2D blueprint corners. */
declare function cornerFinder(): CornerFinderFn;

/**
 * Immutable plain-object representation of a projection camera.
 */
interface Camera {
    readonly position: Vec3;
    readonly direction: Vec3;
    readonly xAxis: Vec3;
    readonly yAxis: Vec3;
}

/**
 * Create a camera from position, direction, and an optional X-axis.
 *
 * If `xAxis` is omitted, it is derived automatically from the direction.
 *
 * @param position - Camera position in world coordinates.
 * @param direction - View direction (camera looks along this vector).
 * @param xAxis - Optional horizontal axis; derived automatically if not provided.
 * @returns `Result<Camera>` -- an error if direction is zero-length.
 */
declare function createCamera(position?: Vec3, direction?: Vec3, xAxis?: Vec3): Result<Camera>;

/**
 * Create a new camera oriented to look at a target point from the current position.
 *
 * @param camera - Existing camera whose position is preserved.
 * @param target - World-space point to look at.
 * @returns `Result<Camera>` with updated direction and derived axes.
 */
declare function cameraLookAt(camera: Camera, target: Vec3): Result<Camera>;

/**
 * Create a camera positioned at the origin, looking along a named projection plane.
 *
 * @param planeName - Named projection direction (e.g., `'front'`, `'top'`).
 * @returns `Result<Camera>` configured for that standard view.
 */
declare function cameraFromPlane(planeName: ProjectionPlane): Result<Camera>;

/**
 * Project the edges of a 3D shape onto a 2D plane defined by a {@link Camera}.
 *
 * @param shape - The 3D shape to project.
 * @param camera - Camera defining the projection plane.
 * @param withHiddenLines - If true, compute hidden-line edges as well.
 * @returns Separate arrays of visible and hidden projected edges.
 *
 * @see {@link drawProjection} for the higher-level Drawing-based API.
 */
declare function projectEdges(shape: AnyShape, camera: Camera, withHiddenLines?: boolean): {
    visible: Edge[];
    hidden: Edge[];
};

/**
 * Worker communication protocol for offloading CAD operations.
 *
 * Messages are sent between the main thread and worker threads.
 * Shapes are transferred as BREP-serialized strings.
 */
/** Base interface for all messages sent from the main thread to a worker. */
interface WorkerRequest {
    /** Unique identifier for correlating requests with responses. */
    readonly id: string;
    /** Discriminant indicating the kind of request. */
    readonly type: 'init' | 'operation' | 'dispose';
}

/** Base interface for all messages sent from a worker back to the main thread. */
interface WorkerResponse {
    /** Matches the {@link WorkerRequest.id} of the originating request. */
    readonly id: string;
    /** Discriminant: `true` for success, `false` for error. */
    readonly success: boolean;
}

/** Narrow a {@link WorkerRequest} to an {@link InitRequest}. */
declare function isInitRequest(msg: WorkerRequest): msg is InitRequest;

/** Narrow a {@link WorkerRequest} to an {@link OperationRequest}. */
declare function isOperationRequest(msg: WorkerRequest): msg is OperationRequest;

/** Narrow a {@link WorkerRequest} to a {@link DisposeRequest}. */
declare function isDisposeRequest(msg: WorkerRequest): msg is DisposeRequest;

/** Narrow a {@link WorkerResponse} to a {@link SuccessResponse}. */
declare function isSuccessResponse(msg: WorkerResponse): msg is SuccessResponse;

/** Narrow a {@link WorkerResponse} to an {@link ErrorResponse}. */
declare function isErrorResponse(msg: WorkerResponse): msg is ErrorResponse;

/**
 * Task queue for managing pending worker operations.
 * Pure data structure -- no Worker API dependency.
 */
/** A task awaiting a response from the worker. */
interface PendingTask<T = unknown> {
    readonly id: string;
    readonly resolve: (value: T) => void;
    readonly reject: (reason: unknown) => void;
    readonly createdAt: number;
}

/** Immutable queue of pending worker tasks, keyed by ID. */
interface TaskQueue<T = unknown> {
    readonly pending: ReadonlyMap<string, PendingTask<T>>;
}

/** Create an empty task queue. */
declare function createTaskQueue<T = unknown>(): TaskQueue<T>;

/** Add a task to the queue. Returns the updated queue. */
declare function enqueueTask<T>(queue: TaskQueue<T>, task: PendingTask<T>): TaskQueue<T>;

/** Remove and return a task from the queue. */
declare function dequeueTask<T>(queue: TaskQueue<T>, taskId: string): {
    queue: TaskQueue<T>;
    task: PendingTask<T> | undefined;
};

/** Get the number of pending tasks. */
declare function pendingCount<T>(queue: TaskQueue<T>): number;

/** Check if the queue has no pending tasks. */
declare function isEmpty<T>(queue: TaskQueue<T>): boolean;

/** Reject all pending tasks with the given reason. */
declare function rejectAll<T>(queue: TaskQueue<T>, reason: unknown): TaskQueue<T>;

/**
 * Worker client for offloading CAD operations to a Web Worker.
 *
 * Provides a promise-based API over the worker message protocol.
 */
interface WorkerClientOptions {
    /** The Worker instance to communicate with. */
    worker: Worker;
    /** Optional URL for the WASM binary (passed to the worker on init). */
    wasmUrl?: string;
}

/** Result returned from a successful worker operation. */
interface WorkerResult {
    resultBrep?: string;
    resultData?: unknown;
}

interface WorkerClient {
    /** Initialize the worker (load WASM). */
    init(): Promise<void>;
    /** Execute a named operation with BREP-serialized shapes and parameters. */
    execute(operation: string, shapesBrep: string[], params: Record<string, unknown>): Promise<WorkerResult>;
    /** Dispose the client, rejecting all pending operations. */
    dispose(): void;
}

/** Create a worker client that communicates using the brepjs worker protocol. */
declare function createWorkerClient(options: WorkerClientOptions): WorkerClient;

/**
 * Worker handler for processing CAD operations inside a Web Worker.
 *
 * Provides a registry-based approach for defining operation handlers.
 */
/** Handler function for a single named worker operation. */
type OperationHandler = (shapesBrep: ReadonlyArray<string>, params: Readonly<Record<string, unknown>>) => {
    resultBrep?: string;
    resultData?: unknown;
};

/** Create an empty operation registry. */
declare function createOperationRegistry(): OperationRegistry;

/** Register a named operation handler. Returns a new registry. */
declare function registerHandler(registry: OperationRegistry, name: string, handler: OperationHandler): OperationRegistry;

/**
 * Set up message handling in a Web Worker context.
 *
 * @param registry - The operation registry.
 * @param initFn - Async function called on InitRequest (e.g., to load WASM).
 */
declare function createWorkerHandler(registry: OperationRegistry, initFn: (wasmUrl?: string) => Promise<void>): void;

/**
 * Structural type matching a Drawing's wire-producing interface.
 * Used in place of importing the actual Drawing class to avoid
 * Layer 2 → Layer 3 boundary violations.
 */
interface DrawingLike {
    sketchOnPlane(plane: string): {
        wire: Wire;
    };
}

/**
 * Fillet radius specification.
 *
 * - `number` — constant radius on all selected edges
 * - `[number, number]` — variable radius (start, end)
 * - callback — per-edge radius; return `null` to skip an edge
 */
type FilletRadius = number | [number, number] | ((edge: Edge) => number | [number, number] | null);

/**
 * Chamfer distance specification.
 *
 * - `number` — equal distance
 * - `[number, number]` — asymmetric distances (dist1, dist2)
 * - `{ distance, angle }` — distance-angle mode (replaces chamferDistAngleShape)
 * - callback — per-edge distance; return `null` to skip an edge
 */
type ChamferDistance = number | [number, number] | {
    distance: number;
    angle: number;
} | ((edge: Edge) => number | [number, number] | {
    distance: number;
    angle: number;
} | null);

/** Options for the drill() compound operation. */
interface DrillOptions {
    /** Position of the hole (Vec2 projects along axis). */
    at: Vec2 | Vec3;
    /** Hole radius. */
    radius: number;
    /** Hole depth. Omit for through-all (computed from bounds). */
    depth?: number;
    /** Drill axis direction. Default: [0, 0, 1] (Z). */
    axis?: Vec3;
}

/** Options for the pocket() compound operation. */
interface PocketOptions {
    /** 2D profile shape to cut into the face. */
    profile: DrawingLike | Wire;
    /** Which face to pocket. Default: top face. */
    face?: Face | FinderFn<Face>;
    /** Depth of the pocket cut. */
    depth: number;
}

/** Options for the boss() compound operation. */
interface BossOptions {
    /** 2D profile shape to extrude onto the face. */
    profile: DrawingLike | Wire;
    /** Which face to add onto. Default: top face. */
    face?: Face | FinderFn<Face>;
    /** Height of the boss extrusion. */
    height: number;
}

/** Options for the mirrorJoin() compound operation. */
interface MirrorJoinOptions {
    /** Mirror plane normal. Default: [1, 0, 0] (mirror across YZ plane). */
    normal?: Vec3;
    /** Mirror plane origin. Default: [0, 0, 0]. */
    origin?: Vec3;
}

/** Options for the rectangularPattern() compound operation. */
interface RectangularPatternOptions {
    /** Direction for X repetition. */
    xDir: Vec3;
    /** Number of copies in X direction. */
    xCount: number;
    /** Spacing between copies in X direction. */
    xSpacing: number;
    /** Direction for Y repetition. */
    yDir: Vec3;
    /** Number of copies in Y direction. */
    yCount: number;
    /** Spacing between copies in Y direction. */
    ySpacing: number;
}

/** Extract the raw branded 3D shape from a Shapeable<Shape3D>. */
declare function resolve3D(s: Shapeable<Shape3D>): Shape3D;

/** Options for {@link box}. */
interface BoxOptions {
    /** `true` = centered at origin; `Vec3` = centered at point. Omit = corner at origin. */
    center?: true | Vec3;
}

/**
 * Create a box with the given dimensions.
 *
 * @param width  - Size along X.
 * @param depth  - Size along Y.
 * @param height - Size along Z.
 */
declare function box(width: number, depth: number, height: number, options?: BoxOptions): Solid;

/** Options for {@link cylinder}. */
interface CylinderOptions {
    /** Base position. Default: [0, 0, 0]. */
    at?: Vec3;
    /** Cylinder axis direction. Default: [0, 0, 1] (Z-up). */
    axis?: Vec3;
    /** Center vertically instead of base at origin. */
    centered?: boolean;
}

/**
 * Create a cylinder with the given radius and height.
 */
declare function cylinder(radius: number, height: number, options?: CylinderOptions): Solid;

/** Options for {@link sphere}. */
interface SphereOptions {
    /** Center position. Default: [0, 0, 0]. */
    at?: Vec3;
}

/**
 * Create a sphere with the given radius.
 */
declare function sphere(radius: number, options?: SphereOptions): Solid;

/** Options for {@link cone}. */
interface ConeOptions {
    /** Base position. Default: [0, 0, 0]. */
    at?: Vec3;
    /** Cone axis direction. Default: [0, 0, 1]. */
    axis?: Vec3;
    /** Center vertically instead of base at origin. */
    centered?: boolean;
}

/**
 * Create a cone (or frustum) with the given radii and height.
 *
 * @param bottomRadius - Radius at the base.
 * @param topRadius    - Radius at the top (0 for a full cone).
 * @param height       - Height of the cone.
 */
declare function cone(bottomRadius: number, topRadius: number, height: number, options?: ConeOptions): Solid;

/** Options for {@link torus}. */
interface TorusOptions {
    /** Center position. Default: [0, 0, 0]. */
    at?: Vec3;
    /** Torus axis direction. Default: [0, 0, 1]. */
    axis?: Vec3;
}

/**
 * Create a torus with the given major and minor radii.
 */
declare function torus(majorRadius: number, minorRadius: number, options?: TorusOptions): Solid;

/** Options for {@link ellipsoid}. */
interface EllipsoidOptions {
    /** Center position. Default: [0, 0, 0]. */
    at?: Vec3;
}

/**
 * Create an ellipsoid with the given axis half-lengths.
 *
 * @param rx - Half-length along X.
 * @param ry - Half-length along Y.
 * @param rz - Half-length along Z.
 */
declare function ellipsoid(rx: number, ry: number, rz: number, options?: EllipsoidOptions): Solid;

/** Create a straight edge between two 3D points. */
declare function line(from: Vec3, to: Vec3): Edge;

/** Options for {@link circle}. */
interface CircleOptions {
    /** Center. Default: [0, 0, 0]. */
    at?: Vec3;
    /** Normal direction. Default: [0, 0, 1]. */
    normal?: Vec3;
}

/** Create a circular edge with the given radius. */
declare function circle(radius: number, options?: CircleOptions): Edge;

/** Options for {@link ellipse}. */
interface EllipseOptions {
    /** Center. Default: [0, 0, 0]. */
    at?: Vec3;
    /** Normal direction. Default: [0, 0, 1]. */
    normal?: Vec3;
    /** Major axis direction. */
    xDir?: Vec3;
}

/**
 * Create an elliptical edge.
 *
 * @returns An error if `minorRadius` exceeds `majorRadius`.
 */
declare function ellipse(majorRadius: number, minorRadius: number, options?: EllipseOptions): Result<Edge>;

/** Options for {@link helix}. */
interface HelixOptions {
    /** Base position. Default: [0, 0, 0]. */
    at?: Vec3;
    /** Helix axis. Default: [0, 0, 1]. */
    axis?: Vec3;
    /** Wind in left-hand direction. Default: false. */
    lefthand?: boolean;
}

/**
 * Create a helical wire.
 *
 * @param pitch  - Vertical distance per full turn.
 * @param height - Total height.
 * @param radius - Helix radius.
 */
declare function helix(pitch: number, height: number, radius: number, options?: HelixOptions): Wire;

/** Create a circular arc edge passing through three points. */
declare function threePointArc(p1: Vec3, p2: Vec3, p3: Vec3): Edge;

/** Options for {@link ellipseArc}. */
interface EllipseArcOptions {
    /** Center. Default: [0, 0, 0]. */
    at?: Vec3;
    /** Normal direction. Default: [0, 0, 1]. */
    normal?: Vec3;
    /** Major axis direction. */
    xDir?: Vec3;
}

/**
 * Create an elliptical arc edge between two angles.
 *
 * All angles are in **degrees** (unlike the legacy `makeEllipseArc` which used radians).
 *
 * @param startAngle - Start angle in degrees.
 * @param endAngle   - End angle in degrees.
 */
declare function ellipseArc(majorRadius: number, minorRadius: number, startAngle: number, endAngle: number, options?: EllipseArcOptions): Result<Edge>;

/**
 * Create a B-spline edge that approximates a set of 3D points.
 *
 * @returns An error if the approximation algorithm fails.
 */
declare function bsplineApprox(points: Vec3[], config?: BSplineApproximationConfig): Result<Edge>;

/**
 * Create a Bezier curve edge from control points.
 *
 * @param points - Two or more control points.
 */
declare function bezier(points: Vec3[]): Result<Edge>;

/**
 * Create a circular arc edge tangent to a direction at the start point.
 */
declare function tangentArc(startPoint: Vec3, startTgt: Vec3, endPoint: Vec3): Edge;

/**
 * Assemble edges and/or wires into a single connected wire.
 */
declare function wire(listOfEdges: (Edge | Wire)[]): Result<Wire>;

/**
 * Create a planar face from a closed wire, optionally with holes.
 */
declare function face(w: Wire, holes?: Wire[]): Result<Face>;

/**
 * Create a non-planar face from a wire using surface filling.
 */
declare function filledFace(w: Wire): Result<Face>;

/**
 * Create a face bounded by a wire on an existing face's surface.
 */
declare function subFace(originFace: Face, w: Wire): Face;

/**
 * Create a polygonal face from three or more coplanar points.
 */
declare function polygon(points: Vec3[]): Result<Face>;

/** Create a vertex at a 3D point. */
declare function vertex(point: Vec3): Vertex;

/**
 * Build a compound from multiple shapes.
 */
declare function compound(shapeArray: AnyShape[]): Compound;

/**
 * Weld faces and shells into a single solid.
 */
declare function solid(facesOrShells: Array<Face | Shell>): Result<Solid>;

/**
 * Create an offset shape from a face.
 */
declare function offsetFace(f: Face, distance: number, tolerance?: number): Result<Shape3D>;

/**
 * Weld faces and shells into a single shell.
 */
declare function sewShells(facesOrShells: Array<Face | Shell>, ignoreType?: boolean): Result<Shell>;

/**
 * Add hole wires to an existing face.
 */
declare function addHoles(f: Face, holes: Wire[]): Face;

/** Options for {@link rotate}. */
interface RotateOptions {
    /** Pivot point. Default: [0, 0, 0]. */
    around?: Vec3;
    /** Rotation axis. Default: [0, 0, 1] (Z). */
    axis?: Vec3;
}

/** Options for {@link mirror}. */
interface MirrorOptions {
    /** Plane normal. Default: [1, 0, 0]. */
    normal?: Vec3;
    /** Plane origin. Default: [0, 0, 0]. */
    origin?: Vec3;
}

/** Options for {@link scale}. */
interface ScaleOptions {
    /** Center of scaling. Default: [0, 0, 0]. */
    center?: Vec3;
}

/** Section (cross-section) a shape with a plane. */
declare function section(shape: Shapeable<AnyShape>, plane: PlaneInput, options?: {
    approximation?: boolean;
    planeSize?: number;
}): Result<AnyShape>;

/** Split a shape with tool shapes. */
declare function split(shape: Shapeable<AnyShape>, tools: AnyShape[]): Result<AnyShape>;

/** Slice a shape with multiple planes. */
declare function slice(shape: Shapeable<AnyShape>, planes: PlaneInput[], options?: {
    approximation?: boolean;
    planeSize?: number;
}): Result<AnyShape[]>;

/** Thicken a surface (face or shell) into a solid. */
declare function thicken(shape: Shapeable<Face | Shell>, thickness: number): Result<Solid>;

/** Mesh a shape for rendering. */
declare function mesh(shape: Shapeable<AnyShape>, options?: MeshOptions & {
    skipNormals?: boolean;
    includeUVs?: boolean;
    cache?: boolean;
}): ShapeMesh;

/** Mesh the edges of a shape for wireframe rendering. */
declare function meshEdges(shape: Shapeable<AnyShape>, options?: MeshOptions & {
    cache?: boolean;
}): EdgeMesh;

/** Get a summary description of a shape. */
declare function describe(shape: Shapeable<AnyShape>): ShapeDescription;

/** Serialize a shape to BREP format. */
declare function toBREP(shape: Shapeable<AnyShape>): string;

/** Deserialize a shape from BREP format. */
declare function fromBREP(data: string): Result<AnyShape>;

/** Check if a shape is valid. */
declare function isValid(shape: Shapeable<AnyShape>): boolean;

/** Check if a shape is empty (null). */
declare function isEmpty(shape: Shapeable<AnyShape>): boolean;

/**
 * Extrude a face to produce a solid.
 *
 * @param face   - The face to extrude.
 * @param height - A number for Z-direction extrusion, or a Vec3 direction vector.
 */
declare function extrude(face: Shapeable<Face>, height: number | Vec3): Solid;

/** Options for {@link revolve}. */
interface RevolveOptions {
    /** Rotation axis. Default: [0, 0, 1] (Z). */
    axis?: Vec3;
    /** Pivot point. Default: [0, 0, 0]. */
    around?: Vec3;
    /** Rotation angle in degrees. Default: 360 (full revolution). */
    angle?: number;
}

/**
 * Revolve a face around an axis to create a solid of revolution.
 */
declare function revolve(face: Shapeable<Face>, options?: RevolveOptions): Result<Shape3D>;

/**
 * Loft through a set of wire profiles to create a 3D shape.
 */
declare function loft(wires: Shapeable<Wire>[], options?: LoftConfig): Result<Shape3D>;

/**
 * Error class thrown by the shape() wrapper when a Result<T> contains an Err.
 * Wraps the structured BrepError for catch-based handling.
 */
declare class BrepWrapperError extends Error {
    readonly code: string;
    readonly kind: string;
    readonly metadata?: Record<string, any>;
    constructor(brepError: {
        kind: string;
        code: string;
        message: string;
        metadata?: Record<string, unknown>;
    });
}

/**
 * Derive a {@link Plane} from a face's surface geometry.
 *
 * @param face - Object exposing `pointOnSurface` and `normalAt` (e.g. a Face shape).
 * @param originOnSurface - UV coordinates on the face surface used as the plane origin.
 * @default originOnSurface `[0, 0]`
 */
declare const makePlaneFromFace: (face: {
    pointOnSurface: (u: number, v: number) => Vec3;
    normalAt: (p?: Vec3) => Vec3;
}, originOnSurface?: [number, number]) => Plane;

/**
 * Rotate an OCCT shape around an axis.
 *
 * @param shape - Raw OCCT shape to rotate.
 * @param angle - Rotation angle in **degrees**.
 * @param position - Point on the rotation axis.
 * @param direction - Direction vector of the rotation axis.
 * @returns A new rotated OCCT shape (the original is not modified).
 */
declare function rotate(shape: any, angle: number, position?: PointInput, direction?: PointInput): any;

/**
 * Translate an OCCT shape by a displacement vector.
 *
 * @param shape - Raw OCCT shape to translate.
 * @param vector - Translation vector `[dx, dy, dz]`.
 * @returns A new translated OCCT shape.
 */
declare function translate(shape: any, vector: PointInput): any;

/**
 * Mirror an OCCT shape across a plane.
 *
 * The mirror plane can be specified as a `PlaneName`, a `Plane` object,
 * or a direction vector (used as the plane normal). Defaults to the YZ plane.
 *
 * @param shape - Raw OCCT shape to mirror.
 * @param inputPlane - Mirror plane specification.
 * @param origin - Override origin for the mirror plane.
 * @returns A new mirrored OCCT shape.
 */
declare function mirror(shape: any, inputPlane?: PlaneInput | PointInput, origin?: PointInput): any;

/**
 * Scale an OCCT shape uniformly around a center point.
 *
 * @param shape - Raw OCCT shape to scale.
 * @param center - Center of scaling.
 * @param scaleFactor - Uniform scale factor (> 0).
 * @returns A new scaled OCCT shape.
 */
declare function scale(shape: any, center: PointInput, scaleFactor: number): any;

/** Register a deletable value for GC when the scope function is collected. */
declare function gcWithScope(): <T extends Deletable>(value: T) => T;

/** Register a deletable value for GC when the given object is collected. */
declare function gcWithObject(obj: any): <T extends Deletable>(value: T) => T;

/** Create a local GC scope. Returns [register, cleanup, debugSet?]. */
declare function localGC(debug?: boolean): [<T extends Deletable>(v: T) => T, () => void, Set<Deletable> | undefined];

/** A disposable wrapper for any OCCT object. */
interface OcHandle<T extends Deletable> {
    readonly value: T;
    readonly disposed: boolean;
    [Symbol.dispose](): void;
}

/** Create a disposable handle for any OCCT object. */
declare function createOcHandle<T extends Deletable>(ocObj: T): OcHandle<T>;

/** Scope for tracking multiple disposable resources. */
declare class DisposalScope implements Disposable {
    private readonly handles;
    /** Register a resource for disposal when scope ends. */
    register<T extends Deletable>(resource: T): T;
    /** Register a disposable for disposal when scope ends. */
    track<T extends Disposable>(disposable: T): T;
    [Symbol.dispose](): void;
}

/**
 * Represent a closed or open 2D profile as an ordered list of curves.
 *
 * A Blueprint is the fundamental 2D drawing primitive: it stores an ordered
 * sequence of {@link Curve2D} segments that together describe a planar profile.
 * Blueprints can be transformed (translate, rotate, scale, mirror, stretch),
 * projected onto 3D planes or faces, combined with boolean operations, and
 * serialized to SVG.
 *
 * Create instances via {@link BlueprintSketcher} rather than calling the
 * constructor directly.
 *
 * @example
 * ```ts
 * const bp = new BlueprintSketcher()
 *   .movePointerTo([0, 0])
 *   .lineTo([10, 0])
 *   .lineTo([10, 10])
 *   .lineTo([0, 10])
 *   .close();
 *
 * // sketchOnPlane returns SketchData (wire + metadata), not a Face
 * const sketch = bp.sketchOnPlane("XY");
 * ```
 *
 * @see {@link CompoundBlueprint} for blueprints with holes.
 * @see {@link Blueprints} for collections of disjoint blueprints.
 * @see {@link createBlueprint} for the functional API equivalent.
 */
declare class Blueprint implements DrawingInterface {
    /** Ordered 2D curve segments that compose this blueprint. */
    curves: Curve2D[];
    protected _boundingBox: null | BoundingBox2d;
    private readonly _orientation;
    private _guessedOrientation;
    /** Create a blueprint from an ordered array of 2D curves.
     *
     * @throws Error if the curves array is empty.
     */
    constructor(curves: Curve2D[]);
    /** Release WASM resources held by the underlying curves and bounding box. */
    delete(): void;
    /** Return a deep copy of this blueprint. */
    clone(): Blueprint;
    /** Return a multi-line string representation for debugging. */
    get repr(): string;
    /** Compute (and cache) the axis-aligned bounding box of all curves. */
    get boundingBox(): BoundingBox2d;
    /** Determine the winding direction of the blueprint via the shoelace formula.
     *
     * @remarks Uses an approximation based on curve midpoints for non-linear
     * segments. The result is cached after the first call.
     */
    get orientation(): 'clockwise' | 'counterClockwise';
    /**
     * Stretch the blueprint along a direction by a given ratio.
     *
     * @param ratio - Stretch factor (1 = unchanged).
     * @param direction - Unit direction vector to stretch along.
     * @param origin - Fixed point of the stretch (defaults to the origin).
     * @returns A new stretched Blueprint.
     */
    stretch(ratio: number, direction: Point2D, origin?: Point2D): Blueprint;
    /**
     * Uniformly scale the blueprint around a center point.
     *
     * @param scaleFactor - Scale multiplier (>1 enlarges, <1 shrinks).
     * @param center - Center of scaling (defaults to the bounding box center).
     * @returns A new scaled Blueprint.
     */
    scale(scaleFactor: number, center?: Point2D): Blueprint;
    /**
     * Rotate the blueprint by an angle in degrees.
     *
     * @param angle - Rotation angle in degrees (positive = counter-clockwise).
     * @param center - Center of rotation (defaults to the origin).
     * @returns A new rotated Blueprint.
     */
    rotate(angle: number, center?: Point2D): Blueprint;
    /**
     * Translate the blueprint by separate x/y distances or a vector.
     *
     * @returns A new translated Blueprint.
     */
    translate(xDist: number, yDist: number): Blueprint;
    translate(translationVector: Point2D): Blueprint;
    /**
     * Mirror the blueprint across a point or plane.
     *
     * @param centerOrDirection - Mirror center (center mode) or plane normal (plane mode).
     * @param origin - Origin for plane-mode mirroring.
     * @param mode - `'center'` for point symmetry, `'plane'` for reflection across an axis.
     * @returns A new mirrored Blueprint.
     */
    mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): Blueprint;
    /**
     * Project this 2D blueprint onto a 3D plane, producing a wire and metadata.
     *
     * @param inputPlane - Named plane (`"XY"`, `"XZ"`, etc.) or a custom Plane.
     * @param origin - Origin offset; a number sets the offset along the plane normal.
     * @returns Sketch data containing the projected wire and default orientation.
     */
    sketchOnPlane(inputPlane?: PlaneName | Plane, origin?: PointInput | number): SketchData;
    /**
     * Map this 2D blueprint onto a 3D face's UV surface.
     *
     * @param face - Target face to project onto.
     * @param scaleMode - How UV coordinates are interpreted (`'original'`, `'bounds'`, or `'native'`).
     * @returns Sketch data containing the wire mapped onto the face.
     */
    sketchOnFace(face: Face, scaleMode?: ScaleMode): SketchData;
    /**
     * Create a face on a target face's surface defined by this blueprint's profile.
     *
     * @param face - The face whose surface the sub-face lies on.
     * @param origin - Optional UV origin offset (defaults to the face center).
     * @returns A new Face bounded by the blueprint's profile.
     */
    subFace(face: Face, origin?: PointInput | null): Face;
    /**
     * Cut a prism-shaped hole through a solid along a face using this blueprint.
     *
     * @param shape - The solid to punch through.
     * @param face - The face on which the hole profile is placed.
     * @param options - Optional hole parameters.
     * @param options.height - Hole depth; `null` (default) cuts through the entire solid.
     * @param options.origin - UV origin on the face for the blueprint placement.
     * @param options.draftAngle - Taper angle in degrees (0 = straight hole).
     * @returns The modified shape with the hole removed.
     */
    punchHole(shape: AnyShape, face: SingleFace, { height, origin, draftAngle, }?: {
        height?: number | null;
        origin?: PointInput | null;
        draftAngle?: number;
    }): AnyShape;
    /** Convert the blueprint to an SVG path `d` attribute string. */
    toSVGPathD(): string;
    /** Wrap the SVG path data in a `<path>` element string. */
    toSVGPath(): string;
    /**
     * Compute the SVG `viewBox` attribute for this blueprint.
     *
     * @param margin - Extra padding around the bounding box in drawing units.
     */
    toSVGViewBox(margin?: number): string;
    /** Return the SVG path `d` strings for this blueprint as an array. */
    toSVGPaths(): string[];
    /**
     * Render a complete SVG document string for this blueprint.
     *
     * @param margin - Extra padding around the bounding box in drawing units.
     */
    toSVG(margin?: number): string;
    /** Get the start point of the first curve. */
    get firstPoint(): Point2D;
    /** Get the end point of the last curve. */
    get lastPoint(): Point2D;
    /**
     * Test whether a 2D point lies inside this closed blueprint.
     *
     * Uses ray-casting (intersection counting) against a segment from the point
     * to a location guaranteed to be outside the bounding box.
     *
     * @remarks Returns `false` for points on the boundary.
     * @returns `true` if the point is strictly inside the blueprint.
     */
    isInside(point: Point2D): boolean;
    /** Check whether the first and last points coincide (the profile is closed). */
    isClosed(): boolean;
    /**
     * Test whether this blueprint's curves intersect with another blueprint's curves.
     *
     * @remarks Uses bounding-box pre-filtering for early rejection.
     */
    intersects(other: Blueprint): boolean;
}

/**
 * Represent a 2D profile with holes (an outer boundary minus inner cutouts).
 *
 * The first element of {@link blueprints} is the outer boundary; all subsequent
 * elements are holes subtracted from it. `CompoundBlueprint` implements the
 * same {@link DrawingInterface} as {@link Blueprint}, so it can be transformed,
 * sketched, and serialized to SVG in the same way.
 *
 * @see {@link Blueprint} for simple profiles without holes.
 * @see {@link Blueprints} for collections of disjoint profiles.
 */
declare class CompoundBlueprint implements DrawingInterface {
    /**
     * Ordered array where `blueprints[0]` is the outer boundary and the
     * remaining entries are inner holes.
     */
    blueprints: Blueprint[];
    protected _boundingBox: BoundingBox2d | null;
    /**
     * Create a compound blueprint from an outer boundary and optional holes.
     *
     * @param blueprints - First element is the outer boundary; subsequent
     *   elements are holes.
     * @throws Error if the array is empty.
     */
    constructor(blueprints: Blueprint[]);
    /** Return a deep copy of this compound blueprint and all its children. */
    clone(): CompoundBlueprint;
    /** Compute (and cache) the combined bounding box of all child blueprints. */
    get boundingBox(): BoundingBox2d;
    /** Return a multi-line debug representation showing outline and holes. */
    get repr(): string;
    /** Stretch all child blueprints along a direction by a given ratio. */
    stretch(ratio: number, direction: Point2D, origin: Point2D): CompoundBlueprint;
    /** Rotate all child blueprints by an angle in degrees. */
    rotate(angle: number, center?: Point2D): CompoundBlueprint;
    /** Uniformly scale all child blueprints around a center point. */
    scale(scaleFactor: number, center?: Point2D): CompoundBlueprint;
    /** Translate all child blueprints by separate x/y distances or a vector. */
    translate(xDist: number, yDist: number): CompoundBlueprint;
    translate(translationVector: Point2D): CompoundBlueprint;
    /** Mirror all child blueprints across a point or plane. */
    mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): CompoundBlueprint;
    /** Project all child blueprints onto a 3D plane.
     *
     * @returns One {@link SketchData} per child blueprint (outer boundary + holes).
     */
    sketchOnPlane(plane?: PlaneName | Plane, origin?: PointInput | number): SketchData[];
    /** Map all child blueprints onto a 3D face's UV surface.
     *
     * @returns One {@link SketchData} per child blueprint.
     */
    sketchOnFace(face: Face, scaleMode?: ScaleMode): SketchData[];
    /**
     * Punch a hole through a solid using the outer boundary of this compound.
     *
     * @remarks Only the outer boundary (`blueprints[0]`) is used for the hole.
     */
    punchHole(shape: AnyShape, face: SingleFace, options?: {
        height?: number;
        origin?: PointInput;
        draftAngle?: number;
    }): AnyShape;
    /** Compute the SVG `viewBox` attribute for this compound blueprint. */
    toSVGViewBox(margin?: number): string;
    /** Return SVG path `d` strings for every child blueprint. */
    toSVGPaths(): string[];
    /** Wrap all child SVG paths in a `<g>` group element string. */
    toSVGGroup(): string;
    /** Render a complete SVG document string for this compound blueprint. */
    toSVG(margin?: number): string;
}

/**
 * Hold a collection of disjoint 2D profiles (simple or compound).
 *
 * Unlike {@link CompoundBlueprint}, the child blueprints here are independent
 * shapes -- none is treated as a hole in another. `Blueprints` is the typical
 * result of boolean operations that produce multiple disconnected regions.
 *
 * @see {@link Blueprint} for a single contiguous profile.
 * @see {@link CompoundBlueprint} for a profile with holes.
 */
declare class Blueprints implements DrawingInterface {
    /** The independent profiles in this collection. */
    blueprints: Array<Blueprint | CompoundBlueprint>;
    protected _boundingBox: BoundingBox2d | null;
    /** Create a collection from an array of blueprints and/or compound blueprints. */
    constructor(blueprints: Array<Blueprint | CompoundBlueprint>);
    /** Return a multi-line debug representation of every child blueprint. */
    get repr(): string;
    /** Return a deep copy of this collection and all its children. */
    clone(): Blueprints;
    /** Compute (and cache) the combined bounding box of all child blueprints. */
    get boundingBox(): BoundingBox2d;
    /** Stretch all child blueprints along a direction by a given ratio. */
    stretch(ratio: number, direction: Point2D, origin: Point2D): Blueprints;
    /** Rotate all child blueprints by an angle in degrees. */
    rotate(angle: number, center?: Point2D): Blueprints;
    /** Uniformly scale all child blueprints around a center point. */
    scale(scaleFactor: number, center?: Point2D): Blueprints;
    /** Translate all child blueprints by separate x/y distances or a vector. */
    translate(xDist: number, yDist: number): Blueprints;
    translate(translationVector: Point2D): Blueprints;
    /** Mirror all child blueprints across a point or plane. */
    mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): Blueprints;
    /** Project all child blueprints onto a 3D plane. */
    sketchOnPlane(plane?: PlaneName | Plane, origin?: PointInput | number): (SketchData | SketchData[])[];
    /** Map all child blueprints onto a 3D face's UV surface. */
    sketchOnFace(face: Face, scaleMode?: ScaleMode): (SketchData | SketchData[])[];
    /**
     * Punch holes through a solid for each child blueprint in sequence.
     *
     * @returns The shape with all holes applied.
     */
    punchHole(shape: AnyShape, face: SingleFace, options?: {
        height?: number;
        origin?: PointInput;
        draftAngle?: number;
    }): AnyShape;
    /** Compute the SVG `viewBox` attribute for this collection. */
    toSVGViewBox(margin?: number): string;
    /** Return nested SVG path `d` string arrays -- one sub-array per child. */
    toSVGPaths(): string[][];
    /** Render a complete SVG document string for all child blueprints. */
    toSVG(margin?: number): string;
}

/**
 * Build 2D wire profiles on a 3D plane using a builder-pen API.
 *
 * The Sketcher converts relative/absolute 2D drawing commands into 3D edges
 * projected onto the chosen plane, then assembles them into a {@link Sketch}.
 *
 * @example
 * ```ts
 * const sketch = new Sketcher("XZ", 5)
 *   .hLine(20)
 *   .vLine(10)
 *   .hLine(-20)
 *   .close();
 * const solid = sketch.extrude(8);
 * ```
 *
 * @see {@link FaceSketcher} for sketching on non-planar surfaces.
 * @see {@link DrawingPen} for the pure-2D equivalent.
 * @category Sketching
 */
declare class Sketcher implements GenericSketcher<Sketch> {
    protected plane: Plane;
    protected pointer: Vec3;
    protected firstPoint: Vec3;
    protected pendingEdges: Edge[];
    protected _mirrorWire: boolean;
    /**
     * The sketcher can be defined by a plane, or a simple plane definition,
     * with either a point of origin, or the position on the normal axis from
     * the coordinates origin
     */
    constructor(plane: Plane);
    constructor(plane?: PlaneName, origin?: PointInput | number);
    /** Release all OCCT edges held by this sketcher. */
    delete(): void;
    protected _updatePointer(newPointer: Vec3): void;
    /** Move the pen to an absolute 2D position before drawing any edges. */
    movePointerTo([x, y]: Point2D): this;
    /** Draw a straight line to an absolute 2D point on the sketch plane. */
    lineTo([x, y]: Point2D): this;
    /** Draw a straight line by relative horizontal and vertical distances. */
    line(xDist: number, yDist: number): this;
    /** Draw a vertical line of the given signed distance. */
    vLine(distance: number): this;
    /** Draw a horizontal line of the given signed distance. */
    hLine(distance: number): this;
    /** Draw a vertical line to an absolute Y coordinate. */
    vLineTo(yPos: number): this;
    /** Draw a horizontal line to an absolute X coordinate. */
    hLineTo(xPos: number): this;
    /** Draw a line in polar coordinates (distance and angle in degrees) from the current point. */
    polarLine(distance: number, angle: number): this;
    /** Draw a line to a point given in polar coordinates [r, theta] from the origin. */
    polarLineTo([r, theta]: [number, number]): this;
    /** Draw a line tangent to the previous edge, extending by the given distance. */
    tangentLine(distance: number): this;
    /** Draw a circular arc passing through an inner point to an absolute end point. */
    threePointsArcTo(end: Point2D, innerPoint: Point2D): this;
    /** Draw a circular arc through a via-point to an end point, both given as relative distances. */
    threePointsArc(xDist: number, yDist: number, viaXDist: number, viaYDist: number): this;
    /** Draw a circular arc tangent to the previous edge, ending at an absolute point. */
    tangentArcTo(end: Point2D): this;
    /** Draw a circular arc tangent to the previous edge, ending at a relative offset. */
    tangentArc(xDist: number, yDist: number): this;
    /** Draw a circular arc to an absolute end point, bulging by the given sagitta. */
    sagittaArcTo(end: Point2D, sagitta: number): this;
    /** Draw a circular arc to a relative end point, bulging by the given sagitta. */
    sagittaArc(xDist: number, yDist: number, sagitta: number): this;
    /** Draw a vertical sagitta arc of the given distance and bulge. */
    vSagittaArc(distance: number, sagitta: number): this;
    /** Draw a horizontal sagitta arc of the given distance and bulge. */
    hSagittaArc(distance: number, sagitta: number): this;
    /** Draw an arc to an absolute end point using a bulge factor (sagitta as fraction of half-chord). */
    bulgeArcTo(end: Point2D, bulge: number): this;
    /** Draw an arc to a relative end point using a bulge factor. */
    bulgeArc(xDist: number, yDist: number, bulge: number): this;
    /** Draw a vertical bulge arc of the given distance and bulge factor. */
    vBulgeArc(distance: number, bulge: number): this;
    /** Draw a horizontal bulge arc of the given distance and bulge factor. */
    hBulgeArc(distance: number, bulge: number): this;
    /** Draw an elliptical arc to an absolute end point (SVG-style parameters). */
    ellipseTo(end: Point2D, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;
    /** Draw an elliptical arc to a relative end point (SVG-style parameters). */
    ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;
    /** Draw a half-ellipse arc to an absolute end point with a given minor radius. */
    halfEllipseTo(end: Point2D, verticalRadius: number, sweep?: boolean): this;
    /** Draw a half-ellipse arc to a relative end point with a given minor radius. */
    halfEllipse(xDist: number, yDist: number, verticalRadius: number, sweep?: boolean): this;
    /** Draw a Bezier curve to an absolute end point through one or more control points. */
    bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;
    /** Draw a quadratic Bezier curve to an absolute end point with a single control point. */
    quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;
    /** Draw a cubic Bezier curve to an absolute end point with start and end control points. */
    cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;
    /** Draw a smooth cubic Bezier spline to an absolute end point, blending tangent with the previous edge. */
    smoothSplineTo(end: Point2D, config?: SplineConfig): this;
    /** Draw a smooth cubic Bezier spline to a relative end point, blending tangent with the previous edge. */
    smoothSpline(xDist: number, yDist: number, splineConfig?: SplineConfig): this;
    protected _mirrorWireOnStartEnd(wire: Wire): Wire;
    protected buildWire(): Wire;
    protected _closeSketch(): void;
    /** Finish drawing and return the open-wire Sketch (does not close the path). */
    done(): Sketch;
    /** Close the path with a straight line to the start point and return the Sketch. */
    close(): Sketch;
    /** Close the path by mirroring all edges about the line from first to last point. */
    closeWithMirror(): Sketch;
}

/**
 * The FaceSketcher allows you to sketch on a face that is not planar, for
 * instance the sides of a cylinder.
 *
 * The coordinates passed to the methods corresponds to normalised distances on
 * this surface, between 0 and 1 in both direction.
 *
 * Note that if you are drawing on a closed surface (typically a revolution
 * surface or a cylinder), the first parameters represents the angle and can be
 * smaller than 0 or bigger than 1.
 *
 * @category Sketching
 */
declare class FaceSketcher extends BaseSketcher2d implements GenericSketcher<Sketch> {
    protected face: Face;
    protected _bounds: UVBounds;
    constructor(face: Face, origin?: Point2D);
    protected _convertToUV([x, y]: Point2D): Point2D;
    protected _convertFromUV([u, v]: Point2D): Point2D;
    _adaptSurface(): any;
    /**
     * @ignore
     */
    protected buildWire(): Wire;
    /** Finish drawing and return the resulting {@link Sketch} (does not close the path). */
    done(): Sketch;
    /** Close the path with a straight line to the start point and return the Sketch. */
    close(): Sketch;
    /** Close the path by mirroring all curves about the line from first to last point. */
    closeWithMirror(): Sketch;
    /**
     * Close the path and apply a custom corner treatment between the last and first segments.
     *
     * @param radius - Fillet/chamfer radius, or a custom corner function.
     * @param mode - Corner treatment type.
     * @returns The closed {@link Sketch}.
     */
    closeWithCustomCorner(radius: number | ((f: Curve2D, s: Curve2D) => Curve2D[]), mode?: 'fillet' | 'chamfer' | 'dogbone'): Sketch;
}

/**
 * Draw 2D curves and produce a {@link Blueprint} (pure-2D shape, no OCCT wire).
 *
 * Use this when you need a reusable 2D profile that can later be sketched onto
 * different planes or faces.
 *
 * @see {@link DrawingPen} for the higher-level Drawing wrapper.
 * @category Sketching
 */
declare class BlueprintSketcher extends BaseSketcher2d implements GenericSketcher<Blueprint> {
    constructor(origin?: Point2D);
    /** Finish drawing and return the resulting {@link Blueprint} (does not close the path). */
    done(): Blueprint;
    /** Close the path with a straight line to the start point and return the Blueprint. */
    close(): Blueprint;
    /** Close the path by mirroring all curves about the line from first to last point. */
    closeWithMirror(): Blueprint;
    /**
     * Close the path and apply a custom corner treatment between the last and first segments.
     *
     * @param radius - Fillet/chamfer radius.
     * @param mode - Corner treatment type.
     * @returns The closed {@link Blueprint}.
     */
    closeWithCustomCorner(radius: number, mode?: 'fillet' | 'chamfer' | 'dogbone'): Blueprint;
}

/**
 * DrawingPen is a helper class to draw in 2D. It is used to create drawings
 * by exposing a builder interface. It is not a drawing itself, but it can be
 * used to create a drawing.
 *
 * @category Drawing
 */
declare class DrawingPen extends BaseSketcher2d implements GenericSketcher<Drawing> {
    constructor(origin?: Point2D);
    /** Finish drawing and return the resulting {@link Drawing} (does not close the path). */
    done(): Drawing;
    /** Close the path with a straight line to the start point and return the Drawing. */
    close(): Drawing;
    /** Close the path by mirroring all curves about the line from first to last point. */
    closeWithMirror(): Drawing;
    /**
     * Close the path and apply a custom corner treatment between the last and first segments.
     *
     * @param radius - Fillet/chamfer radius.
     * @param mode - Corner treatment type.
     * @returns The closed {@link Drawing}.
     */
    closeWithCustomCorner(radius: number, mode?: 'fillet' | 'chamfer'): Drawing;
}

/**
 * Represent a closed or open wire profile with a default extrusion origin and direction.
 *
 * A Sketch wraps a single {@link Wire} and carries metadata (origin, direction,
 * optional base face) so that downstream operations like {@link Sketch.extrude},
 * {@link Sketch.revolve}, {@link Sketch.sweepSketch}, and {@link Sketch.loftWith}
 * know how to act on it without extra arguments.
 *
 * @remarks Most operations consume (delete) the sketch after producing a solid.
 *
 * @see {@link Sketcher} to build a Sketch interactively.
 * @see {@link CompoundSketch} for multi-wire (outer + holes) profiles.
 * @category Sketching
 */
declare class Sketch implements SketchInterface {
    wire: Wire;
    /**
     * @ignore
     */
    _defaultOrigin: Vec3;
    /**
     * @ignore
     */
    _defaultDirection: Vec3;
    protected _baseFace: Face | null | undefined;
    constructor(wire: Wire, { defaultOrigin, defaultDirection, }?: {
        defaultOrigin?: PointInput;
        defaultDirection?: PointInput;
    });
    get baseFace(): Face | null | undefined;
    set baseFace(newFace: Face | null | undefined);
    /** Release all OCCT resources held by this sketch. */
    delete(): void;
    /** Create an independent deep copy of this sketch. */
    clone(): Sketch;
    /** Get the 3D origin used as default for extrusion and revolution. */
    get defaultOrigin(): Vec3;
    /** Set the 3D origin used as default for extrusion and revolution. */
    set defaultOrigin(newOrigin: PointInput);
    /** Get the default extrusion/normal direction. */
    get defaultDirection(): Vec3;
    /** Set the default extrusion/normal direction. */
    set defaultDirection(newDirection: PointInput);
    /**
     * Transforms the lines into a face. The lines should be closed.
     */
    face(): Face;
    /** Return a clone of the underlying wire. */
    wires(): Wire;
    /** Alias for {@link Sketch.face}. */
    faces(): Face;
    /**
     * Revolves the drawing on an axis (defined by its direction and an origin
     * (defaults to the sketch origin)
     */
    revolve(revolutionAxis?: PointInput, { origin }?: {
        origin?: PointInput;
    }): Shape3D;
    /** Extrudes the sketch to a certain distance (along the default direction
     * and origin of the sketch).
     *
     * You can define another extrusion direction or origin,
     *
     * It is also possible to twist extrude with an angle (in degrees), or to
     * give a profile to the extrusion (the endFactor will scale the face, and
     * the profile will define how the scale is applied (either linearly or with
     * a s-shape).
     */
    extrude(extrusionDistance: number, { extrusionDirection, extrusionProfile, twistAngle, origin, }?: {
        extrusionDirection?: PointInput;
        extrusionProfile?: ExtrusionProfile;
        twistAngle?: number;
        origin?: PointInput;
    }): Shape3D;
    /**
     * Sweep along this sketch another sketch defined in the function
     * `sketchOnPlane`.
     */
    sweepSketch(sketchOnPlane: (plane: Plane, origin: Vec3) => this, sweepConfig?: GenericSweepConfig): Shape3D;
    /** Loft between this sketch and another sketch (or an array of them)
     *
     * You can also define a `startPoint` for the loft (that will be placed
     * before this sketch) and an `endPoint` after the last one.
     *
     * You can also define if you want the loft to result in a ruled surface.
     *
     * Note that all sketches will be deleted by this operation
     */
    loftWith(otherSketches: this | this[], loftConfig?: LoftConfig, returnShell?: boolean): Shape3D;
}

/**
 * Represent a face with holes as a group of sketches (one outer + zero or more inner).
 *
 * All contained sketches must share the same base surface. The first sketch is
 * treated as the outer boundary; subsequent sketches define holes.
 *
 * Typically produced from a {@link CompoundBlueprint} via `sketchOnPlane`.
 *
 * @see {@link Sketch} for single-wire profiles without holes.
 * @category Sketching
 */
declare class CompoundSketch implements SketchInterface {
    sketches: Sketch[];
    constructor(sketches: Sketch[]);
    /** Release all OCCT resources held by every sub-sketch. */
    delete(): void;
    /** Get the outer boundary sketch (the first in the array). */
    get outerSketch(): Sketch;
    /** Get the hole sketches (all but the first). */
    get innerSketches(): Sketch[];
    /** Return all wires (outer + holes) combined into a compound shape. */
    get wires(): import('../index.js').Compound;
    /** Build a face from the outer boundary with inner wires subtracted as holes. */
    face(): Face;
    /**
     * Extrude the compound face (with holes) along the default or given direction.
     *
     * Supports twist and profile extrusions. For twist/profile modes each
     * sub-sketch is extruded as a shell, then capped into a solid.
     */
    extrude(extrusionDistance: number, { extrusionDirection, extrusionProfile, twistAngle, origin, }?: {
        extrusionDirection?: PointInput;
        extrusionProfile?: ExtrusionProfile;
        twistAngle?: number;
        origin?: PointInput;
    }): Shape3D;
    /**
     * Revolves the drawing on an axis (defined by its direction and an origin
     * (defaults to the sketch origin)
     */
    revolve(revolutionAxis?: PointInput, { origin }?: {
        origin?: PointInput;
    }): Shape3D;
    /** Loft between this compound sketch and another with matching sub-sketch counts. */
    loftWith(otherCompound: this, loftConfig: LoftConfig): Shape3D;
}

/** Clone a shape (deep copy via TopoDS downcast). */
declare function clone<T extends AnyShape>(shape: T): T;

/** Simplify a shape by merging same-domain faces/edges. Returns a new shape. */
declare function simplify<T extends AnyShape>(shape: T): T;

/** Translate a shape by a vector. Returns a new shape. */
declare function translate<T extends AnyShape>(shape: T, v: Vec3): T;

/** Rotate a shape around an axis. Angle is in degrees. Returns a new shape. */
declare function rotate<T extends AnyShape>(shape: T, angle: number, position?: Vec3, direction?: Vec3): T;

/** Mirror a shape through a plane defined by origin and normal. Returns a new shape. */
declare function mirror<T extends AnyShape>(shape: T, planeNormal?: Vec3, planeOrigin?: Vec3): T;

/** Scale a shape uniformly. Returns a new shape. */
declare function scale<T extends AnyShape>(shape: T, factor: number, center?: Vec3): T;

/**
 * Fluent builder interface for chaining immutable shape transformations.
 *
 * Call `.done()` to extract the final shape from the pipe.
 */
interface ShapePipe<T extends AnyShape> {
    /** Get the current shape. */
    readonly done: () => T;
    /** Translate the shape by a vector. */
    readonly translate: (v: Vec3) => ShapePipe<T>;
    /** Rotate the shape by an angle (degrees) around an axis. */
    readonly rotate: (angle: number, position?: Vec3, direction?: Vec3) => ShapePipe<T>;
    /** Mirror the shape across a plane. */
    readonly mirror: (planeNormal?: Vec3, planeOrigin?: Vec3) => ShapePipe<T>;
    /** Scale the shape by a factor. */
    readonly scale: (factor: number, center?: Vec3) => ShapePipe<T>;
    /** Apply a custom transformation function. */
    readonly apply: <U extends AnyShape>(fn: (shape: T) => U) => ShapePipe<U>;
    /** Fuse with another shape (requires Shape3D). */
    readonly fuse: (tool: Shape3D, options?: BooleanOptions) => ShapePipe<Shape3D>;
    /** Cut with another shape (requires Shape3D). */
    readonly cut: (tool: Shape3D, options?: BooleanOptions) => ShapePipe<Shape3D>;
    /** Intersect with another shape (requires Shape3D). */
    readonly intersect: (tool: Shape3D) => ShapePipe<Shape3D>;
}

/**
 * Create a fluent pipe for chaining immutable shape operations.
 *
 * @example
 * ```ts
 * const result = pipe(box)
 *   .translate([10, 0, 0])
 *   .fuse(cylinder)
 *   .rotate(45)
 *   .done();
 * ```
 */
declare function pipe<T extends AnyShape>(shape: T): ShapePipe<T>;

/**
 * Attempt to heal any shape by dispatching to the appropriate fixer.
 *
 * Supports solids, faces, and wires. For other shape types, returns the
 * input unchanged.
 */
declare function heal<T extends AnyShape>(shape: T): Result<T>;

interface ShapeFinder<T extends AnyShape> {
    /** Add a custom predicate filter. Returns new finder. */
    readonly when: (predicate: Predicate<T>) => ShapeFinder<T>;
    /** Filter to elements in a list. Returns new finder. */
    readonly inList: (elements: T[]) => ShapeFinder<T>;
    /** Invert a filter. Returns new finder. */
    readonly not: (builderFn: (f: ShapeFinder<T>) => ShapeFinder<T>) => ShapeFinder<T>;
    /** Combine filters with OR. Returns new finder. */
    readonly either: (fns: ((f: ShapeFinder<T>) => ShapeFinder<T>)[]) => ShapeFinder<T>;
    /** Find all matching elements from a shape. */
    readonly findAll: (shape: AnyShape) => T[];
    /** Find exactly one matching element. Returns error if 0 or more than 1 match. */
    readonly findUnique: (shape: AnyShape) => Result<T>;
    /**
     * Find matching elements from a shape.
     * @deprecated Use {@link findAll} for array results or {@link findUnique} for single-element `Result<T>`.
     */
    readonly find: ((shape: AnyShape) => T[]) & ((shape: AnyShape, opts: {
        unique: true;
    }) => Result<T>);
    /** Check if an element passes all filters. */
    readonly shouldKeep: (element: T) => boolean;
    readonly _filters: ReadonlyArray<Predicate<T>>;
    readonly _topoKind: 'edge' | 'face' | 'wire' | 'vertex';
}

/** Callback that configures a shape finder for inline use in modifiers. */
type FinderFn<T extends AnyShape> = (finder: ShapeFinder<T>) => ShapeFinder<T>;

/**
 * Marker interface for the shape() wrapper.
 *
 * Full definition lives in wrapperFns.ts — this minimal interface is enough
 * for the `resolve()` utility and `Shapeable<T>` type to work without
 * creating circular imports.
 */
interface WrappedMarker<T extends AnyShape> {
    readonly val: T;
    /** Brand property to distinguish wrappers from branded shape handles. */
    readonly __wrapped: true;
}

/**
 * Accept either a raw branded shape or a shape() wrapper.
 *
 * All functional API functions use this as their shape parameter type,
 * enabling seamless interop between styles.
 */
type Shapeable<T extends AnyShape> = T | WrappedMarker<T>;

/** Extract the raw branded shape from a Shapeable value. */
declare function resolve<T extends AnyShape>(s: Shapeable<T>): T;

/** Translate a shape by a vector. Returns a new shape. */
declare function translate<T extends AnyShape>(shape: Shapeable<T>, v: Vec3): T;

/** Rotate a shape around an axis. Angle is in degrees. Returns a new shape. */
declare function rotate<T extends AnyShape>(shape: Shapeable<T>, angle: number, options?: RotateOptions): T;

/** Mirror a shape through a plane. Returns a new shape. */
declare function mirror<T extends AnyShape>(shape: Shapeable<T>, options?: MirrorOptions): T;

/** Scale a shape uniformly. Returns a new shape. */
declare function scale<T extends AnyShape>(shape: Shapeable<T>, factor: number, options?: ScaleOptions): T;

/** Clone a shape (deep copy). */
declare function clone<T extends AnyShape>(shape: Shapeable<T>): T;

/** Heal a shape using the appropriate fixer. */
declare function heal<T extends AnyShape>(shape: Shapeable<T>): Result<T>;

/** Simplify a shape by merging same-domain faces/edges. */
declare function simplify<T extends AnyShape>(shape: Shapeable<T>): T;

/** Create a typed shape wrapper from a Sketch-like object (converts to Face) or a Face. */
declare function shape(sketchOrFace: {
    face(): Face;
} | Face): WrappedFace;
/** Create a typed shape wrapper from a Solid. */
declare function shape(solid: Solid): Wrapped3D<Solid>;
/** Create a typed shape wrapper from a Shell. */
declare function shape(shell: Shell): Wrapped3D<Shell>;
/** Create a typed shape wrapper from an Edge. */
declare function shape(edge: Edge): WrappedCurve<Edge>;
/** Create a typed shape wrapper from a Wire. */
declare function shape(wire: Wire): WrappedCurve<Wire>;
/** Create a typed shape wrapper from any shape. */
declare function shape<T extends AnyShape>(s: T): Wrapped<T>;

/** Fuse two 3D shapes (boolean union). */
declare function fuse<T extends Shape3D>(a: Shapeable<T>, b: Shapeable<Shape3D>, options?: BooleanOptions): Result<T>;

/** Cut a tool from a base shape (boolean subtraction). */
declare function cut<T extends Shape3D>(base: Shapeable<T>, tool: Shapeable<Shape3D>, options?: BooleanOptions): Result<T>;

/** Compute the intersection of two shapes (boolean common). */
declare function intersect<T extends Shape3D>(a: Shapeable<T>, b: Shapeable<Shape3D>, options?: BooleanOptions): Result<T>;

/** Apply a fillet to all edges of a 3D shape. */
declare function fillet<T extends Shape3D>(shape: Shapeable<T>, radius: FilletRadius): Result<T>;
/** Apply a fillet to selected edges of a 3D shape. */
declare function fillet<T extends Shape3D>(shape: Shapeable<T>, edges: Edge[] | FinderFn<Edge>, radius: FilletRadius): Result<T>;

/** Apply a chamfer to all edges of a 3D shape. */
declare function chamfer<T extends Shape3D>(shape: Shapeable<T>, distance: ChamferDistance): Result<T>;
/** Apply a chamfer to selected edges of a 3D shape. */
declare function chamfer<T extends Shape3D>(shape: Shapeable<T>, edges: Edge[] | FinderFn<Edge>, distance: ChamferDistance): Result<T>;

/** Create a hollow shell by removing faces and offsetting remaining walls. */
declare function shell<T extends Shape3D>(shape: Shapeable<T>, faces: Face[] | FinderFn<Face>, thickness: number, options?: {
    tolerance?: number;
}): Result<T>;

/** Offset all faces of a shape by a given distance. */
declare function offset<T extends Shape3D>(shape: Shapeable<T>, distance: number, options?: {
    tolerance?: number;
}): Result<T>;

/**
 * Drill a hole through a 3D shape.
 *
 * Creates a cylinder at the specified position and cuts it from the shape.
 * If no depth is given, cuts all the way through (computed from bounding box).
 */
declare function drill<T extends Shape3D>(shape: Shapeable<T>, options: DrillOptions): Result<T>;

/**
 * Cut a pocket (2D profile extruded inward) into a shape.
 *
 * The profile (Drawing or Wire) is positioned on the target face and extruded
 * inward by the specified depth, then subtracted from the shape.
 */
declare function pocket<T extends Shape3D>(shape: Shapeable<T>, options: PocketOptions): Result<T>;

/**
 * Add a boss (2D profile extruded outward) onto a shape.
 *
 * The profile (Drawing or Wire) is positioned on the target face and extruded
 * outward by the specified height, then fused with the shape.
 */
declare function boss<T extends Shape3D>(shape: Shapeable<T>, options: BossOptions): Result<T>;

/**
 * Mirror a shape and fuse it with the original.
 *
 * Common pattern: model half a part, then mirror-join for symmetry.
 */
declare function mirrorJoin<T extends Shape3D>(shape: Shapeable<T>, options?: MirrorJoinOptions): Result<T>;

/**
 * Create a rectangular (2D grid) pattern of a shape.
 *
 * Replicates the shape along two directions with specified counts and spacings,
 * then fuses all copies into a single shape.
 */
declare function rectangularPattern<T extends Shape3D>(shape: Shapeable<T>, options: RectangularPatternOptions): Result<T>;

/** BufferGeometry data with per-face material groups. */
interface GroupedBufferGeometryData extends BufferGeometryData {
    /** Face groups for use with THREE.BufferGeometry.addGroup(). */
    readonly groups: ReadonlyArray<BufferGeometryGroup>;
}

/** Configuration for sweep operations in the OO API. */
interface GenericSweepConfig extends SweepConfig {
    /** Auxiliary spine for twist control (Wire or Edge in OO API) */
    auxiliarySpine?: Wire | Edge;
}

/** Volume properties with a domain-specific `volume` alias. */
interface VolumeProps extends PhysicalProps {
    readonly volume: number;
}

/** Surface properties with a domain-specific `area` alias. */
interface SurfaceProps extends PhysicalProps {
    readonly area: number;
}

/** Linear properties with a domain-specific `length` alias. */
interface LinearProps extends PhysicalProps {
    readonly length: number;
}

interface CornerFinderFn extends CornerFilter {
    /** Add a custom predicate filter. Returns new finder. */
    readonly when: (predicate: (corner: Corner) => boolean) => CornerFinderFn;
    /** Filter to corners whose point matches one from the list. */
    readonly inList: (points: Point2D[]) => CornerFinderFn;
    /** Filter to corners at a specific distance from a point. */
    readonly atDistance: (distance: number, point?: Point2D) => CornerFinderFn;
    /** Filter to corners at an exact point. */
    readonly atPoint: (point: Point2D) => CornerFinderFn;
    /** Filter to corners within an axis-aligned bounding box. */
    readonly inBox: (corner1: Point2D, corner2: Point2D) => CornerFinderFn;
    /** Filter to corners with a specific interior angle (in degrees). */
    readonly ofAngle: (angle: number) => CornerFinderFn;
    /** Invert a filter. Returns new finder. */
    readonly not: (fn: (f: CornerFinderFn) => CornerFinderFn) => CornerFinderFn;
    /** Combine filters with OR. Returns new finder. */
    readonly either: (fns: ((f: CornerFinderFn) => CornerFinderFn)[]) => CornerFinderFn;
    /** Find matching corners from a blueprint. */
    readonly find: (blueprint: BlueprintLike) => Corner[];
}

/** Request to initialize the worker (load the WASM/OpenCascade runtime). */
interface InitRequest extends WorkerRequest {
    readonly type: 'init';
    /** Optional URL to the WASM binary; when omitted the worker uses its default. */
    readonly wasmUrl?: string;
}

/**
 * Request to execute a named CAD operation inside the worker.
 *
 * @remarks Shapes are transferred as BREP-serialized strings, not as live
 * OpenCascade handles, because handles cannot cross the worker boundary.
 */
interface OperationRequest extends WorkerRequest {
    readonly type: 'operation';
    /** Name of the registered operation to invoke. */
    readonly operation: string;
    /** BREP-serialized input shapes. */
    readonly shapesBrep: ReadonlyArray<string>;
    /** Arbitrary key/value parameters forwarded to the operation handler. */
    readonly parameters: Readonly<Record<string, unknown>>;
}

/** Request to dispose the worker, releasing all resources. */
interface DisposeRequest extends WorkerRequest {
    readonly type: 'dispose';
}

/** Response indicating that the requested operation completed successfully. */
interface SuccessResponse extends WorkerResponse {
    readonly success: true;
    /** BREP-serialized result shape, when the operation produces geometry. */
    readonly resultBrep?: string;
    /** Arbitrary result data for non-geometric outputs (e.g., measurements). */
    readonly resultData?: unknown;
}

/** Response indicating that the requested operation failed. */
interface ErrorResponse extends WorkerResponse {
    readonly success: false;
    /** Human-readable error message describing the failure. */
    readonly error: string;
}

interface EdgeFinderFn extends ShapeFinder<Edge> {
    readonly inDirection: (dir?: 'X' | 'Y' | 'Z' | Vec3, angle?: number) => EdgeFinderFn;
    readonly ofLength: (length: number, tolerance?: number) => EdgeFinderFn;
    readonly ofCurveType: (curveType: CurveType) => EdgeFinderFn;
    readonly parallelTo: (dir?: 'X' | 'Y' | 'Z' | Vec3) => EdgeFinderFn;
    readonly atDistance: (distance: number, point?: Vec3) => EdgeFinderFn;
}

interface FaceFinderFn extends ShapeFinder<Face> {
    readonly inDirection: (dir?: 'X' | 'Y' | 'Z' | Vec3, angle?: number) => FaceFinderFn;
    readonly parallelTo: (dir?: 'X' | 'Y' | 'Z' | Vec3) => FaceFinderFn;
    readonly ofSurfaceType: (surfaceType: SurfaceType) => FaceFinderFn;
    readonly ofArea: (area: number, tolerance?: number) => FaceFinderFn;
    readonly atDistance: (distance: number, point?: Vec3) => FaceFinderFn;
}

interface WireFinderFn extends ShapeFinder<Wire> {
    readonly isClosed: () => WireFinderFn;
    readonly isOpen: () => WireFinderFn;
    readonly ofEdgeCount: (count: number) => WireFinderFn;
}

interface VertexFinderFn extends ShapeFinder<Vertex> {
    /** Filter vertices nearest to a reference point. Returns a new finder that keeps only the closest vertex. */
    readonly nearestTo: (point: Vec3) => VertexFinderFn;
    /** Filter vertices at an exact position (within tolerance). */
    readonly atPosition: (point: Vec3, tolerance?: number) => VertexFinderFn;
    /** Filter vertices within an axis-aligned bounding box. */
    readonly withinBox: (min: Vec3, max: Vec3) => VertexFinderFn;
    /** Filter vertices at a given distance from a point. */
    readonly atDistance: (distance: number, point?: Vec3, tolerance?: number) => VertexFinderFn;
}

/** Base wrapper — available on all shapes. */
interface Wrapped<T extends AnyShape> extends WrappedMarker<T> {
    readonly val: T;
    readonly __wrapped: true;
    translate(v: Vec3): Wrapped<T>;
    rotate(angle: number, options?: {
        around?: Vec3;
        axis?: Vec3;
    }): Wrapped<T>;
    mirror(options?: {
        normal?: Vec3;
        origin?: Vec3;
    }): Wrapped<T>;
    scale(factor: number, options?: {
        center?: Vec3;
    }): Wrapped<T>;
    moveX(distance: number): Wrapped<T>;
    moveY(distance: number): Wrapped<T>;
    moveZ(distance: number): Wrapped<T>;
    rotateX(angle: number): Wrapped<T>;
    rotateY(angle: number): Wrapped<T>;
    rotateZ(angle: number): Wrapped<T>;
    bounds(): Bounds3D;
    describe(): ShapeDescription;
    clone(): Wrapped<T>;
    apply<U extends AnyShape>(fn: (shape: T) => U): Wrapped<U>;
    applyResult<U extends AnyShape>(fn: (shape: T) => Result<U>): Wrapped<U>;
}

/** 3D wrapper — booleans, modifiers, measurement, queries. */
interface Wrapped3D<T extends Shape3D> extends Wrapped<T> {
    fuse(tool: Shapeable<Shape3D>, options?: BooleanOptions): Wrapped3D<T>;
    cut(tool: Shapeable<Shape3D>, options?: BooleanOptions): Wrapped3D<T>;
    intersect(tool: Shapeable<Shape3D>, options?: BooleanOptions): Wrapped3D<T>;
    fillet(radius: FilletRadius): Wrapped3D<T>;
    fillet(edges: Edge[] | FinderFn<Edge>, radius: FilletRadius): Wrapped3D<T>;
    chamfer(distance: ChamferDistance): Wrapped3D<T>;
    chamfer(edges: Edge[] | FinderFn<Edge>, distance: ChamferDistance): Wrapped3D<T>;
    shell(faces: Face[] | FinderFn<Face>, thickness: number, options?: {
        tolerance?: number;
    }): Wrapped3D<T>;
    offset(distance: number, options?: {
        tolerance?: number;
    }): Wrapped3D<T>;
    drill(options: DrillOptions): Wrapped3D<T>;
    pocket(options: PocketOptions): Wrapped3D<T>;
    boss(options: BossOptions): Wrapped3D<T>;
    mirrorJoin(options?: MirrorJoinOptions): Wrapped3D<T>;
    rectangularPattern(options: RectangularPatternOptions): Wrapped3D<T>;
    volume(): number;
    area(): number;
    edges(): Edge[];
    faces(): Face[];
    wires(): Wire[];
    vertices(): Vertex[];
    linearPattern(direction: Vec3, count: number, spacing: number): Wrapped3D<T>;
    circularPattern(axis: Vec3, count: number, angle?: number): Wrapped3D<T>;
}

/** Curve wrapper — edge/wire introspection. */
interface WrappedCurve<T extends Edge | Wire> extends Wrapped<T> {
    length(): number;
    startPoint(): Vec3;
    endPoint(): Vec3;
    pointAt(t?: number): Vec3;
    tangentAt(t?: number): Vec3;
    isClosed(): boolean;
    sweep(spine: Shapeable<Wire>, options?: SweepConfig): Wrapped3D<Shape3D>;
}

/** Face wrapper — face introspection + 2D→3D transitions. */
interface WrappedFace extends Wrapped<Face> {
    area(): number;
    normalAt(point?: Vec3): Vec3;
    center(): Vec3;
    surfaceType(): SurfaceType;
    outerWire(): Wire;
    innerWires(): Wire[];
    extrude(height: number | Vec3): Wrapped3D<Solid>;
    revolve(options?: {
        axis?: Vec3;
        around?: Vec3;
        angle?: number;
    }): Wrapped3D<Shape3D>;
}

// ── Aliases ──

type DirectionInput = Direction;
declare const getHistoryShape: typeof getShape;
type HistoryOperationRegistry = OperationRegistry;
type CleanLoftConfig = LoftConfig;
type CleanSweepConfig = SweepConfig;
