/**
 * Measurement operations for the manifold adapter.
 *
 * Manifold is a triangle-mesh kernel: it exposes exact `volume()` and
 * `surfaceArea()`, but has no B-rep notion of edges, faces, or surface
 * parametrization. Length, curvature, and witness-point distance are not
 * representable here; those queries are answered by the OCCT kernel via
 * op-graph replay at a higher layer. The methods below cover what the mesh
 * representation can answer directly. All measurements are read-only and
 * record no op-nodes.
 * @module
 */

import type { BulkMeasurement, KernelMeasureOps } from '@/kernel/interfaces/measureOps.js';
import type { DistanceResult, KernelShape } from '@/kernel/types.js';
import type { ManifoldModule } from './helpers.js';
import { notImplemented } from './helpers.js';
import {
  asManifoldShape,
  brepCache,
  resolveOcct,
  type ManifoldShape,
  unwrap,
} from './meshHandle.js';
import { replay } from './replay.js';

type Vec3 = [number, number, number];

interface ManifoldBox {
  readonly min: Vec3;
  readonly max: Vec3;
}

interface ManifoldMeshLike {
  readonly numProp: number;
  readonly vertProperties: Float32Array;
  readonly triVerts: Uint32Array;
}

function solidOf(shape: KernelShape): ReturnType<typeof unwrap> {
  return unwrap(shape as ManifoldShape);
}

/** World points recorded on a profile placeholder node (edge/wire/face/vertex). */
function profileWorldPoints(shape: KernelShape): Vec3[] | undefined {
  const node = (shape as { node?: { op?: string; params?: Record<string, unknown> } } | null)?.node;
  const p = node?.params;
  if (!p) return undefined;
  const pts = (p['pts'] as Vec3[] | undefined) ?? (p['ring'] as Vec3[] | undefined);
  if (pts && pts.length) return pts;
  const outline = p['outline'] as Array<readonly [number, number]> | undefined;
  if (outline && outline.length) {
    const o = (p['origin'] as Vec3 | undefined) ?? [0, 0, 0];
    const x = (p['xAxis'] as Vec3 | undefined) ?? [1, 0, 0];
    const y = (p['yAxis'] as Vec3 | undefined) ?? [0, 1, 0];
    return outline.map((q) => [
      o[0] + x[0] * q[0] + y[0] * q[1],
      o[1] + x[1] * q[0] + y[1] * q[1],
      o[2] + x[2] * q[0] + y[2] * q[1],
    ]);
  }
  return undefined;
}

function aabbOfPoints(pts: Vec3[]): ManifoldBox {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const q of pts) {
    for (let i = 0; i < 3; i++) {
      const v = q[i] ?? 0;
      if (v < (min[i] ?? Infinity)) min[i] = v;
      if (v > (max[i] ?? -Infinity)) max[i] = v;
    }
  }
  return { min, max };
}

function boxOf(shape: KernelShape): ManifoldBox {
  // Sub-shape witnesses (iterShapes) carry their precomputed OCCT AABB.
  const w = shape as { __manifoldSub?: boolean; box?: ManifoldBox } | null;
  if (w && w.__manifoldSub && w.box) return w.box;
  // Profile placeholders (edge/wire/face/vertex) have no manifold solid; derive
  // the AABB from the recorded outline/ring/pts.
  const pts = profileWorldPoints(shape);
  if (pts) return aabbOfPoints(pts);
  return solidOf(shape).boundingBox() as ManifoldBox;
}

function meshOf(shape: KernelShape): ManifoldMeshLike | undefined {
  const solid = solidOf(shape) as { getMesh?: () => ManifoldMeshLike } | undefined;
  return solid?.getMesh?.();
}

function vertexAt(mesh: ManifoldMeshLike, i: number): Vec3 {
  const base = i * mesh.numProp;
  return [
    mesh.vertProperties[base] ?? 0,
    mesh.vertProperties[base + 1] ?? 0,
    mesh.vertProperties[base + 2] ?? 0,
  ];
}

