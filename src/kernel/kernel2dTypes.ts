/**
 * Kernel2DCapability — abstraction over 2D geometry operations.
 *
 * This capability interface covers all 2D curve construction, transformation,
 * querying, and intersection operations needed by the 2D subsystem (Blueprint,
 * Curve2D, Sketcher2d, etc.).
 *
 * All 2D handles are opaque — the kernel manages their lifetime.
 * Callers must call dispose() on handles when done.
 */

import type { KernelShape, KernelType } from './types.js';

// ---------------------------------------------------------------------------
// Opaque handle types for 2D geometry
// ---------------------------------------------------------------------------

/** Opaque handle to a 2D curve (Geom2d_Curve or similar). */
export type Curve2dHandle = KernelType;

/** Opaque handle to a 2D bounding box. */
export type BBox2dHandle = KernelType;

// ---------------------------------------------------------------------------
// Kernel2DCapability interface
// ---------------------------------------------------------------------------

export interface Kernel2DCapability {
  // --- 2D Point/Vector factories ---
  createPoint2d(x: number, y: number): KernelType;
  createDirection2d(x: number, y: number): KernelType;
  createVector2d(x: number, y: number): KernelType;
  createAxis2d(px: number, py: number, dx: number, dy: number): KernelType;

  // --- 2D Handle wrapping ---
  /** Wrap a raw Geom2d_Curve in a Handle_Geom2d_Curve. */
  wrapCurve2dHandle(handle: KernelType): Curve2dHandle;
  /** Create a Geom2dAdaptor_Curve for algorithmic queries. Caller must delete. */
  createCurve2dAdaptor(handle: Curve2dHandle): KernelType;

  // --- 2D Curve construction ---
  makeLine2d(x1: number, y1: number, x2: number, y2: number): Curve2dHandle;
  makeCircle2d(cx: number, cy: number, radius: number, sense?: boolean): Curve2dHandle;
  makeArc2dThreePoints(
    x1: number,
    y1: number,
    xm: number,
    ym: number,
    x2: number,
    y2: number
  ): Curve2dHandle;
  makeArc2dTangent(
    startX: number,
    startY: number,
    tangentX: number,
    tangentY: number,
    endX: number,
    endY: number
  ): Curve2dHandle;
  makeEllipse2d(
    cx: number,
    cy: number,
    majorRadius: number,
    minorRadius: number,
    xDirX?: number,
    xDirY?: number,
    sense?: boolean
  ): Curve2dHandle;
  makeEllipseArc2d(
    cx: number,
    cy: number,
    majorRadius: number,
    minorRadius: number,
    startAngle: number,
    endAngle: number,
    xDirX?: number,
    xDirY?: number,
    sense?: boolean
  ): Curve2dHandle;
  makeBezier2d(points: [number, number][]): Curve2dHandle;
  makeBSpline2d(
    points: [number, number][],
    options?: {
      degMin?: number;
      degMax?: number;
      continuity?: 'C0' | 'C1' | 'C2' | 'C3';
      tolerance?: number;
      smoothing?: [number, number, number] | null;
    }
  ): Curve2dHandle;

  // --- 2D Curve queries ---
  evaluateCurve2d(curve: Curve2dHandle, param: number): [number, number];
  evaluateCurve2dD1(
    curve: Curve2dHandle,
    param: number
  ): { point: [number, number]; tangent: [number, number] };
  getCurve2dBounds(curve: Curve2dHandle): { first: number; last: number };
  getCurve2dType(curve: Curve2dHandle): string;

  // --- 2D Curve modification ---
  trimCurve2d(curve: Curve2dHandle, start: number, end: number): Curve2dHandle;
  reverseCurve2d(curve: Curve2dHandle): void;
  copyCurve2d(curve: Curve2dHandle): Curve2dHandle;
  offsetCurve2d(curve: Curve2dHandle, offset: number): Curve2dHandle;

  // --- 2D Transformations ---
  translateCurve2d(curve: Curve2dHandle, dx: number, dy: number): Curve2dHandle;
  rotateCurve2d(curve: Curve2dHandle, angle: number, cx: number, cy: number): Curve2dHandle;
  scaleCurve2d(curve: Curve2dHandle, factor: number, cx: number, cy: number): Curve2dHandle;
  mirrorCurve2dAtPoint(curve: Curve2dHandle, cx: number, cy: number): Curve2dHandle;
  mirrorCurve2dAcrossAxis(
    curve: Curve2dHandle,
    originX: number,
    originY: number,
    dirX: number,
    dirY: number
  ): Curve2dHandle;
  affinityTransform2d(
    curve: Curve2dHandle,
    axisOriginX: number,
    axisOriginY: number,
    axisDirX: number,
    axisDirY: number,
    ratio: number
  ): Curve2dHandle;

