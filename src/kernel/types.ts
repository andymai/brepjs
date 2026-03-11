/**
 * KernelAdapter — abstraction over geometry kernel operations.
 *
 * All kernel-agnostic operations go through this interface. The adapter
 * provides factory methods, queries, and operations that insulate callers
 * from any specific kernel implementation (OCCT, Rust/WASM, etc.).
 *
 * The `oc` property is the only kernel-specific escape hatch and must only
 * be accessed by code in `kernel/` and `core/`.
 */

import type { Kernel2DCapability } from './kernel2dTypes.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Kernel WASM instance type
export type KernelInstance = any;

/**
 * Opaque shape handle — the kernel-level shape representation.
 * For OCCT: TopoDS_Shape. For Rust: your shape type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Opaque kernel shape handle
export type KernelShape = any;

/**
 * Opaque kernel type — covers non-shape kernel objects (geometry primitives,
 * curve handles, transform objects, etc.).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Opaque kernel type
export type KernelType = any;

/** Options shared by all boolean and compound operations. */
export interface BooleanOptions {
  /** Glue algorithm hint for faces shared between operands. */
  optimisation?: 'none' | 'commonFace' | 'sameFace';
  /** Merge same-domain faces/edges after the boolean. */
  simplify?: boolean;
  /** Algorithm selection: 'native' uses N-way BRepAlgoAPI_BuilderAlgo; 'pairwise' uses recursive divide-and-conquer. */
  strategy?: 'native' | 'pairwise';
  /** Abort signal to cancel long-running operations between steps. */
  signal?: AbortSignal;
  /**
   * Fuzzy tolerance for boolean operations. When set to a small positive value
   * (e.g., 1e-5), OCCT merges nearly-coincident vertices and edges early,
   * reducing intersection computation. Useful for 3D printing workflows where
   * sub-micron precision is not needed. Default: 0 (exact geometry).
   */
  fuzzyValue?: number | undefined;
}

export type ShapeType =
  | 'vertex'
  | 'edge'
  | 'wire'
  | 'face'
  | 'shell'
  | 'solid'
  | 'compsolid'
  | 'compound';

/** Surface type discriminant returned by surfaceType(). */
export type SurfaceType =
  | 'plane'
  | 'cylinder'
  | 'cone'
  | 'sphere'
  | 'torus'
  | 'bezier'
  | 'bspline'
  | 'revolution'
  | 'extrusion'
  | 'offset'
  | 'other';

/** Shape orientation. */
export type ShapeOrientation = 'forward' | 'reversed' | 'internal' | 'external';

export interface MeshOptions {
  /** Linear deflection tolerance for tessellation. */
  tolerance: number;
  /**
   * Angular deflection tolerance for tessellation.
   *
   * **Cross-kernel note**: brepkit only supports linear deflection; this
   * parameter is ignored (a one-time warning is emitted). OCCT honours both.
   */
  angularTolerance: number;
  skipNormals?: boolean;
  includeUVs?: boolean;
  /** Abort signal to cancel mesh generation between face iterations. */
  signal?: AbortSignal;
}

export interface KernelMeshResult {
  vertices: Float32Array;
  normals: Float32Array;
  triangles: Uint32Array;
  uvs: Float32Array;
  faceGroups: Array<{ start: number; count: number; faceHash: number }>;
}

export interface KernelEdgeMeshResult {
  lines: Float32Array;
  edgeGroups: Array<{ start: number; count: number; edgeHash: number }>;
}

export interface DistanceResult {
  value: number;
  point1: [number, number, number];
  point2: [number, number, number];
}

/**
 * Shape evolution record — tracks how input faces map to result faces
 * through a kernel operation (boolean, transform, fillet, etc.).
 *
 * For each input face hash, `modified` contains the result face hashes it evolved into.
 * `generated` contains hashes of newly created faces (e.g., fillet rounds).
 * `deleted` lists hashes of faces that were removed entirely.
 */
export interface ShapeEvolution {
  /** Map from input face hash → result face hashes it was modified into. */
  readonly modified: ReadonlyMap<number, readonly number[]>;
  /** Map from input face hash → newly generated face hashes (e.g., fillet surfaces). */
  readonly generated: ReadonlyMap<number, readonly number[]>;
  /** Set of input face hashes that were deleted by the operation. */
  readonly deleted: ReadonlySet<number>;
}

/** Result of an operation that tracks shape history. */
export interface OperationResult {
  readonly shape: KernelShape;
  readonly evolution: ShapeEvolution;
}

