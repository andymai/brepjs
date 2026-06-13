/**
 * Geometry query operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type {
  KernelShape,
  KernelType,
  NurbsCurveData,
  NurbsSurfaceData,
  SurfaceType,
} from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import {
  type BrepkitHandle,
  isBrepkitHandle,
  edgeHandle,
  faceHandle,
  wireHandle,
  unwrap,
  unwrapSolidOrThrow,
  toArray,
  dist3,
  warnOnce,
} from './helpers.js';
import { iterShapes } from './topologyOps.js';
import { extractNurbsFromEdge } from './internalOps.js';
import { vec3At, wasmIndex } from '@/utils/vec3.js';

// ═══════════════════════════════════════════════════════════════════════
// Vertex geometry
// ═══════════════════════════════════════════════════════════════════════

export function vertexPosition(bk: BrepkitKernel, vertex: KernelShape): [number, number, number] {
  return vec3At(bk.getVertexPosition(unwrap(vertex, 'vertex')));
}

// ═══════════════════════════════════════════════════════════════════════
// Face / surface geometry
// ═══════════════════════════════════════════════════════════════════════

export function surfaceType(bk: BrepkitKernel, face: KernelShape): SurfaceType {
  const typeStr: string = bk.getSurfaceType(unwrap(face, 'face'));
  return typeStr as SurfaceType;
}

export function uvBounds(
  bk: BrepkitKernel,
  face: KernelShape
): { uMin: number; uMax: number; vMin: number; vMax: number } {
  const domain = bk.getSurfaceDomain(unwrap(face, 'face'));
  return {
    uMin: wasmIndex(domain, 0),
    uMax: wasmIndex(domain, 1),
    vMin: wasmIndex(domain, 2),
    vMax: wasmIndex(domain, 3),
  };
}

export function outerWire(bk: BrepkitKernel, face: KernelShape): KernelShape {
  const id = bk.getFaceOuterWire(unwrap(face, 'face'));
  return wireHandle(id);
}

export function surfaceNormal(
  bk: BrepkitKernel,
  face: KernelShape,
  u: number,
  v: number
): [number, number, number] {
  return vec3At(bk.evaluateSurfaceNormal(unwrap(face, 'face'), u, v));
}

export function pointOnSurface(
  bk: BrepkitKernel,
  face: KernelShape,
  u: number,
  v: number
): [number, number, number] {
  return vec3At(bk.evaluateSurface(unwrap(face, 'face'), u, v));
}

export function uvFromPoint(
  bk: BrepkitKernel,
  face: KernelShape,
  point: [number, number, number]
): [number, number] | null {
  try {
    const result = bk.projectPointOnSurface(unwrap(face, 'face'), point[0], point[1], point[2]);
    return [wasmIndex(result, 0), wasmIndex(result, 1)];
  } catch (e: unknown) {
    console.warn('brepkit: uvFromPoint failed:', e);
    return null;
  }
}

export function projectPointOnFace(
  bk: BrepkitKernel,
  face: KernelShape,
  point: [number, number, number]
): [number, number, number] {
  return vec3At(bk.projectPointOnSurface(unwrap(face, 'face'), point[0], point[1], point[2]), 2);
}

// ═══════════════════════════════════════════════════════════════════════
// Edge / curve geometry
// ═══════════════════════════════════════════════════════════════════════

export function curveTangent(
  bk: BrepkitKernel,
  shape: KernelShape,
  param: number
): { point: [number, number, number]; tangent: [number, number, number] } {
  const h = shape as BrepkitHandle;
  let edgeId: number;
  let evalParam = param;

  if (h.type === 'wire') {
    // Walk edges to find the right one for the composite parameter
    const edgeIds: number[] = toArray(bk.getWireEdges(h.id));
    edgeId = wasmIndex(edgeIds, edgeIds.length - 1); // fallback to last edge
    let cumulative = 0;
    for (const eid of edgeIds) {
      const p = bk.getEdgeCurveParameters(eid);
      const span = wasmIndex(p, 1) - wasmIndex(p, 0);
      if (param <= cumulative + span || eid === edgeId) {
        edgeId = eid;
        evalParam = Math.min(wasmIndex(p, 0) + (param - cumulative), wasmIndex(p, 1));
        break;
      }
      cumulative += span;
    }
  } else {
    edgeId = unwrap(shape, 'edge');
  }

  const result = bk.evaluateEdgeCurveD1(edgeId, evalParam);
  return {
    point: vec3At(result, 0),
    tangent: vec3At(result, 3),
  };
}

export function curveParameters(bk: BrepkitKernel, shape: KernelShape): [number, number] {
  const h = shape as BrepkitHandle;
  if (h.type === 'wire') {
    // For wires, compose a cumulative parameter range over all edges
    const edgeIds: number[] = toArray(bk.getWireEdges(h.id));
    if (edgeIds.length === 0) return [0, 0];
    let total = 0;
    for (const eid of edgeIds) {
      const p = bk.getEdgeCurveParameters(eid);
      total += wasmIndex(p, 1) - wasmIndex(p, 0);
    }
    return [0, total];
  }
  const params = bk.getEdgeCurveParameters(unwrap(shape, 'edge'));
  return [wasmIndex(params, 0), wasmIndex(params, 1)];
}

export function curvePointAtParam(
  bk: BrepkitKernel,
  shape: KernelShape,
  param: number
): [number, number, number] {
  const h = shape as BrepkitHandle;
  if (h.type === 'wire') {
    // Walk edges to find the right one for the composite parameter
    const edgeIds: number[] = toArray(bk.getWireEdges(h.id));
    let cumulative = 0;
    for (const eid of edgeIds) {
      const p = bk.getEdgeCurveParameters(eid);
      const span = wasmIndex(p, 1) - wasmIndex(p, 0);
      if (param <= cumulative + span || eid === edgeIds[edgeIds.length - 1]) {
        const localParam = wasmIndex(p, 0) + (param - cumulative);
        return vec3At(bk.evaluateEdgeCurve(eid, Math.min(localParam, wasmIndex(p, 1))));
      }
      cumulative += span;
    }
    // Fallback: evaluate first edge at param
    return vec3At(bk.evaluateEdgeCurve(wasmIndex(edgeIds, 0), param));
  }
  return vec3At(bk.evaluateEdgeCurve(unwrap(shape, 'edge'), param));
}

export function curveIsClosed(bk: BrepkitKernel, shape: KernelShape): boolean {
  const h = shape as BrepkitHandle;
  if (h.type === 'wire') {
    const edgeIds: number[] = toArray(bk.getWireEdges(h.id));
    if (edgeIds.length === 0) return false;

    // For a single-edge wire, check if edge start == edge end
    if (edgeIds.length === 1) {
      const verts = bk.getEdgeVertices(wasmIndex(edgeIds, 0));
      return edgeIsClosed(verts);
    }

    // For multi-edge wires, collect all endpoints and check each has a partner
    const endpoints: Array<[number, number, number]> = [];
    for (const eid of edgeIds) {
      const verts = bk.getEdgeVertices(eid);
      endpoints.push(vec3At(verts, 0));
      endpoints.push(vec3At(verts, 3));
    }
    // Each vertex should appear exactly twice in a closed wire
    const unmatched: Array<[number, number, number]> = [];
    for (const pt of endpoints) {
      const matchIdx = unmatched.findIndex(
        (u) => dist3(u[0], u[1], u[2], pt[0], pt[1], pt[2]) < 1e-7
      );
      if (matchIdx >= 0) {
        unmatched.splice(matchIdx, 1);
      } else {
        unmatched.push(pt);
      }
    }
    return unmatched.length === 0;
  }
  // Check if edge start == end vertex
  return edgeIsClosed(bk.getEdgeVertices(unwrap(shape, 'edge')));
}

function edgeIsClosed(verts: ArrayLike<number>): boolean {
  return (
    dist3(
      wasmIndex(verts, 0),
      wasmIndex(verts, 1),
      wasmIndex(verts, 2),
      wasmIndex(verts, 3),
      wasmIndex(verts, 4),
      wasmIndex(verts, 5)
    ) < 1e-7
  );
}

export function curveIsPeriodic(bk: BrepkitKernel, shape: KernelShape): boolean {
  const h = shape as BrepkitHandle;
  try {
    if (h.type === 'edge') return curveIsClosed(bk, shape);
    if (h.type === 'wire') {
      const edgeIds: number[] = toArray(bk.getWireEdges(h.id));
      // Single-edge closed wire -> periodic (e.g., circle)
      if (edgeIds.length === 1) return curveIsClosed(bk, shape);
    }
  } catch {
    // not an edge/wire
  }
  return false;
}

export function curvePeriod(bk: BrepkitKernel, shape: KernelShape): number {
  try {
    if (curveIsPeriodic(bk, shape)) {
      const bounds = curveParameters(bk, shape);
      return bounds[1] - bounds[0];
    }
  } catch {
    // not an edge/wire
  }
  return 0;
}

export function curveType(bk: BrepkitKernel, shape: KernelShape): string {
  const h = shape as BrepkitHandle;
  // For wires, return the curve type of the first edge
  if (h.type === 'wire') {
    const edges = iterShapes(bk, shape, 'edge');
    const first = edges[0];
    if (first) return bk.getEdgeCurveType(unwrap(first, 'edge'));
    return 'LINE';
  }
  return bk.getEdgeCurveType(unwrap(shape, 'edge'));
}

// ═══════════════════════════════════════════════════════════════════════
// NURBS curve operations
// ═══════════════════════════════════════════════════════════════════════

export function curveDegreeElevate(
  bk: BrepkitKernel,
  edge: KernelShape,
  elevateBy: number
): KernelShape {
  const edgeId = unwrap(edge, 'edge');
  return edgeHandle(bk.curveDegreeElevate(edgeId, elevateBy));
}

export function curveKnotInsert(
  bk: BrepkitKernel,
  edge: KernelShape,
  knot: number,
  times: number
): KernelShape {
  const edgeId = unwrap(edge, 'edge');
  return edgeHandle(bk.curveKnotInsert(edgeId, knot, times));
}

export function curveKnotRemove(
  bk: BrepkitKernel,
  edge: KernelShape,
  knot: number,
  tolerance: number
): KernelShape {
  const edgeId = unwrap(edge, 'edge');
  return edgeHandle(bk.curveKnotRemove(edgeId, knot, tolerance));
}

export function curveSplit(
  bk: BrepkitKernel,
  edge: KernelShape,
  param: number
): [KernelShape, KernelShape] {
  const edgeId = unwrap(edge, 'edge');
  const result = bk.curveSplit(edgeId, param);
  return [edgeHandle(wasmIndex(result, 0)), edgeHandle(wasmIndex(result, 1))];
}

// ═══════════════════════════════════════════════════════════════════════
// Surface NURBS
// ═══════════════════════════════════════════════════════════════════════

export function approximateSurfaceLspia(
  bk: BrepkitKernel,
  coords: number[],
  rows: number,
  cols: number,
  degreeU: number,
  degreeV: number,
  numCpsU: number,
  numCpsV: number,
  tolerance: number,
  maxIterations: number
): KernelShape {
  return faceHandle(
    bk.approximateSurfaceLspia(
      coords,
      rows,
      cols,
      degreeU,
      degreeV,
      numCpsU,
      numCpsV,
      tolerance,
      maxIterations
    )
  );
}

export function untrimFace(
  bk: BrepkitKernel,
  face: KernelShape,
  samplesPerCurve: number,
  interiorSamples: number
): KernelShape {
  const faceId = unwrap(face, 'face');
  return faceHandle(bk.untrimFace(faceId, samplesPerCurve, interiorSamples));
}

// ═══════════════════════════════════════════════════════════════════════
// Curve adaptor & Bezier extraction
// ═══════════════════════════════════════════════════════════════════════

export function createCurveAdaptor(_bk: BrepkitKernel, shape: KernelShape): KernelType {
  // Return the edge handle itself -- it can be used with curveTangent/curvePointAtParam
  return shape;
}

export function getBezierPenultimatePole(
  bk: BrepkitKernel,
  edge: KernelShape
): [number, number, number] | null {
  const nurbsData = extractNurbsFromEdge(bk, edge);
  if (!nurbsData || nurbsData.controlPoints.length < 6) return null;
  // Penultimate = second-to-last control point
  return vec3At(nurbsData.controlPoints, nurbsData.controlPoints.length - 6);
}

// ═══════════════════════════════════════════════════════════════════════
// Surface geometry extraction
// ═══════════════════════════════════════════════════════════════════════

export function getSurfaceCylinderData(
  bk: BrepkitKernel,
  surface: KernelType
): { radius: number; isDirect: boolean } | null {
  if (isBrepkitHandle(surface) && surface.type === 'face') {
    const faceId = surface.id;
    const params = JSON.parse(bk.getAnalyticSurfaceParams(faceId));
    if (params.type === 'cylinder') {
      return { radius: params.radius, isDirect: true };
    }
  }
  return null;
}

export function getSurfaceAxis(
  bk: BrepkitKernel,
  face: KernelShape
): { origin: [number, number, number]; direction: [number, number, number] } | null {
  const params = JSON.parse(bk.getAnalyticSurfaceParams(unwrap(face, 'face')));
  // Cylinder params expose origin+axis; cone params expose apex+axis (the apex
  // is a point on the axis). Torus params carry only a center, no axis vector,
  // so a toroidal axis is not recoverable here.
  // params is `any` from JSON.parse; cylinder exposes origin, cone exposes apex.

  const point =
    params.type === 'cylinder' ? params.origin : params.type === 'cone' ? params.apex : null;
  if (!point || !params.axis) return null;
  const [ox, oy, oz] = point as [number, number, number];
  const [ax, ay, az] = params.axis as [number, number, number];
  const len = Math.hypot(ax, ay, az);
  if (len < 1e-12) return null;
  return {
    origin: [ox, oy, oz],
    direction: [ax / len, ay / len, az / len],
  };
}

export function reverseSurfaceU(_bk: BrepkitKernel, surface: KernelType): KernelType {
  return surface; // No-op: brepkit doesn't have separate surface handle direction
}

// ═══════════════════════════════════════════════════════════════════════
// Classification
// ═══════════════════════════════════════════════════════════════════════

export function classifyPointOnFace(
  bk: BrepkitKernel,
  face: KernelShape,
  u: number,
  v: number,
  tolerance?: number
): 'in' | 'on' | 'out' {
  if (tolerance !== undefined) {
    warnOnce(
      'classify-tolerance',
      'classifyPointOnFace() tolerance parameter is not supported; brepkit uses domain-based classification.'
    );
  }
  const faceId = unwrap(face, 'face');
  const domain = bk.getSurfaceDomain(faceId);
  // domain = [uMin, uMax, vMin, vMax]
  if (
    u < wasmIndex(domain, 0) ||
    u > wasmIndex(domain, 1) ||
    v < wasmIndex(domain, 2) ||
    v > wasmIndex(domain, 3)
  ) {
    return 'out';
  }
  return 'in';
}

export function classifyPointRobust(
  bk: BrepkitKernel,
  shape: KernelShape,
  point: [number, number, number],
  tolerance: number
): string {
  const solidId = unwrapSolidOrThrow(shape, 'classifyPointRobust');
  return bk.classifyPointRobust(solidId, point[0], point[1], point[2], tolerance);
}

export function classifyPointWinding(
  bk: BrepkitKernel,
  shape: KernelShape,
  point: [number, number, number],
  tolerance: number
): string {
  const solidId = unwrapSolidOrThrow(shape, 'classifyPointWinding');
  return bk.classifyPointWinding(solidId, point[0], point[1], point[2], tolerance);
}

// ═══════════════════════════════════════════════════════════════════════
// Feature detection
// ═══════════════════════════════════════════════════════════════════════

export function detectSmallFeatures(
  bk: BrepkitKernel,
  shape: KernelShape,
  areaThreshold: number,
  tolerance: number
): KernelShape[] {
  const solidId = unwrapSolidOrThrow(shape, 'detectSmallFeatures');
  return Array.from(bk.detectSmallFeatures(solidId, areaThreshold, tolerance)).map((id) =>
    faceHandle(id)
  );
}

export function recognizeFeatures(
  bk: BrepkitKernel,
  shape: KernelShape,
  tolerance: number
): string {
  const solidId = unwrapSolidOrThrow(shape, 'recognizeFeatures');
  return bk.recognizeFeatures(solidId, tolerance);
}

// ═══════════════════════════════════════════════════════════════════════
// Projection
// ═══════════════════════════════════════════════════════════════════════

export function projectEdges(
  bk: BrepkitKernel,
  shape: KernelShape,
  _cameraOrigin: [number, number, number],
  _cameraDirection: [number, number, number],
  _cameraXAxis?: [number, number, number]
): {
  visible: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
  hidden: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
} {
  // Simplified: return all edges as visible outlines, no hidden line removal
  const edges = iterShapes(bk, shape, 'edge');
  const emptyCompound = edges.length > 0 ? edges[0] : shape;
  return {
    visible: { outline: emptyCompound, smooth: emptyCompound, sharp: emptyCompound },
    hidden: { outline: emptyCompound, smooth: emptyCompound, sharp: emptyCompound },
  };
}

/**
 * Read-only canonical NURBS data for the curve underlying an edge.
 *
 * Analytic curves (line, circle, ellipse) are converted to their exact NURBS
 * form by the kernel; interpolated/approximated B-spline edges return their
 * native poles and knots. The kernel emits a compressed knot representation
 * (distinct knots + multiplicities), which maps directly to the brepjs
 * {@link NurbsCurveData} shape.
 */
