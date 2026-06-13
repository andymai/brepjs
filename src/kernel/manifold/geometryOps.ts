/**
 * Geometry queries for the manifold adapter.
 *
 * Two tiers. Cheap mesh-derivable queries (vertex position, face/point sampling
 * from the triangle mesh) answer directly from `getMesh()`. Exact NURBS and
 * topological-discriminant queries (curve/surface type, UV bounds, NURBS data,
 * point projection/classification) have no mesh representation; they lazily
 * replay the shape's op-graph onto the OCCT kernel and answer from the real
 * B-rep. The replayed OCCT shape is memoized per op-node so repeated queries on
 * the same shape replay once. When the op-node is non-replayable or no 'occt'
 * kernel is registered, these throw a clear unsupported error.
 * @module
 */

import type { KernelCurveOps } from '@/kernel/interfaces/curveOps.js';
import type { KernelSurfaceOps } from '@/kernel/interfaces/surfaceOps.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import type { KernelShape } from '@/kernel/types.js';
import type { ManifoldModule } from './helpers.js';
import { asManifoldShape, brepCache, occtOrThrow, resolveOcct, unwrap } from './meshHandle.js';
import { replay } from './replay.js';
import { isNativeFace } from './nativeFaces.js';
import { isNativeEdge, isNativeVertex, edgePointAt, edgeTangentAt } from './nativeEdges.js';
import {
  type CurveDesc,
  descType,
  descBounds,
  descPointAt,
  descTangent,
  descIsClosed,
  descIsPeriodic,
  descPeriod,
} from './curveDesc.js';

type Vec3 = [number, number, number];

interface RawMesh {
  readonly vertProperties: Float32Array;
  readonly triVerts: Uint32Array;
  readonly numProp?: number;
}

function meshOf(shape: KernelShape): RawMesh {
  return unwrap(shape).getMesh() as RawMesh;
}

function vertexAt(mesh: RawMesh, index: number): Vec3 {
  const stride = mesh.numProp && mesh.numProp >= 3 ? mesh.numProp : 3;
  const base = index * stride;
  return [
    mesh.vertProperties[base] ?? 0,
    mesh.vertProperties[base + 1] ?? 0,
    mesh.vertProperties[base + 2] ?? 0,
  ];
}

function viaOcct<T>(
  shape: KernelShape,
  query: (occtShape: KernelShape, occt: KernelAdapter) => T
): T {
  // Sub-shape witnesses (from iterShapes) carry their OCCT shape directly —
  // query it on OCCT so faceFinder/topology queries work on extrude/loft faces.
  const witness = shape as { __manifoldSub?: boolean; occt?: KernelShape } | null;
  if (witness && witness.__manifoldSub && witness.occt) {
    const occt = resolveOcct();
    if (!occt) {
      throw new Error('manifold: sub-shape geometry query requires a registered occt kernel');
    }
    return query(witness.occt, occt);
  }
  const ms = asManifoldShape(shape);
  if (!ms) {
    throw new Error('manifold: exact geometry query requires a manifold shape handle');
  }
  const occt = resolveOcct();
  if (!occt) {
    throw new Error(
      'manifold: exact geometry query unsupported on manifold kernel; no B-rep kernel registered'
    );
  }
  if (!ms.node.replayable) {
    throw new Error(
      'manifold: exact geometry query unsupported; shape originates from a non-replayable op (raw mesh import or mesh boolean)'
    );
  }
  let occtShape = brepCache.get(ms.node);
  if (occtShape === undefined) {
    occtShape = replay(ms.node, occt);
    brepCache.set(ms.node, occtShape);
  }
  return query(occtShape, occt);
}

/** The analytic curve descriptor of a standalone profile edge, if it has one. */
function descOf(shape: KernelShape): CurveDesc | undefined {
  const ms = asManifoldShape(shape);
  if (!ms) return undefined;
  const node = ms.node as { op?: string; params?: { curve?: CurveDesc } };
  return node.op === 'profileEdge' ? node.params?.curve : undefined;
}

