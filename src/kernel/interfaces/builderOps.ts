/**
 * KernelBuilderOps — extended shape construction and assembly.
 *
 * Covers vertex/edge/wire/face construction, extended curve builders
 * (arcs, ellipses, Bezier, helix), convex hulls, surface construction,
 * mesh sewing, curve interpolation/approximation, and 3D geometry
 * primitive factories. Analogous to OCCT's BRepBuilderAPI package.
 *
 * @see {@link KernelPrimitiveOps} for solid primitives (box, cylinder, etc.).
 */

import type { KernelShape, KernelType } from '@/kernel/types.js';

/**
 * One boundary edge of an N-sided filling: met in position only, or, with a
 * `support` face, met tangentially (`G1`, the default) or with matching
 * curvature (`G2`).
 */
export interface FillBoundaryEdge {
  readonly edge: KernelShape;
  readonly support?: KernelShape | undefined;
  readonly continuity?: 'G1' | 'G2' | undefined;
}

/** Interior constraints and solver controls for an N-sided filling; omitted controls take OCCT's defaults. */
export interface FillSurfaceOptions {
  /** Points the face must pass through. */
  readonly points?: readonly (readonly [number, number, number])[] | undefined;
  /** Edges the face must pass through that are not part of its boundary. */
  readonly guides?: readonly KernelShape[] | undefined;
  /** A face whose surface seeds the solver. */
  readonly initSurface?: KernelShape | undefined;
  /** Degree of the energy-minimizing surface (default 3). */
  readonly degree?: number | undefined;
  /** Points sampled on each constraint curve (default 15). */
  readonly pointsOnCurve?: number | undefined;
  /** Solver iterations (default 2). */
  readonly iterations?: number | undefined;
  /** 3D tolerance (default 1e-4). */
  readonly tolerance?: number | undefined;
  /** Angular tolerance in radians for tangent constraints (default 1e-2). */
  readonly angularTolerance?: number | undefined;
  /** Highest degree of the approximating B-spline (default 8). */
  readonly maxDegree?: number | undefined;
  /** Most segments of the approximating B-spline (default 9). */
  readonly maxSegments?: number | undefined;
}

/**
 * A B-spline surface given exactly, for {@link KernelBuilderOps.nurbsSurface}:
 * the same fields `getNurbsSurfaceData` reads back. Knots strictly
 * increase; multiplicities follow OCCT's rules (ends at most `degree + 1` on a
 * non-periodic surface, interior knots at most `degree`) and account for
 * exactly the poles in their direction.
 */
export interface NurbsSurfaceInput {
  readonly degreeU: number;
  readonly degreeV: number;
  /** `poles[i][j]`: the `i`-th pole along u, the `j`-th along v. */
  readonly poles: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>>;
  /** One positive weight per pole, in the same layout; omit for a non-rational surface. */
  readonly weights?: ReadonlyArray<ReadonlyArray<number>> | undefined;
  readonly knotsU: ReadonlyArray<number>;
  readonly knotsV: ReadonlyArray<number>;
  readonly multiplicitiesU: ReadonlyArray<number>;
  readonly multiplicitiesV: ReadonlyArray<number>;
  readonly isPeriodicU?: boolean | undefined;
  readonly isPeriodicV?: boolean | undefined;
}

export interface KernelBuilderOps {
  // --- Basic construction ---
  makeVertex(x: number, y: number, z: number): KernelShape;
  makeEdge(curve: KernelType, start?: number, end?: number): KernelShape;
  makeWire(edges: KernelShape[]): KernelShape;
  makeFace(wire: KernelShape, planar?: boolean): KernelShape;

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
  solidFromShell(shell: KernelShape): KernelShape;

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

  // --- Surface construction ---
  /** Build a non-planar face by filling a wire's boundary. */
  makeNonPlanarFace(wire: KernelShape): KernelShape;
  /**
   * Fill a closed boundary with a smooth face (N-sided filling), meeting
   * support faces tangentially where given and passing through `options.points`.
   */
  fillNSided(boundary: readonly FillBoundaryEdge[], options?: FillSurfaceOptions): KernelShape;
  /**
   * An edge lying on `face`'s surface through `points`, approximated within
   * `tolerance`; points off the surface are projected onto it.
   */
  edgeOnSurface(
    face: KernelShape,
    points: readonly (readonly [number, number, number])[],
    tolerance: number,
    closed: boolean
  ): KernelShape;
  /** Add hole wires to an existing face. */
  addHolesInFace(face: KernelShape, holeWires: KernelShape[]): KernelShape;
  /** Remove all inner wires (holes) from a face. Returns a new face with only the outer boundary. */
  removeHolesFromFace(face: KernelShape): KernelShape;
  /** Build a face on an existing surface bounded by a wire. */
  makeFaceOnSurface(surface: KernelType, wire: KernelShape): KernelShape;
  /** Fit a B-spline surface through a grid of Z-heights. */
  bsplineSurface(points: [number, number, number][], rows: number, cols: number): KernelShape;
  /** A face over a whole B-spline surface given exactly by its poles and knots. */
  nurbsSurface(data: NurbsSurfaceInput): KernelShape;
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

  // --- 3D geometry primitive factories ---
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
}
