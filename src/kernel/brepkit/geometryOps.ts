/* eslint-disable @typescript-eslint/no-non-null-assertion -- WASM arrays have known-valid indices */
/**
 * Geometry query operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from '../brepkitWasmTypes.js';
import type { KernelShape, KernelType, SurfaceType } from '../types.js';
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

// ═══════════════════════════════════════════════════════════════════════
// Vertex geometry
// ═══════════════════════════════════════════════════════════════════════

export function vertexPosition(bk: BrepkitKernel, vertex: KernelShape): [number, number, number] {
  const pos = bk.getVertexPosition(unwrap(vertex, 'vertex'));
  return [pos[0]!, pos[1]!, pos[2]!];
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
  return { uMin: domain[0]!, uMax: domain[1]!, vMin: domain[2]!, vMax: domain[3]! };
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
  const n = bk.evaluateSurfaceNormal(unwrap(face, 'face'), u, v);
  return [n[0]!, n[1]!, n[2]!];
}

export function pointOnSurface(
  bk: BrepkitKernel,
  face: KernelShape,
  u: number,
  v: number
): [number, number, number] {
  const p = bk.evaluateSurface(unwrap(face, 'face'), u, v);
  return [p[0]!, p[1]!, p[2]!];
}

export function uvFromPoint(
  bk: BrepkitKernel,
  face: KernelShape,
  point: [number, number, number]
): [number, number] | null {
  try {
    const result = bk.projectPointOnSurface(unwrap(face, 'face'), point[0], point[1], point[2]);
    return [result[0]!, result[1]!];
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
  const result = bk.projectPointOnSurface(unwrap(face, 'face'), point[0], point[1], point[2]);
  return [result[2]!, result[3]!, result[4]!];
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
    edgeId = edgeIds[edgeIds.length - 1]!; // fallback to last edge
    let cumulative = 0;
    for (const eid of edgeIds) {
      const p = bk.getEdgeCurveParameters(eid);
      const span = p[1]! - p[0]!;
      if (param <= cumulative + span || eid === edgeId) {
        edgeId = eid;
        evalParam = Math.min(p[0]! + (param - cumulative), p[1]!);
        break;
      }
      cumulative += span;
    }
  } else {
    edgeId = unwrap(shape, 'edge');
  }

  const result = bk.evaluateEdgeCurveD1(edgeId, evalParam);
  return {
    point: [result[0]!, result[1]!, result[2]!],
    tangent: [result[3]!, result[4]!, result[5]!],
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
      total += p[1]! - p[0]!;
    }
    return [0, total];
  }
  const edgeId = unwrap(shape, 'edge');
  const params = bk.getEdgeCurveParameters(edgeId);
  return [params[0]!, params[1]!];
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
      const span = p[1]! - p[0]!;
      if (param <= cumulative + span || eid === edgeIds[edgeIds.length - 1]) {
        const localParam = p[0]! + (param - cumulative);
        const pt = bk.evaluateEdgeCurve(eid, Math.min(localParam, p[1]!));
        return [pt[0]!, pt[1]!, pt[2]!];
      }
      cumulative += span;
    }
    // Fallback: evaluate first edge at param
    const pt = bk.evaluateEdgeCurve(edgeIds[0]!, param);
    return [pt[0]!, pt[1]!, pt[2]!];
  }
  const edgeId = unwrap(shape, 'edge');
  const p = bk.evaluateEdgeCurve(edgeId, param);
  return [p[0]!, p[1]!, p[2]!];
}

export function curveIsClosed(bk: BrepkitKernel, shape: KernelShape): boolean {
  const h = shape as BrepkitHandle;
  if (h.type === 'wire') {
    const edgeIds: number[] = toArray(bk.getWireEdges(h.id));
    if (edgeIds.length === 0) return false;

    // For a single-edge wire, check if edge start == edge end
    if (edgeIds.length === 1) {
      const verts = bk.getEdgeVertices(edgeIds[0]!);
      return dist3(verts[0]!, verts[1]!, verts[2]!, verts[3]!, verts[4]!, verts[5]!) < 1e-7;
    }

    // For multi-edge wires, collect all endpoints and check each has a partner
    const endpoints: Array<[number, number, number]> = [];
    for (const eid of edgeIds) {
      const verts = bk.getEdgeVertices(eid);
      endpoints.push([verts[0]!, verts[1]!, verts[2]!]);
      endpoints.push([verts[3]!, verts[4]!, verts[5]!]);
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
  const verts = bk.getEdgeVertices(unwrap(shape, 'edge'));
  return dist3(verts[0]!, verts[1]!, verts[2]!, verts[3]!, verts[4]!, verts[5]!) < 1e-7;
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
  return [edgeHandle(result[0]!), edgeHandle(result[1]!)];
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
  const n = nurbsData.controlPoints.length;
  return [
    nurbsData.controlPoints[n - 6]!,
    nurbsData.controlPoints[n - 5]!,
    nurbsData.controlPoints[n - 4]!,
  ];
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
  if (u < domain[0]! || u > domain[1]! || v < domain[2]! || v > domain[3]!) {
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