// brepjs-patterns-disable: max-function-lines
export function makeGeometryOps(_module: ManifoldModule): KernelCurveOps & KernelSurfaceOps {
  return {
    // --- Curve queries: analytic for standalone profile edges (exact), native
    // for mesh-extracted edges, else replay onto OCCT ---
    curveType: (shape) => {
      const d = descOf(shape);
      if (d) return descType(d);
      return isNativeEdge(shape) ? shape.curveType : viaOcct(shape, (s, occt) => occt.curveType(s));
    },
    curveParameters: (shape) => {
      const d = descOf(shape);
      if (d) {
        const b = descBounds(d);
        return [b.first, b.last];
      }
      return isNativeEdge(shape)
        ? [0, shape.length]
        : viaOcct(shape, (s, occt) => occt.curveParameters(s));
    },
    curvePointAtParam: (shape, param) => {
      const d = descOf(shape);
      if (d) return descPointAt(d, param);
      return isNativeEdge(shape)
        ? edgePointAt(shape, param)
        : viaOcct(shape, (s, occt) => occt.curvePointAtParam(s, param));
    },
    curveTangent: (shape, param) => {
      const d = descOf(shape);
      if (d) return { point: descPointAt(d, param), tangent: descTangent(d, param) };
      return isNativeEdge(shape)
        ? { point: edgePointAt(shape, param), tangent: edgeTangentAt(shape, param) }
        : viaOcct(shape, (s, occt) => occt.curveTangent(s, param));
    },
    curveIsClosed: (shape) => {
      const d = descOf(shape);
      return d ? descIsClosed(d) : viaOcct(shape, (s, occt) => occt.curveIsClosed(s));
    },
    curveIsPeriodic: (shape) => {
      const d = descOf(shape);
      return d ? descIsPeriodic(d) : viaOcct(shape, (s, occt) => occt.curveIsPeriodic(s));
    },
    curvePeriod: (shape) => {
      const d = descOf(shape);
      return d ? descPeriod(d) : viaOcct(shape, (s, occt) => occt.curvePeriod(s));
    },
    interpolatePoints: (points, options) =>
      occtOrThrow('interpolatePoints').interpolatePoints(points, options),
    approximatePoints: (points, options) =>
      occtOrThrow('approximatePoints').approximatePoints(points, options),
    curveDegreeElevate: (edge, elevateBy) =>
      viaOcct(edge, (s, occt) => occt.curveDegreeElevate(s, elevateBy)),
    curveKnotInsert: (edge, knot, times) =>
      viaOcct(edge, (s, occt) => occt.curveKnotInsert(s, knot, times)),
    curveKnotRemove: (edge, knot, tolerance) =>
      viaOcct(edge, (s, occt) => occt.curveKnotRemove(s, knot, tolerance)),
    curveSplit: (edge, param) => viaOcct(edge, (s, occt) => occt.curveSplit(s, param)),
    createCurveAdaptor: (shape) => viaOcct(shape, (s, occt) => occt.createCurveAdaptor(s)),
    getBezierPenultimatePole: (edge) =>
      viaOcct(edge, (s, occt) => occt.getBezierPenultimatePole(s)),
    getNurbsCurveData: (edge) => viaOcct(edge, (s, occt) => occt.getNurbsCurveData?.(s) ?? null),

    // --- Cheap mesh-derivable query ---
    vertexPosition: (vertex) => {
      if (isNativeVertex(vertex)) return vertex.point;
      if (!asManifoldShape(vertex)) {
        return viaOcct(vertex, (s, occt) => occt.vertexPosition(s));
      }
      return vertexAt(meshOf(vertex), 0);
    },

    // --- Exact surface queries: replay onto OCCT ---
    surfaceType: (face) => {
      // Native mesh faces (faceID groups) are planar; profile faces built by
      // profileOps are planar by construction. Answer 'plane' natively so
      // faceFinder.ofSurfaceType / isPlanarFace work without an OCCT replay.
      if (isNativeFace(face)) return 'plane';
      const ms = asManifoldShape(face);
      if (ms && (ms.node as { op?: string }).op === 'profileFace') return 'plane';
      return viaOcct(face, (s, occt) => occt.surfaceType(s));
    },
    // A native planar face has constant normal; uv is irrelevant. Return a unit
    // square so normalAt()'s midpoint sampling stays well-defined.
    uvBounds: (face) =>
      isNativeFace(face)
        ? { uMin: 0, uMax: 1, vMin: 0, vMax: 1 }
        : viaOcct(face, (s, occt) => occt.uvBounds(s)),
    outerWire: (face) => viaOcct(face, (s, occt) => occt.outerWire(s)),
    surfaceNormal: (face, u, v) =>
      isNativeFace(face) ? face.normal : viaOcct(face, (s, occt) => occt.surfaceNormal(s, u, v)),
    pointOnSurface: (face, u, v) => viaOcct(face, (s, occt) => occt.pointOnSurface(s, u, v)),
    uvFromPoint: (face, point) => viaOcct(face, (s, occt) => occt.uvFromPoint(s, point)),
    projectPointOnFace: (face, point) =>
      viaOcct(face, (s, occt) => occt.projectPointOnFace(s, point)),
    classifyPointOnFace: (face, u, v, tolerance) =>
      viaOcct(face, (s, occt) => occt.classifyPointOnFace(s, u, v, tolerance)),
    classifyPointRobust: (shape, point, tolerance) =>
      viaOcct(shape, (s, occt) => occt.classifyPointRobust(s, point, tolerance)),
    classifyPointWinding: (shape, point, tolerance) =>
      viaOcct(shape, (s, occt) => occt.classifyPointWinding(s, point, tolerance)),
    approximateSurfaceLspia: (
      coords,
      rows,
      cols,
      degreeU,
      degreeV,
      numCpsU,
      numCpsV,
      tolerance,
      maxIterations
    ) =>
      occtOrThrow('approximateSurfaceLspia').approximateSurfaceLspia(
        coords,
        rows,
        cols,
        degreeU,
        degreeV,
        numCpsU,
        numCpsV,
        tolerance,
        maxIterations
      ),
    untrimFace: (face, samplesPerCurve, interiorSamples) =>
      viaOcct(face, (s, occt) => occt.untrimFace(s, samplesPerCurve, interiorSamples)),
    getSurfaceCylinderData: (surface) =>
      viaOcct(surface, (s, occt) => occt.getSurfaceCylinderData(s)),
    getSurfaceAxis: (face) => viaOcct(face, (s, occt) => occt.getSurfaceAxis(s)),
    reverseSurfaceU: (surface) => occtOrThrow('reverseSurfaceU').reverseSurfaceU(surface),
    detectSmallFeatures: (shape, areaThreshold, tolerance) =>
      viaOcct(shape, (s, occt) => occt.detectSmallFeatures(s, areaThreshold, tolerance)),
    recognizeFeatures: (shape, tolerance) =>
      viaOcct(shape, (s, occt) => occt.recognizeFeatures(s, tolerance)),
    projectEdges: (shape, cameraOrigin, cameraDirection, cameraXAxis) =>
      viaOcct(shape, (s, occt) => occt.projectEdges(s, cameraOrigin, cameraDirection, cameraXAxis)),
    getNurbsSurfaceData: (face) =>
      viaOcct(face, (s, occt) => occt.getNurbsSurfaceData?.(s) ?? null),
  };
}