export function getNurbsCurveData(bk: BrepkitKernel, edge: KernelShape): NurbsCurveData | null {
  const edgeId = unwrap(edge, 'edge');
  const json = bk.getNurbsCurveData(edgeId);
  if (!json) return null;
  const data = JSON.parse(json) as {
    degree: number;
    controlPoints: Array<[number, number, number]>;
    weights: number[];
    distinctKnots: number[];
    multiplicities: number[];
    periodic: boolean;
    rational: boolean;
  };
  return {
    degree: data.degree,
    poles: data.controlPoints,
    weights: data.weights,
    knots: data.distinctKnots,
    multiplicities: data.multiplicities,
    isPeriodic: data.periodic,
    isRational: data.rational,
  };
}

/**
 * Read-only B-Spline/NURBS surface data for a face.
 *
 * Type-gated: analytic faces (plane, cylinder, cone, sphere, torus) return
 * `null`; only intrinsically free-form faces yield a record. The kernel emits
 * distinct knots paired with multiplicities, matching {@link NurbsSurfaceData}.
 */
export function getNurbsSurfaceData(bk: BrepkitKernel, face: KernelShape): NurbsSurfaceData | null {
  const data = JSON.parse(
    bk.getNurbsSurfaceDataParity(unwrap(face, 'face'))
  ) as NurbsSurfaceData | null;
  return data;
}