function triangleAt(mesh: ManifoldMeshLike, t: number): [number, number, number] {
  const base = t * 3;
  return [mesh.triVerts[base] ?? 0, mesh.triVerts[base + 1] ?? 0, mesh.triVerts[base + 2] ?? 0];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function aabbCenter(shape: KernelShape): Vec3 {
  const bb = boxOf(shape);
  return [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];
}

function vertexAverage(mesh: ManifoldMeshLike): Vec3 {
  const count = Math.floor(mesh.vertProperties.length / mesh.numProp);
  if (count === 0) return [0, 0, 0];
  const sum: Vec3 = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    const v = vertexAt(mesh, i);
    sum[0] += v[0];
    sum[1] += v[1];
    sum[2] += v[2];
  }
  return [sum[0] / count, sum[1] / count, sum[2] / count];
}

/**
 * True volume centroid via the divergence theorem: sum signed tetrahedra spanned
 * from the origin to each triangle, weighting each tet's centroid by its signed
 * volume. Manifold's boundingBox center is only correct for symmetric shapes — a
 * frustum or any asymmetric solid has its mass center pulled off the AABB midpoint.
 */
function volumeCentroid(shape: KernelShape): Vec3 {
  const mesh = meshOf(shape);
  if (!mesh) return aabbCenter(shape);
  const triCount = Math.floor(mesh.triVerts.length / 3);
  let totalVol = 0;
  const accum: Vec3 = [0, 0, 0];
  for (let t = 0; t < triCount; t++) {
    const [ia, ib, ic] = triangleAt(mesh, t);
    const a = vertexAt(mesh, ia);
    const b = vertexAt(mesh, ib);
    const c = vertexAt(mesh, ic);
    const tetVol = dot3(a, cross3(b, c)) / 6;
    totalVol += tetVol;
    accum[0] += ((a[0] + b[0] + c[0]) / 4) * tetVol;
    accum[1] += ((a[1] + b[1] + c[1]) / 4) * tetVol;
    accum[2] += ((a[2] + b[2] + c[2]) / 4) * tetVol;
  }
  if (Math.abs(totalVol) < 1e-12) return vertexAverage(mesh);
  return [accum[0] / totalVol, accum[1] / totalVol, accum[2] / totalVol];
}

/** Area-weighted average of triangle centroids — the true surface center of mass. */
function surfaceCentroid(shape: KernelShape): Vec3 {
  const mesh = meshOf(shape);
  if (!mesh) return aabbCenter(shape);
  const triCount = Math.floor(mesh.triVerts.length / 3);
  let totalArea = 0;
  const accum: Vec3 = [0, 0, 0];
  for (let t = 0; t < triCount; t++) {
    const [ia, ib, ic] = triangleAt(mesh, t);
    const a = vertexAt(mesh, ia);
    const b = vertexAt(mesh, ib);
    const c = vertexAt(mesh, ic);
    const e1: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = cross3(e1, e2);
    const area = Math.hypot(n[0], n[1], n[2]) / 2;
    totalArea += area;
    accum[0] += ((a[0] + b[0] + c[0]) / 3) * area;
    accum[1] += ((a[1] + b[1] + c[1]) / 3) * area;
    accum[2] += ((a[2] + b[2] + c[2]) / 3) * area;
  }
  if (totalArea < 1e-12) return vertexAverage(mesh);
  return [accum[0] / totalArea, accum[1] / totalArea, accum[2] / totalArea];
}

export function volume(shape: KernelShape): number {
  return solidOf(shape).volume() as number;
}

export function area(shape: KernelShape): number {
  // Native face witnesses (iterShapes) carry their own precomputed area.
  const w = shape as { __nativeFace?: boolean; area?: number } | null;
  if (w && w.__nativeFace && typeof w.area === 'number') return w.area;
  return solidOf(shape).surfaceArea() as number;
}

