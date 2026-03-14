/**
 * KernelGeometryOps — geometry queries, NURBS operations, and classification.
 *
 * Covers vertex/face/edge/curve queries, surface and curve type identification,
 * UV evaluation, normal computation, point projection, classification,
 * NURBS degree/knot manipulation, and surface extraction. Analogous to
 * OCCT's BRep_Tool, BRepAdaptor, and BRepClass packages.
 *
 * @see {@link KernelConstructionOps} for shape construction.
 */

import type { KernelShape, KernelType, SurfaceType } from '../types.js';

export interface KernelGeometryOps {
  // --- Vertex ---
  vertexPosition(vertex: KernelShape): [number, number, number];

  // --- Face / surface ---
  surfaceType(face: KernelShape): SurfaceType;
  uvBounds(face: KernelShape): { uMin: number; uMax: number; vMin: number; vMax: number };
  outerWire(face: KernelShape): KernelShape;
  surfaceNormal(face: KernelShape, u: number, v: number): [number, number, number];
  pointOnSurface(face: KernelShape, u: number, v: number): [number, number, number];
  uvFromPoint(face: KernelShape, point: [number, number, number]): [number, number] | null;
  projectPointOnFace(face: KernelShape, point: [number, number, number]): [number, number, number];

  // --- Edge / curve ---
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
}
