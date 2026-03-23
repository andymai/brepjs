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

import type { KernelAdapter } from './interfaces/index.js';

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
  /**
   * When true, accepts any Shape3D (shells, compounds) without requiring
   * ValidSolid branding. This is a type-level escape hatch only — no runtime
   * effect.
   */
  unsafe?: boolean;
  /**
   * When false, skips face evolution tracking (hash collection, Modified/Generated/Deleted
   * queries, metadata propagation). This is a performance optimization for intermediate
   * boolean operations where face tags/colors are not needed. Defaults to `true`.
   */
  trackEvolution?: boolean | undefined;
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

/** Diagnostic information from a boolean operation. */
export interface BooleanDiagnostics {
  /** Whether the OCCT algorithm reported internal errors. */
  readonly hasErrors: boolean;
  /** Whether the OCCT algorithm reported warnings. */
  readonly hasWarnings: boolean;
  /**
   * Human-readable messages. Currently always empty — OCCT's message
   * reporting via Standard_OStream is not accessible in WASM builds.
   * Reserved for future use.
   */
  readonly messages: readonly string[];
}

/** Extended operation result with diagnostics. */
export interface DiagnosticOperationResult extends OperationResult {
  readonly diagnostics: BooleanDiagnostics;
}

/** Issue detected during boolean pre-validation. */
export interface BooleanIssue {
  readonly operand: 'base' | 'tool';
  readonly issue: 'null-shape' | 'not-valid';
  readonly message: string;
}

/** Result of boolean pre-validation. */
export interface CheckBooleanResult {
  readonly valid: boolean;
  readonly issues: readonly BooleanIssue[];
}

/** Boolean operation type for checkBoolean. */
export type BooleanOpType = 'fuse' | 'cut' | 'intersect';

/** Options for STEP assembly export with named/colored parts. */
export interface StepAssemblyPart {
  shape: KernelShape;
  name: string;
  color?: [number, number, number, number]; // RGBA 0-255
}

/** Read-only NURBS curve data. */
export interface NurbsCurveData {
  readonly degree: number;
  readonly poles: ReadonlyArray<readonly [number, number, number]>;
  readonly weights: ReadonlyArray<number>;
  readonly knots: ReadonlyArray<number>;
  readonly multiplicities: ReadonlyArray<number>;
  readonly isPeriodic: boolean;
  readonly isRational: boolean;
}

/** Read-only NURBS surface data. */
export interface NurbsSurfaceData {
  readonly degreeU: number;
  readonly degreeV: number;
  readonly nbPolesU: number;
  readonly nbPolesV: number;
  readonly poles: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>>;
  readonly weights: ReadonlyArray<ReadonlyArray<number>>;
  readonly knotsU: ReadonlyArray<number>;
  readonly knotsV: ReadonlyArray<number>;
  readonly multiplicitiesU: ReadonlyArray<number>;
  readonly multiplicitiesV: ReadonlyArray<number>;
  readonly isPeriodicU: boolean;
  readonly isPeriodicV: boolean;
  readonly isRational: boolean;
}

// ---------------------------------------------------------------------------
// Kernel adapter — composed from domain-aligned sub-interfaces
// ---------------------------------------------------------------------------

export type { KernelAdapter } from './interfaces/index.js';

// ---------------------------------------------------------------------------
// Capability interfaces (optional per kernel)
// ---------------------------------------------------------------------------

/** Capability for 2D constraint sketch solving. */
export interface ConstraintSketchCapability {
  /** Create a new constraint sketch. Returns an opaque sketch handle. */
  sketchNew(): number;
  /** Add a point to a constraint sketch. Returns the point index. */
  sketchAddPoint(sketch: number, x: number, y: number, fixed: boolean): number;
  /** Add an arc entity to a constraint sketch. Returns the arc index. */
  sketchAddArc(sketch: number, centerIdx: number, startIdx: number, endIdx: number): number;
  /** Add a constraint to a sketch (JSON-encoded constraint descriptor). */
  sketchAddConstraint(sketch: number, constraintJson: string): void;
  /** Solve sketch constraints. Returns a JSON result with solved point positions. */
  sketchSolve(sketch: number, maxIterations: number, tolerance: number): string;
  /** Get degrees of freedom remaining in a constraint sketch. Returns JSON string. */
  sketchDof(sketch: number): string;
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