/** Options for STEP assembly export with named/colored parts. */
export interface StepAssemblyPart {
  shape: KernelShape;
  name: string;
  color?: [number, number, number, number]; // RGBA 0-255
}

// ---------------------------------------------------------------------------
// Kernel adapter — core interface
// ---------------------------------------------------------------------------

export interface KernelAdapter extends Kernel2DCapability {
  /**
   * The raw kernel WASM instance.
   *
   * @internal Only code in `kernel/` and `core/` may access this property.
   * Layer 2+ code must use typed adapter methods instead.
   */
  readonly oc: KernelInstance;

  /**
   * Unique string identifying this kernel implementation.
   * Used to prevent mixing shapes from different kernels.
   */
  readonly kernelId: string;

  // --- Boolean operations ---
  fuse(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape;
  cut(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape;
  intersect(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape;
  section(shape: KernelShape, plane: KernelShape, approximation?: boolean): KernelShape;
  fuseAll(shapes: KernelShape[], options?: BooleanOptions): KernelShape;
  cutAll(shape: KernelShape, tools: KernelShape[], options?: BooleanOptions): KernelShape;

  // --- Convex hull ---
  hull(shapes: KernelShape[], tolerance: number): KernelShape;
  hullFromPoints(
    points: Array<{ x: number; y: number; z: number }>,
    tolerance: number
  ): KernelShape;
  buildSolidFromFaces(
    points: Array<{ x: number; y: number; z: number }>,
    faces: Array<readonly [number, number, number]>,
    tolerance: number
  ): KernelShape;

  // --- Shape construction ---
  makeVertex(x: number, y: number, z: number): KernelShape;
  makeEdge(curve: KernelType, start?: number, end?: number): KernelShape;
  makeWire(edges: KernelShape[]): KernelShape;
  makeFace(wire: KernelShape, planar?: boolean): KernelShape;
  makeBox(width: number, height: number, depth: number): KernelShape;
  makeCylinder(
    radius: number,
    height: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape;
  makeSphere(radius: number, center?: [number, number, number]): KernelShape;
  makeCone(
    radius1: number,
    radius2: number,
    height: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape;
  makeTorus(
    majorRadius: number,
    minorRadius: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape;

  /** Build an ellipsoid solid with the given axis half-lengths. */
  makeEllipsoid(aLength: number, bLength: number, cLength: number): KernelShape;

  // --- Extended construction (kernel-agnostic curve/edge builders) ---
  makeLineEdge(p1: [number, number, number], p2: [number, number, number]): KernelShape;
  makeCircleEdge(
    center: [number, number, number],
    normal: [number, number, number],
    radius: number
  ): KernelShape;
  makeCircleArc(
    center: [number, number, number],
    normal: [number, number, number],
    radius: number,
    startAngle: number,
    endAngle: number
  ): KernelShape;
  makeArcEdge(
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number]
  ): KernelShape;
  makeEllipseEdge(
    center: [number, number, number],
    normal: [number, number, number],
    majorRadius: number,
    minorRadius: number,
    xDir?: [number, number, number]
  ): KernelShape;
  makeEllipseArc(
    center: [number, number, number],
    normal: [number, number, number],
    majorRadius: number,
    minorRadius: number,
    startAngle: number,
    endAngle: number,
    xDir?: [number, number, number]
  ): KernelShape;
  makeBezierEdge(points: [number, number, number][]): KernelShape;
  makeTangentArc(
    startPoint: [number, number, number],
    startTangent: [number, number, number],
    endPoint: [number, number, number]
  ): KernelShape;
  makeHelixWire(
    pitch: number,
    height: number,
    radius: number,
    center?: [number, number, number],
    direction?: [number, number, number],
    leftHanded?: boolean
  ): KernelShape;
  /** Build a wire from a mix of edges and wires (uses Add_1 for edges, Add_2 for wires). */
  makeWireFromMixed(items: KernelShape[]): KernelShape;
  makeCompound(shapes: KernelShape[]): KernelShape;
  makeBoxFromCorners(p1: [number, number, number], p2: [number, number, number]): KernelShape;
  makeRectangle(width: number, height: number): KernelShape;
  solidFromShell(shell: KernelShape): KernelShape;

  // --- Extrusion / sweep / loft / revolution ---
  extrude(face: KernelShape, direction: [number, number, number], length: number): KernelShape;
  revolve(shape: KernelShape, axis: KernelType, angle: number): KernelShape;
  loft(
    wires: KernelShape[],
    ruled?: boolean,
    startShape?: KernelShape,
    endShape?: KernelShape
  ): KernelShape;
  sweep(wire: KernelShape, spine: KernelShape, options?: { transitionMode?: number }): KernelShape;
  simplePipe(profile: KernelShape, spine: KernelShape): KernelShape;

  // --- Modification ---
  fillet(
    shape: KernelShape,
    edges: KernelShape[],
    radius: number | [number, number] | ((edge: KernelShape) => number | [number, number])
  ): KernelShape;
  chamfer(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number | [number, number] | ((edge: KernelShape) => number | [number, number])
  ): KernelShape;
  chamferDistAngle(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number,
    angleDeg: number
  ): KernelShape;
  shell(
    shape: KernelShape,
    faces: KernelShape[],
    thickness: number,
    tolerance?: number
  ): KernelShape;
  thicken(shape: KernelShape, thickness: number): KernelShape;
  offset(shape: KernelShape, distance: number, tolerance?: number): KernelShape;

  // --- Advanced modification ---
  /** Variable-radius fillet. Each entry specifies edges and radii per edge. */
  filletVariable(shape: KernelShape, spec: string): KernelShape;
  /** Helical sweep of a profile around an axis. */
  helicalSweep(
    profile: KernelShape,
    axisOrigin: [number, number, number],
    axisDirection: [number, number, number],
    radius: number,
    pitch: number,
    turns: number
  ): KernelShape;
  /** Sweep with options (contact mode, scale law, segments). */
  sweepWithOptions(
    profile: KernelShape,
    pathEdge: KernelShape,
    contactMode: string,
    scaleValues: number[],
    segments: number
  ): KernelShape;
  /** Draft (taper) faces of a solid along a pull direction with a neutral plane. */
  draft(
    shape: KernelShape,
    faces: KernelShape[],
    pullDirection: [number, number, number],
    neutralPlane: [number, number, number],
    angleDeg: number
  ): KernelShape;
  /** Remove faces from a solid (defeaturing). */
  defeature(shape: KernelShape, faces: KernelShape[]): KernelShape;

  // --- Transforms ---
  transform(shape: KernelShape, trsf: KernelType): KernelShape;
  translate(shape: KernelShape, x: number, y: number, z: number): KernelShape;
  rotate(
    shape: KernelShape,
    angle: number,
    axis?: [number, number, number],
    center?: [number, number, number]
  ): KernelShape;
  mirror(
    shape: KernelShape,
    origin: [number, number, number],
    normal: [number, number, number]
  ): KernelShape;
  scale(shape: KernelShape, center: [number, number, number], factor: number): KernelShape;
  generalTransform(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number],
    isOrthogonal: boolean
  ): KernelShape;

  /** Apply a non-orthogonal general transform (gp_GTrsf path for shear / non-uniform scale). */
  generalTransformNonOrthogonal(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number]
  ): KernelShape;

  // --- Operations with shape evolution tracking ---
  // These variants return an OperationResult with a ShapeEvolution record
  // that maps input face hashes to output face hashes. Used by propagateOrigins
  // and other shape history tracking systems.
  translateWithHistory(
    shape: KernelShape,
    x: number,
    y: number,
    z: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult;
  rotateWithHistory(
    shape: KernelShape,
    angle: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    axis?: [number, number, number],
    center?: [number, number, number]
  ): OperationResult;
  mirrorWithHistory(
    shape: KernelShape,
    origin: [number, number, number],
    normal: [number, number, number],
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult;
  scaleWithHistory(
    shape: KernelShape,
    center: [number, number, number],
    factor: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult;
  generalTransformWithHistory(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number],
    isOrthogonal: boolean,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult;
  fuseWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): OperationResult;
  cutWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): OperationResult;
  intersectWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): OperationResult;
  filletWithHistory(
    shape: KernelShape,
    edges: KernelShape[],
    radius: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult;
  chamferWithHistory(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult;
  shellWithHistory(
    shape: KernelShape,
    faces: KernelShape[],
    thickness: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    tolerance?: number
  ): OperationResult;
  thickenWithHistory(
    shape: KernelShape,
    thickness: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult;
  offsetWithHistory(
    shape: KernelShape,
    distance: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    tolerance?: number
  ): OperationResult;

  // --- Meshing ---
  mesh(shape: KernelShape, options: MeshOptions): KernelMeshResult;
  /**
   * Tessellate edges for wireframe display.
   *
   * **Cross-kernel note**: brepkit only supports linear deflection;
   * `angularTolerance` is ignored (a one-time warning is emitted).
   */
  meshEdges(shape: KernelShape, tolerance: number, angularTolerance: number): KernelEdgeMeshResult;

  // --- Mesh boolean ---
  /** Boolean operation on raw triangle data. Returns merged mesh. */
  meshBoolean(
    positionsA: number[],
    indicesA: number[],
    positionsB: number[],
    indicesB: number[],
    op: string,
    tolerance: number
  ): KernelMeshResult;

  // --- File I/O ---
  exportSTEP(shapes: KernelShape[]): string;
  exportSTL(shape: KernelShape, binary?: boolean): string | ArrayBuffer;
  importSTEP(data: string | ArrayBuffer): KernelShape[];
  importSTL(data: string | ArrayBuffer): KernelShape;
  exportIGES(shapes: KernelShape[]): string;
  importIGES(data: string | ArrayBuffer): KernelShape[];
  exportSTEPAssembly(parts: StepAssemblyPart[], options?: { unit?: string }): string;

  // --- Extended I/O formats ---
  /** Export shape to 3MF format. Returns binary data. */
  export3MF(shape: KernelShape, tolerance: number): ArrayBuffer;
  /** Export shape to GLB format. Returns binary data. */
  exportGLB(shape: KernelShape, tolerance: number): ArrayBuffer;
  /** Export shape to OBJ format. Returns binary data. */
  exportOBJ(shape: KernelShape, tolerance: number): ArrayBuffer;
  /** Export shape to PLY format (binary). Returns binary data. */
  exportPLY(shape: KernelShape, tolerance: number): ArrayBuffer;
  /** Import from 3MF format. Returns solid shapes. */
  import3MF(data: ArrayBuffer): KernelShape[];
  /** Import from OBJ format. Returns a solid shape. */
  importOBJ(data: ArrayBuffer): KernelShape;
  /** Import from GLB format. Returns a solid shape. */
  importGLB(data: ArrayBuffer): KernelShape;

  // --- Measurement ---
  volume(shape: KernelShape): number;
  area(shape: KernelShape): number;
  length(shape: KernelShape): number;
  centerOfMass(shape: KernelShape): [number, number, number];
  linearCenterOfMass(shape: KernelShape): [number, number, number];
  boundingBox(shape: KernelShape): {
    min: [number, number, number];
    max: [number, number, number];
  };

  // --- Topology introspection ---
  iterShapes(shape: KernelShape, type: ShapeType): KernelShape[];
  /** Iterate a TopTools_ListOfShape, calling a callback for each item. */
  iterShapeList(list: KernelShape, callback: (item: KernelShape) => void): void;
  shapeType(shape: KernelShape): ShapeType;
  isSame(a: KernelShape, b: KernelShape): boolean;
  isEqual(a: KernelShape, b: KernelShape): boolean;
  downcast(shape: KernelShape, type?: ShapeType): KernelShape;
  hashCode(shape: KernelShape, upperBound: number): number;
  isNull(shape: KernelShape): boolean;
  shapeOrientation(shape: KernelShape): ShapeOrientation;
  /** Get edge-to-face adjacency map as JSON. */
  edgeToFaceMap(shape: KernelShape): string;
  /** Get shared edges between two faces. */
  sharedEdges(faceA: KernelShape, faceB: KernelShape): KernelShape[];
  /** Get faces adjacent to a given face within a shape. */
  adjacentFaces(shape: KernelShape, face: KernelShape): KernelShape[];

  // --- Geometry queries: vertex ---
  vertexPosition(vertex: KernelShape): [number, number, number];

  // --- Geometry queries: face / surface ---
  surfaceType(face: KernelShape): SurfaceType;
  uvBounds(face: KernelShape): { uMin: number; uMax: number; vMin: number; vMax: number };
  outerWire(face: KernelShape): KernelShape;
  surfaceNormal(face: KernelShape, u: number, v: number): [number, number, number];
  pointOnSurface(face: KernelShape, u: number, v: number): [number, number, number];
  uvFromPoint(face: KernelShape, point: [number, number, number]): [number, number] | null;
  projectPointOnFace(face: KernelShape, point: [number, number, number]): [number, number, number];

  // --- Geometry queries: edge / curve ---
  curveTangent(
    shape: KernelShape,
    param: number
  ): { point: [number, number, number]; tangent: [number, number, number] };
  curveParameters(shape: KernelShape): [number, number];
  /** Evaluate a point at a raw parameter value on a curve. */
  curvePointAtParam(shape: KernelShape, param: number): [number, number, number];
  /** Check if a curve is closed. */
  curveIsClosed(shape: KernelShape): boolean;
  /** Check if a curve is periodic. */
  curveIsPeriodic(shape: KernelShape): boolean;
  /** Get the period of a periodic curve. */
  curvePeriod(shape: KernelShape): number;
  /** Get the geometric curve type (LINE, CIRCLE, BSPLINE, etc.). */
  curveType(shape: KernelShape): string;

  // --- Simplification ---
  simplify(shape: KernelShape): KernelShape;

  // --- Validation & repair ---
  /**
   * Check if a shape is topologically and geometrically valid.
   *
   * Uses relaxed validation when available — accepts NURBS approximation
   * tolerances that strict mode would flag. Suitable for general "is this
   * shape usable?" checks.
   *
   * **Cross-kernel note**: OCCT uses `BRepCheck_Analyzer` (no relaxed
   * variant). brepkit uses `validateSolidRelaxed()` which tolerates
   * NURBS-approximated analytic shapes (cylinders, cones, tori).
   */
  isValid(shape: KernelShape): boolean;

  /**
   * Strict validation — fails on any geometric or topological issue,
   * including NURBS approximation gaps.
   *
   * Used by {@link isManifoldShell} as a proof that a shell forms a
   * watertight solid. Falls back to {@link isValid} if not overridden.
   *
   * **Cross-kernel note**: OCCT's `BRepCheck_Analyzer` is inherently
   * strict, so this is identical to `isValid`. brepkit uses
   * `validateSolid()` (strict) rather than `validateSolidRelaxed()`.
   */
  isValidStrict?(shape: KernelShape): boolean;

  sew(shapes: KernelShape[], tolerance?: number): KernelShape;
  healSolid(shape: KernelShape): KernelShape | null;
  healFace(shape: KernelShape): KernelShape;
  healWire(wire: KernelShape, face?: KernelShape): KernelShape;
  /** Merge coincident vertices within tolerance. Returns merge count. */
  mergeCoincidentVertices(shape: KernelShape, tolerance: number): number;
  /** Remove zero-length (degenerate) edges. Returns removal count. */
  removeDegenerateEdges(shape: KernelShape, tolerance: number): number;
  /** Fix face orientations for consistent normals. Returns fix count. */
  fixFaceOrientations(shape: KernelShape): number;

  // --- 2D offset ---
  offsetWire2D(
    wire: KernelShape,
    offset: number,
    joinType?: number | 'arc' | 'intersection' | 'tangent'
  ): KernelShape;

  // --- Distance ---
  distance(shape1: KernelShape, shape2: KernelShape): DistanceResult;

  // --- Classification ---
  classifyPointOnFace(
    face: KernelShape,
    u: number,
    v: number,
    tolerance?: number
  ): 'in' | 'on' | 'out';
  /** Classify a point using robust dual-method. */
  classifyPointRobust(
    shape: KernelShape,
    point: [number, number, number],
    tolerance: number
  ): string;
  /** Classify a point using winding numbers. */
  classifyPointWinding(
    shape: KernelShape,
    point: [number, number, number],
    tolerance: number
  ): string;

  // --- Splitting ---
  split(shape: KernelShape, tools: KernelShape[]): KernelShape;

  // --- Curve construction ---
  interpolatePoints(
    points: [number, number, number][],
    options?: { periodic?: boolean; tolerance?: number }
  ): KernelShape;
  approximatePoints(
    points: [number, number, number][],
    options?: {
      tolerance?: number;
      degMin?: number;
      degMax?: number;
      smoothing?: [number, number, number] | null;
    }
  ): KernelShape;

  // --- NURBS curve operations ---
  /** Elevate the degree of a NURBS edge curve. */
  curveDegreeElevate(edge: KernelShape, elevateBy: number): KernelShape;
  /** Insert a knot into a NURBS edge curve. */
  curveKnotInsert(edge: KernelShape, knot: number, times: number): KernelShape;
  /** Remove a knot from a NURBS edge curve. */
  curveKnotRemove(edge: KernelShape, knot: number, tolerance: number): KernelShape;
  /** Split a NURBS edge curve at a parameter. Returns two edges. */
  curveSplit(edge: KernelShape, param: number): [KernelShape, KernelShape];
  /** Approximate a surface via LSPIA. */
  approximateSurfaceLspia(
    coords: number[],
    rows: number,
    cols: number,
    degreeU: number,
    degreeV: number,
    numCpsU: number,
    numCpsV: number,
    tolerance: number,
    maxIterations: number
  ): KernelShape;
  /** Untrim a NURBS face to its full surface domain. */
  untrimFace(face: KernelShape, samplesPerCurve: number, interiorSamples: number): KernelShape;

  // --- Serialization ---
  /**
   * Serialize a shape to a string format for persistence.
   *
   * **Cross-kernel warning**: The serialization format is kernel-specific.
   * OCCT uses its native BREP text format; brepkit proxies to STEP.
   * Data produced by one kernel cannot be deserialized by the other.
   * Only use for same-kernel round-trips.
   */
  toBREP(shape: KernelShape): string;
  /** @see {@link toBREP} for cross-kernel compatibility notes. */
  fromBREP(data: string): KernelShape;

  // --- Mesh preparation ---
  hasTriangulation(shape: KernelShape): boolean;
  meshShape(shape: KernelShape, tolerance: number, angularTolerance: number): void;

  // --- Composed transforms ---
  /** Create a composed transform from a sequence of translate/rotate operations. Returns an opaque handle. */
  composeTransform(
    ops: Array<
      | { type: 'translate'; x: number; y: number; z: number }
      | {
          type: 'rotate';
          angle: number;
          axis?: [number, number, number] | undefined;
          center?: [number, number, number] | undefined;
        }
    >
  ): { handle: KernelType; dispose: () => void };
  /** Apply a composed transform to a shape with history tracking. */
  applyComposedTransformWithHistory(
    shape: KernelShape,
    transformHandle: KernelType,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult;

  // --- Advanced sweep/loft ---
  /** Sweep a profile along a spine with advanced options (transition mode, auxiliary spine, law). */
  sweepPipeShell(
    profile: KernelShape,
    spine: KernelShape,
    options?: {
      transitionMode?: 'transformed' | 'round' | 'right';
      auxiliary?: KernelShape;
      law?: KernelType;
      contact?: boolean;
      correction?: boolean;
      frenet?: boolean;
      support?: KernelType;
      shellMode?: boolean;
      tolerance?: number | undefined;
      boundTolerance?: number | undefined;
      angularTolerance?: number | undefined;
      maxDegree?: number | undefined;
      maxSegments?: number | undefined;
    }
  ): KernelShape | { shape: KernelShape; firstShape: KernelShape; lastShape: KernelShape };
  /** Loft through wires with options for shell mode, ruled surface, and vertex caps. */
  loftAdvanced(
    wires: KernelShape[],
    options?: {
      solid?: boolean;
      ruled?: boolean;
      tolerance?: number;
      startVertex?: KernelShape;
      endVertex?: KernelShape;
    }
  ): KernelShape;
  /** Build an extrusion scaling law (s-curve or linear). */
  buildExtrusionLaw(profile: 'linear' | 's-curve', length: number, endFactor: number): KernelType;
  /** Revolve a shape around an axis defined by center+direction (Vec3s, not KernelType axis). */
  revolveVec(
    shape: KernelShape,
    center: [number, number, number],
    direction: [number, number, number],
    angle: number
  ): KernelShape;

  // --- Curve positioning ---
  /** Position a shape at a parameter along a spine curve (Frenet frame transform). */
  positionOnCurve(shape: KernelShape, spine: KernelShape, param: number): KernelShape;

  // --- Pattern generation ---
  /** Generate a linear pattern of shapes with pooled transforms for performance. */
  linearPattern(
    shape: KernelShape,
    direction: [number, number, number],
    spacing: number,
    count: number
  ): KernelShape[];
  /** Generate a circular pattern of shapes. */
  circularPattern(
    shape: KernelShape,
    center: [number, number, number],
    axis: [number, number, number],
    angleStep: number,
    count: number
  ): KernelShape[];
  /** Generate a 2D grid pattern (brepkit-native). Returns a compound. */
  gridPattern?(
    shape: KernelShape,
    directionX: [number, number, number],
    directionY: [number, number, number],
    spacingX: number,
    spacingY: number,
    countX: number,
    countY: number
  ): KernelShape;

  // --- Surface construction ---
  /** Build a non-planar face by filling a wire's boundary. */
  makeNonPlanarFace(wire: KernelShape): KernelShape;
  /** Add hole wires to an existing face. */
  addHolesInFace(face: KernelShape, holeWires: KernelShape[]): KernelShape;
  /** Remove all inner wires (holes) from a face. Returns a new face with only the outer boundary. */
  removeHolesFromFace(face: KernelShape): KernelShape;
  /** Build a face on an existing surface bounded by a wire. */
  makeFaceOnSurface(surface: KernelType, wire: KernelShape): KernelShape;
  /** Fit a B-spline surface through a grid of Z-heights. */
  bsplineSurface(points: [number, number, number][], rows: number, cols: number): KernelShape;
  /** Build a triangulated surface from a height grid. */
  triangulatedSurface(points: [number, number, number][], rows: number, cols: number): KernelShape;

  // --- Mesh sewing -> solid ---
  /**
   * Build a triangular face from 3 points. Returns null if degenerate.
   * Used by importers, hull, roof, and surface builders.
   */
  buildTriFace(
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number]
  ): KernelShape | null;

  /** Sew triangular faces into a shell and convert to solid. */
  sewAndSolidify(faces: KernelShape[], tolerance: number): KernelShape;

  // --- Repair ---
  /** Run ShapeFix_Shape on a shape (fixes orientation, etc.). */
  fixShape(shape: KernelShape): KernelShape;

  /** Fix self-intersections in a wire. */
  fixSelfIntersection(wire: KernelShape): KernelShape;

  // --- Measurement ---
  /** Compute surface curvature at a UV point on a face. */
  surfaceCurvature(
    face: KernelShape,
    u: number,
    v: number
  ): {
    gaussian: number;
    mean: number;
    max: number;
    min: number;
    maxDirection: [number, number, number];
    minDirection: [number, number, number];
  };
  /** Surface-based center of mass (uses surface properties, not volume). */
  surfaceCenterOfMass(face: KernelShape): [number, number, number];
  /** Create a persistent distance query tool for repeated measurements. */
  createDistanceQuery(referenceShape: KernelShape): {
    distanceTo(shape: KernelShape): {
      value: number;
      point1: [number, number, number];
      point2: [number, number, number];
    };
    dispose(): void;
  };

  // --- Feature detection ---
  /** Detect small features (faces below area threshold). Returns face shapes. */
  detectSmallFeatures(shape: KernelShape, areaThreshold: number, tolerance: number): KernelShape[];
  /** Recognize geometric features. Returns JSON description. */
  recognizeFeatures(shape: KernelShape, tolerance: number): string;

  // --- Projection ---
  /** Project 3D edges onto a 2D plane (hidden line removal). */
  projectEdges(
    shape: KernelShape,
    cameraOrigin: [number, number, number],
    cameraDirection: [number, number, number],
    cameraXAxis?: [number, number, number]
  ): {
    visible: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
    hidden: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
  };

  // --- Draft ---
  /** Create a draft prism (tapered extrusion with draft angle). */
  draftPrism(
    shape: KernelShape,
    face: KernelShape,
    baseFace: KernelShape,
    height: number | null,
    angleDeg: number,
    fuse: boolean
  ): KernelShape;

  /** Create an XCAF document with named, colored shape nodes. Returns the doc handle (caller must delete). */
  createXCAFDocument(
    shapes: Array<{
      shape: KernelShape;
      name: string;
      color?: [number, number, number, number] | undefined;
    }>
  ): KernelType;

  /** Write an XCAF document to STEP format and return the string. */
  writeXCAFToSTEP(
    doc: KernelType,
    options?: { unit?: string | undefined; modelUnit?: string | undefined }
  ): string;

  // --- Export internals (fully encapsulated) ---
  /** Export shapes to STEP with full configuration (units, assembly mode). */
  exportSTEPConfigured(
    shapes: Array<{
      shape: KernelShape;
      name?: string | undefined;
      color?: [number, number, number, number] | undefined;
    }>,
    options?: {
      unit?: string | undefined;
      modelUnit?: string | undefined;
      schema?: number | undefined;
    }
  ): string;

  // --- Export helpers ---
  /** Wrap a JS string as a kernel extended string. */
  wrapString(str: string): KernelType;
  /** Create a kernel color from RGB 0-255 and alpha 0-1. */
  wrapColor(red: number, green: number, blue: number, alpha: number): KernelType;
  /** Configure STEP writer unit settings. */
  configureStepUnits(unit: string | undefined, modelUnit: string | undefined): void;
  /** Configure STEP writer standard settings (color, layer, name, schema). */
  configureStepWriter(writer: KernelType): void;

  // --- Curve adaptor ---
  /** Create a BRepAdaptor for curve evaluation (CompCurve for wires, Curve for edges). */
  createCurveAdaptor(shape: KernelShape): KernelType;

  // --- Bezier pole extraction (3D) ---
  /** Get the second-to-last Bezier control pole of a 3D edge curve. */
  getBezierPenultimatePole(edge: KernelShape): [number, number, number] | null;

  // --- Surface geometry extraction ---
  /** Extract cylinder data from a surface handle. Returns null if not a cylinder. */
  getSurfaceCylinderData(surface: KernelType): { radius: number; isDirect: boolean } | null;
  /** Reverse the U direction of a surface. Returns a new surface handle. */
  reverseSurfaceU(surface: KernelType): KernelType;

  // --- 3D Geometry primitive factories ---
  createPoint3d(x: number, y: number, z: number): KernelType;
  createDirection3d(x: number, y: number, z: number): KernelType;
  createVector3d(x: number, y: number, z: number): KernelType;
  createAxis1(cx: number, cy: number, cz: number, dx: number, dy: number, dz: number): KernelType;
  createAxis2(
    ox: number,
    oy: number,
    oz: number,
    zx: number,
    zy: number,
    zz: number,
    xx?: number,
    xy?: number,
    xz?: number
  ): KernelType;
  createAxis3(
    ox: number,
    oy: number,
    oz: number,
    zx: number,
    zy: number,
    zz: number,
    xx?: number,
    xy?: number,
    xz?: number
  ): KernelType;

  // --- Shape reversal ---
  /** Return a copy of the shape with reversed orientation. */
  reverseShape(shape: KernelShape): KernelShape;

  // --- Batch execution ---
  /** Execute a batch of kernel operations from JSON. Returns JSON result. */
  executeBatch(json: string): string;

  // --- Checkpoint / Restore (arena memory management) ---
  /** Create an arena checkpoint. Returns checkpoint index. */
  checkpoint(): number;
  /** Get the current number of active checkpoints. */
  checkpointCount(): number;
  /** Restore arena to a checkpoint, freeing all handles created after it. */
  restoreCheckpoint(cp: number): void;
  /** Discard a checkpoint without restoring (keep all handles). */
  discardCheckpoint(cp: number): void;

  // --- Dispose ---
  dispose(handle: { delete(): void }): void;
}

// ---------------------------------------------------------------------------
// Capability interfaces (optional per kernel)
// ---------------------------------------------------------------------------

/** Capability for 2D constraint sketch solving. */
export interface ConstraintSketchCapability {
  /** Create a new constraint sketch. Returns an opaque sketch handle. */
  sketchNew(): number;
  /** Add a point to a constraint sketch. Returns the point index. */
  sketchAddPoint(sketch: number, x: number, y: number, fixed: boolean): number;
  /** Add a constraint to a sketch (JSON-encoded constraint descriptor). */
  sketchAddConstraint(sketch: number, constraintJson: string): void;
  /** Solve sketch constraints. Returns a JSON result with solved point positions. */
  sketchSolve(sketch: number, maxIterations: number, tolerance: number): string;
  /** Get degrees of freedom remaining in a constraint sketch. */
  sketchDof(sketch: number): number;
}

/** Capability for hidden-line removal (3D → 2D projection). */
export interface ProjectionCapability {
  /** Project a 3D shape onto a 2D plane along a view direction. */
  projectShape(
    shape: KernelShape,
    viewOrigin: [number, number, number],
    viewDirection: [number, number, number]
  ): {
    visible: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
    hidden: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
  };
}

// ---------------------------------------------------------------------------
// Capability type guards
// ---------------------------------------------------------------------------

/** Check if the kernel supports hidden-line-removal projection. */
export function supportsProjection(
  kernel: KernelAdapter
): kernel is KernelAdapter & ProjectionCapability {
  return 'projectShape' in kernel;
}

/** Check if the kernel supports 2D constraint sketch solving. */
export function supportsConstraintSketch(
  kernel: KernelAdapter
): kernel is KernelAdapter & ConstraintSketchCapability {
  return 'sketchNew' in kernel && 'sketchDof' in kernel;
}
