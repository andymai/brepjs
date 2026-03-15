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

import type { KernelShape, KernelType } from '../types.js';

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