/** Co-located factory: returns the geometry-query slice of {@link KernelAdapter} bound to `bk`. */
// brepjs-patterns-disable: max-function-lines
export function makeGeometryOps(bk: BrepkitKernel) {
  return {
    vertexPosition: (vertex) => vertexPosition(bk, vertex),
    surfaceType: (face) => surfaceType(bk, face),
    uvBounds: (face) => uvBounds(bk, face),
    outerWire: (face) => outerWire(bk, face),
    surfaceNormal: (face, u, v) => surfaceNormal(bk, face, u, v),
    pointOnSurface: (face, u, v) => pointOnSurface(bk, face, u, v),
    uvFromPoint: (face, point) => uvFromPoint(bk, face, point),
    projectPointOnFace: (face, point) => projectPointOnFace(bk, face, point),
    curveTangent: (shape, param) => curveTangent(bk, shape, param),
    curveParameters: (shape) => curveParameters(bk, shape),
    curvePointAtParam: (shape, param) => curvePointAtParam(bk, shape, param),
    curveIsClosed: (shape) => curveIsClosed(bk, shape),
    curveIsPeriodic: (shape) => curveIsPeriodic(bk, shape),
    curvePeriod: (shape) => curvePeriod(bk, shape),
    curveType: (shape) => curveType(bk, shape),
    curveDegreeElevate: (edge, elevateBy) => curveDegreeElevate(bk, edge, elevateBy),
    curveKnotInsert: (edge, knot, times) => curveKnotInsert(bk, edge, knot, times),
    curveKnotRemove: (edge, knot, tolerance) => curveKnotRemove(bk, edge, knot, tolerance),
    curveSplit: (edge, param) => curveSplit(bk, edge, param),
    approximateSurfaceLspia: (coords, rows, cols, degU, degV, cpsU, cpsV, tol, maxIter) =>
      approximateSurfaceLspia(bk, coords, rows, cols, degU, degV, cpsU, cpsV, tol, maxIter),
    untrimFace: (face, samplesPerCurve, interiorSamples) =>
      untrimFace(bk, face, samplesPerCurve, interiorSamples),
    createCurveAdaptor: (shape) => createCurveAdaptor(bk, shape),
    getBezierPenultimatePole: (edge) => getBezierPenultimatePole(bk, edge),
    getSurfaceCylinderData: (surface) => getSurfaceCylinderData(bk, surface),
    getSurfaceAxis: (face) => getSurfaceAxis(bk, face),
    reverseSurfaceU: (surface) => reverseSurfaceU(bk, surface),
    classifyPointOnFace: (face, u, v, tolerance) => classifyPointOnFace(bk, face, u, v, tolerance),
    classifyPointRobust: (shape, point, tolerance) =>
      classifyPointRobust(bk, shape, point, tolerance),
    classifyPointWinding: (shape, point, tolerance) =>
      classifyPointWinding(bk, shape, point, tolerance),
    detectSmallFeatures: (shape, areaThreshold, tolerance) =>
      detectSmallFeatures(bk, shape, areaThreshold, tolerance),
    recognizeFeatures: (shape, tolerance) => recognizeFeatures(bk, shape, tolerance),
    projectEdges: (shape, cameraOrigin, cameraDirection, cameraXAxis) =>
      projectEdges(bk, shape, cameraOrigin, cameraDirection, cameraXAxis),
    getNurbsCurveData: (edge) => getNurbsCurveData(bk, edge),
    getNurbsSurfaceData: (face) => getNurbsSurfaceData(bk, face),
  } satisfies Pick<
    KernelAdapter,
    | 'vertexPosition'
    | 'surfaceType'
    | 'uvBounds'
    | 'outerWire'
    | 'surfaceNormal'
    | 'pointOnSurface'
    | 'uvFromPoint'
    | 'projectPointOnFace'
    | 'curveTangent'
    | 'curveParameters'
    | 'curvePointAtParam'
    | 'curveIsClosed'
    | 'curveIsPeriodic'
    | 'curvePeriod'
    | 'curveType'
    | 'curveDegreeElevate'
    | 'curveKnotInsert'
    | 'curveKnotRemove'
    | 'curveSplit'
    | 'approximateSurfaceLspia'
    | 'untrimFace'
    | 'createCurveAdaptor'
    | 'getBezierPenultimatePole'
    | 'getSurfaceCylinderData'
    | 'getSurfaceAxis'
    | 'reverseSurfaceU'
    | 'classifyPointOnFace'
    | 'classifyPointRobust'
    | 'classifyPointWinding'
    | 'detectSmallFeatures'
    | 'recognizeFeatures'
    | 'projectEdges'
    | 'getNurbsCurveData'
    | 'getNurbsSurfaceData'
  >;
}