export function boundingBox(shape: KernelShape): { min: Vec3; max: Vec3 } {
  // Sub-shape witnesses (iterShapes) carry their precomputed OCCT box.
  const w = shape as { __manifoldSub?: boolean; box?: { min: Vec3; max: Vec3 } } | null;
  if (w && w.__manifoldSub && w.box) {
    return { min: [...w.box.min], max: [...w.box.max] };
  }
  const bb = boxOf(shape);
  return { min: [...bb.min], max: [...bb.max] };
}

export function centerOfMass(shape: KernelShape): Vec3 {
  return volumeCentroid(shape);
}

/**
 * Axis-aligned bounding-box distance: a coarse lower bound when the meshes are
 * separated, zero when their boxes overlap. Manifold has no exact shape-to-shape
 * distance; exact witness-point distance comes from OCCT replay.
 */
function aabbDistance(a: ManifoldBox, b: ManifoldBox): DistanceResult {
  const axis = (lo1: number, hi1: number, lo2: number, hi2: number): [number, number] => {
    if (hi1 < lo2) return [hi1, lo2];
    if (hi2 < lo1) return [lo1, hi2];
    const overlap = (Math.max(lo1, lo2) + Math.min(hi1, hi2)) / 2;
    return [overlap, overlap];
  };
  const [p1x, p2x] = axis(a.min[0], a.max[0], b.min[0], b.max[0]);
  const [p1y, p2y] = axis(a.min[1], a.max[1], b.min[1], b.max[1]);
  const [p1z, p2z] = axis(a.min[2], a.max[2], b.min[2], b.max[2]);
  const dx = p2x - p1x;
  const dy = p2y - p1y;
  const dz = p2z - p1z;
  return {
    value: Math.sqrt(dx * dx + dy * dy + dz * dz),
    point1: [p1x, p1y, p1z],
    point2: [p2x, p2y, p2z],
  };
}

export function distance(shape1: KernelShape, shape2: KernelShape): DistanceResult {
  return aabbDistance(boxOf(shape1), boxOf(shape2));
}

export function measureBulk(shape: KernelShape, _includeLinear = false): BulkMeasurement {
  return {
    volume: volume(shape),
    area: area(shape),
    length: 0,
    centerOfMass: centerOfMass(shape),
    boundingBox: boundingBox(shape),
  };
}

function surfaceCurvature(
  face: KernelShape,
  u: number,
  v: number
): ReturnType<KernelMeasureOps['surfaceCurvature']> {
  const occt = resolveOcct();
  if (!occt) {
    throw new Error(
      'manifold: surfaceCurvature requires a registered occt kernel; none is available'
    );
  }
  const ms = asManifoldShape(face);
  if (!ms) {
    return occt.surfaceCurvature(face, u, v);
  }
  if (!ms.node.replayable) {
    throw new Error(
      'manifold: surfaceCurvature unsupported; shape originates from a non-replayable op (raw mesh import or mesh boolean)'
    );
  }
  const brep =
    brepCache.get(ms.node) ??
    (() => {
      const b = replay(ms.node, occt);
      brepCache.set(ms.node, b);
      return b;
    })();
  return occt.surfaceCurvature(brep, u, v);
}

export function makeMeasureOps(_module: ManifoldModule): KernelMeasureOps {
  return {
    volume: (shape) => volume(shape),
    area: (shape) => area(shape),
    length: (shape) => {
      // Native edge witnesses carry their polyline arc length.
      const e = shape as { __nativeEdge?: boolean; length?: number } | null;
      if (e && e.__nativeEdge && typeof e.length === 'number') return e.length;
      return notImplemented('length');
    },
    centerOfMass: (shape) => centerOfMass(shape),
    linearCenterOfMass: (shape) => centerOfMass(shape),
    boundingBox: (shape) => boundingBox(shape),
    distance: (a, b) => distance(a, b),
    surfaceCurvature: (face, u, v) => surfaceCurvature(face, u, v),
    surfaceCenterOfMass: (shape) => surfaceCentroid(shape),
    measureBulk: (shape, includeLinear) => measureBulk(shape, includeLinear),
    createDistanceQuery: (referenceShape) => ({
      distanceTo: (shape) => distance(referenceShape, shape),
      dispose: () => {},
    }),
  };
}