  // --- 2D General transforms (gp_GTrsf2d) ---
  /** Create an identity gp_GTrsf2d. Caller must dispose. */
  createIdentityGTrsf2d(): KernelType;
  /** Create a gp_GTrsf2d with affinity along an axis. Caller must dispose. */
  createAffinityGTrsf2d(
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
    ratio: number
  ): KernelType;
  /** Create a gp_GTrsf2d from a translation. Caller must dispose. */
  createTranslationGTrsf2d(dx: number, dy: number): KernelType;
  /** Create a gp_GTrsf2d from a point or axis mirror. Caller must dispose. */
  createMirrorGTrsf2d(
    cx: number,
    cy: number,
    mode: 'point' | 'axis',
    originX?: number,
    originY?: number,
    dirX?: number,
    dirY?: number
  ): KernelType;
  /** Create a gp_GTrsf2d from a rotation. Caller must dispose. */
  createRotationGTrsf2d(angle: number, cx: number, cy: number): KernelType;
  /** Create a gp_GTrsf2d from a uniform scale. Caller must dispose. */
  createScaleGTrsf2d(factor: number, cx: number, cy: number): KernelType;
  /** Set the translation part of a gp_GTrsf2d (mutates). */
  setGTrsf2dTranslationPart(gtrsf: KernelType, dx: number, dy: number): void;
  /** Multiply base by other in-place: base = base * other. */
  multiplyGTrsf2d(base: KernelType, other: KernelType): void;
  /** Apply a general 2D transform to a curve via GeomLib.GTransform. */
  transformCurve2dGeneral(curve: Curve2dHandle, gtrsf: KernelType): Curve2dHandle;

  // --- 2D Intersection & distance ---
  intersectCurves2d(
    c1: Curve2dHandle,
    c2: Curve2dHandle,
    tolerance: number
  ): {
    points: [number, number][];
    segments: Curve2dHandle[];
  };
  projectPointOnCurve2d(
    curve: Curve2dHandle,
    x: number,
    y: number
  ): { param: number; distance: number } | null;
  distanceBetweenCurves2d(
    c1: Curve2dHandle,
    c2: Curve2dHandle,
    p1Start: number,
    p1End: number,
    p2Start: number,
    p2End: number
  ): number;

  // --- 2D Approximation ---
  approximateCurve2dAsBSpline(
    curve: Curve2dHandle,
    tolerance: number,
    continuity: 'C0' | 'C1' | 'C2' | 'C3',
    maxSegments: number
  ): Curve2dHandle;
  decomposeBSpline2dToBeziers(curve: Curve2dHandle): Curve2dHandle[];

  // --- 2D Bounding box ---
  createBoundingBox2d(): BBox2dHandle;
  addCurveToBBox2d(bbox: BBox2dHandle, curve: Curve2dHandle, tolerance: number): void;
  getBBox2dBounds(bbox: BBox2dHandle): {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
  };
  mergeBBox2d(target: BBox2dHandle, other: BBox2dHandle): void;
  isBBox2dOut(a: BBox2dHandle, b: BBox2dHandle): boolean;
  isBBox2dOutPoint(bbox: BBox2dHandle, x: number, y: number): boolean;

  // --- 2D Type extraction ---
  getCurve2dCircleData(curve: Curve2dHandle): {
    cx: number;
    cy: number;
    radius: number;
    isDirect: boolean;
  } | null;
  getCurve2dEllipseData(curve: Curve2dHandle): {
    majorRadius: number;
    minorRadius: number;
    xAxisAngle: number;
    isDirect: boolean;
  } | null;
  getCurve2dBezierPoles(curve: Curve2dHandle): [number, number][] | null;
  getCurve2dBezierDegree(curve: Curve2dHandle): number | null;
  getCurve2dBSplineData(curve: Curve2dHandle): {
    poles: [number, number][];
    knots: number[];
    multiplicities: number[];
    degree: number;
    isPeriodic: boolean;
  } | null;

  // --- 2D Serialization ---
  serializeCurve2d(curve: Curve2dHandle): string;
  deserializeCurve2d(data: string): Curve2dHandle;

  // --- 2D Curve splitting ---
  splitCurve2d(curve: Curve2dHandle, params: number[]): Curve2dHandle[];

  // --- 2D → 3D projection ---
  liftCurve2dToPlane(
    curve: Curve2dHandle,
    planeOrigin: [number, number, number],
    planeZ: [number, number, number],
    planeX: [number, number, number]
  ): KernelShape;
  buildEdgeOnSurface(curve: Curve2dHandle, surface: KernelType): KernelShape;
  extractSurfaceFromFace(face: KernelShape): KernelType;
  extractCurve2dFromEdge(edge: KernelShape, face: KernelShape): Curve2dHandle;
  buildCurves3d(wire: KernelShape): void;
  fixWireOnFace(wire: KernelShape, face: KernelShape, tolerance: number): KernelShape;

  // --- Surface filling ---
  fillSurface(
    wires: KernelShape[],
    options?: {
      order?: number;
      nbPtsOnCur?: number;
      nbIter?: number;
      tol3d?: number;
      tol2d?: number;
      maxDeg?: number;
      maxSeg?: number;
    }
  ): KernelShape;
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/** Check if the kernel supports 2D geometry operations. */
export function supportsKernel2D(kernel: {
  oc?: unknown;
}): kernel is { oc: unknown } & Kernel2DCapability {
  return 'makeLine2d' in kernel;
}
