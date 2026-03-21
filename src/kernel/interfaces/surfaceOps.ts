/**
 * KernelSurfaceOps — surface geometry queries, classification, and features.
 *
 * Covers surface type identification, UV evaluation, normal computation,
 * point projection and classification, NURBS surface operations (LSPIA,
 * untrim), surface geometry extraction, feature detection, and hidden-line
 * projection. Analogous to OCCT's BRepAdaptor_Surface, BRepClass, and
 * HLRBRep packages.
 *
 * @see {@link KernelCurveOps} for curve geometry queries.
 */

import type { KernelShape, KernelType, SurfaceType, NurbsSurfaceData } from '@/kernel/types.js';

export interface KernelSurfaceOps {
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

  // --- NURBS surface operations ---
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

  // --- Surface geometry extraction ---
  /** Extract cylinder data from a surface handle. Returns null if not a cylinder. */
  getSurfaceCylinderData(surface: KernelType): { radius: number; isDirect: boolean } | null;
  /** Reverse the U direction of a surface. Returns a new surface handle. */
  reverseSurfaceU(surface: KernelType): KernelType;

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

  /** Extract NURBS data from a BSpline face. Returns null for non-BSpline surfaces. */
  getNurbsSurfaceData?(face: KernelShape): NurbsSurfaceData | null;
}
