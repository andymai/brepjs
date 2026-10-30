/**
 * Measurement operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { KernelShape, DistanceResult, ShapeType } from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import type { BulkMeasurement } from '@/kernel/interfaces/measureOps.js';
import { UnsupportedKernelOperationError } from '@/kernel/unsupported.js';
import {
  type BrepkitHandle,
  unwrap,
  toArray,
  edgeHandle,
  faceHandle,
  solidHandle,
  compoundSolidIds,
  syntheticCompounds,
  edgeBoxPoints,
  DEFAULT_DEFLECTION,
} from './helpers.js';
import { iterShapes } from './topologyOps.js';
import { vertexPosition, uvBounds, pointOnSurface } from './geometryOps.js';
import { vec3At, wasmIndex } from '@/utils/vec3.js';

export function volume(bk: BrepkitKernel, shape: KernelShape): number {
  const h = shape as BrepkitHandle;
  if (h.type === 'solid') {
    return bk.volume(unwrap(shape), DEFAULT_DEFLECTION);
  }
  if (h.type === 'compound') {
    const solids = iterShapes(bk, shape, 'solid');
    let total = 0;
    for (const s of solids) {
      total += bk.volume(unwrap(s), DEFAULT_DEFLECTION);
    }
    return total;
  }
  return 0;
}

export function area(bk: BrepkitKernel, shape: KernelShape): number {
  const h = shape as BrepkitHandle;
  if (h.type === 'face') {
    return bk.faceArea(unwrap(shape), DEFAULT_DEFLECTION);
  }
  if (h.type === 'solid') {
    return bk.surfaceArea(unwrap(shape), DEFAULT_DEFLECTION);
  }
  if (h.type === 'compound') {
    // Sum areas of all faces in the compound
    const faces = iterShapes(bk, shape, 'face');
    let total = 0;
    for (const face of faces) {
      total += bk.faceArea(unwrap(face), DEFAULT_DEFLECTION);
    }
    return total;
  }
  return 0;
}

export function length(bk: BrepkitKernel, shape: KernelShape): number {
  const h = shape as BrepkitHandle;
  if (h.type === 'edge') {
    return bk.edgeLength(unwrap(shape));
  }
  // For faces, return perimeter
  if (h.type === 'face') {
    return bk.facePerimeter(unwrap(shape));
  }
  if (h.type === 'wire') {
    return bk.wireLength(h.id);
  }
  throw new Error('brepkit: length() requires an edge, wire, or face');
}

function edgeMidpoint(bk: BrepkitKernel, edgeId: number): [number, number, number] {
  const v = bk.getEdgeVertices(edgeId);
  return [
    (wasmIndex(v, 0) + wasmIndex(v, 3)) / 2,
    (wasmIndex(v, 1) + wasmIndex(v, 4)) / 2,
    (wasmIndex(v, 2) + wasmIndex(v, 5)) / 2,
  ];
}

export function centerOfMass(bk: BrepkitKernel, shape: KernelShape): [number, number, number] {
  const h = shape as BrepkitHandle;
  if (h.type === 'solid') {
    return vec3At(bk.centerOfMass(unwrap(shape), DEFAULT_DEFLECTION));
  }
  if (h.type === 'face') {
    // Evaluate surface at the center of the UV domain
    const domain = uvBounds(bk, shape);
    const uMid = (domain.uMin + domain.uMax) / 2;
    const vMid = (domain.vMin + domain.vMax) / 2;
    return pointOnSurface(bk, shape, uMid, vMid);
  }
  if (h.type === 'edge') {
    return edgeMidpoint(bk, h.id);
  }
  if (h.type === 'vertex') {
    return vertexPosition(bk, shape);
  }
  // Fallback for compounds, shells, wires: average vertex positions
  const vertices = iterShapes(bk, shape, 'vertex');
  if (vertices.length > 0) {
    let sx = 0,
      sy = 0,
      sz = 0;
    for (const v of vertices) {
      const p = vertexPosition(bk, v);
      sx += p[0];
      sy += p[1];
      sz += p[2];
    }
    return [sx / vertices.length, sy / vertices.length, sz / vertices.length];
  }
  return [0, 0, 0];
}

export function linearCenterOfMass(
  bk: BrepkitKernel,
  shape: KernelShape
): [number, number, number] {
  // Average of edge endpoints (approximation for straight edges)
  const h = shape as BrepkitHandle;
  if (h.type === 'edge') {
    return edgeMidpoint(bk, h.id);
  }
  // For wires/solids, fall back to volumetric CoM
  return centerOfMass(bk, shape);
}

export function boundingBox(
  bk: BrepkitKernel,
  shape: KernelShape
): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const points = boxPoints(bk, shape as BrepkitHandle);
  const [first] = points;
  if (!first) return { min: [0, 0, 0], max: [0, 0, 0] };
  const min: [number, number, number] = [...first];
  const max: [number, number, number] = [...first];
  for (const p of points) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(wasmIndex(min, k), wasmIndex(p, k));
      max[k] = Math.max(wasmIndex(max, k), wasmIndex(p, k));
    }
  }
  return { min, max };
}

type Point = [number, number, number];

/**
 * Points whose bounding box is the shape's: a solid's own box corners, a
 * face's or shell's face box points (see `faceBoxPoints`), and for anything
 * else the box points of its edges (see `edgeBoxPoints`), so an arc's bulge
 * counts and not just its end vertices.
 */
function boxPoints(bk: BrepkitKernel, h: BrepkitHandle): Point[] {
  switch (h.type) {
    case 'solid': {
      const bb = bk.boundingBox(h.id);
      return [vec3At(bb, 0), vec3At(bb, 3)];
    }
    case 'vertex':
      return [vec3At(bk.getVertexPosition(h.id))];
    case 'edge':
      return edgeBoxPoints(bk, h.id);
    case 'face':
      return faceBoxPoints(bk, h);
    case 'shell':
      return iterShapes(bk, h, 'face').flatMap((f) => faceBoxPoints(bk, f as BrepkitHandle));
    case 'compound': {
      const children = syntheticCompounds.get(h.id) ?? compoundSolidIds(bk, h.id).map(solidHandle);
      return children.flatMap((child) => boxPoints(bk, child));
    }
    default:
      return boundaryBoxPoints(bk, h);
  }
}

function boundaryBoxPoints(bk: BrepkitKernel, h: BrepkitHandle): Point[] {
  const edges = iterShapes(bk, h, 'edge');
  if (edges.length > 0) return edges.flatMap((e) => edgeBoxPoints(bk, unwrap(e)));
  return iterShapes(bk, h, 'vertex').map((v) => vertexPosition(bk, v));
}

/**
 * A face's extreme along an axis lies on its boundary or at a point inside it
 * where that coordinate peaks on the surface. Planes, cylinders, and cones have
 * no such interior peak (a straight line through any inner point runs to the
 * boundary), so their edges bound them. A sphere or torus adds the surface's
 * peak points that lie on the face, which bounds it exactly; any other surface
 * adds the vertices of its tessellation, which bound it to within the
 * deflection.
 */
function faceBoxPoints(bk: BrepkitKernel, face: BrepkitHandle): Point[] {
  const points = boundaryBoxPoints(bk, face);
  const surfaceType = bk.getSurfaceType(face.id);
  if (surfaceType === 'plane' || surfaceType === 'cylinder' || surfaceType === 'cone') {
    return points;
  }
  const peaks = surfacePeaks(bk, face.id);
  if (peaks) {
    const tolerance = ON_FACE_TOLERANCE * Math.max(1, peaks.size);
    const onFace = (p: Point): boolean =>
      wasmIndex(bk.pointToFaceDistance(p[0], p[1], p[2], face.id), 0) <= tolerance;
    return [...points, ...peaks.points.filter(onFace)];
  }
  const { positions } = bk.tessellateFace(face.id, MESH_BOX_DEFLECTION * (diagonal(points) || 1));
  const vertices: Point[] = [];
  for (let i = 0; i + 2 < positions.length; i += 3) vertices.push(vec3At(positions, i));
  return [...points, ...vertices];
}

const ON_FACE_TOLERANCE = 1e-7;
const MESH_BOX_DEFLECTION = 1e-3;
const TORUS_CIRCLE_SAMPLES = 64;
const AXES: readonly Point[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function diagonal(points: readonly Point[]): number {
  if (points.length === 0) return 0;
  const span = [0, 1, 2].map((k) => {
    const values = points.map((p) => wasmIndex(p, k));
    return Math.max(...values) - Math.min(...values);
  });
  return Math.hypot(...span);
}

const add = (a: Point, b: Point, s = 1): Point => [
  a[0] + s * b[0],
  a[1] + s * b[1],
  a[2] + s * b[2],
];
const dot = (a: Point, b: Point): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * The points where a coordinate peaks on a sphere or torus surface, with the
 * surface's size for the on-face tolerance; undefined for any other surface or
 * a torus whose frame does not read back as orthonormal.
 */
function surfacePeaks(
  bk: BrepkitKernel,
  faceId: number
): { points: Point[]; size: number } | undefined {
  let params: {
    type?: string;
    center?: Point;
    radius?: number;
    majorRadius?: number;
    minorRadius?: number;
  };
  try {
    params = JSON.parse(bk.getAnalyticSurfaceParams(faceId)) as typeof params;
  } catch {
    return undefined;
  }
  const c = params.center;
  if (c?.length !== 3) return undefined;
  if (params.type === 'sphere' && typeof params.radius === 'number') {
    const r = params.radius;
    return { points: AXES.flatMap((e) => [add(c, e, r), add(c, e, -r)]), size: r };
  }
  if (
    params.type === 'torus' &&
    typeof params.majorRadius === 'number' &&
    typeof params.minorRadius === 'number'
  ) {
    return torusPeaks(bk, faceId, c, params.majorRadius, params.minorRadius);
  }
  return undefined;
}

/**
 * brepkit's torus params carry no axis, so the frame is read off the surface,
 * which brepkit parametrizes as c + (R + r cos v)(cos u X + sin u Y) + r sin v Z.
 * Along a direction d with a component w across the axis, the coordinate peaks
 * at c ± (R w/|w| + r d). Along the axis it peaks on the whole circle at c ± r Z,
 * which is sampled.
 */
function torusPeaks(
  bk: BrepkitKernel,
  faceId: number,
  c: Point,
  majorR: number,
  minorR: number
): { points: Point[]; size: number } | undefined {
  const at = (u: number, v: number): Point => vec3At(bk.evaluateSurface(faceId, u, v));
  const x = add(at(0, 0), c, -1).map((n) => n / (majorR + minorR)) as Point;
  const z = add(add(at(0, Math.PI / 2), c, -1), x, -majorR).map((n) => n / minorR) as Point;
  const unit = (p: Point): boolean => Math.abs(Math.hypot(...p) - 1) < 1e-6;
  if (!unit(x) || !unit(z) || Math.abs(dot(x, z)) > 1e-6) return undefined;
  const y: Point = [
    z[1] * x[2] - z[2] * x[1],
    z[2] * x[0] - z[0] * x[2],
    z[0] * x[1] - z[1] * x[0],
  ];
  const points: Point[] = [];
  for (const d of AXES) {
    const across = add(d, z, -dot(d, z));
    const len = Math.hypot(...across);
    if (len > 1e-9) {
      const peak = add(across.map((n) => (n * majorR) / len) as Point, d, minorR);
      points.push(add(c, peak), add(c, peak, -1));
      continue;
    }
    for (const side of [1, -1]) {
      const rim = add(c, z, side * minorR);
      for (let i = 0; i < TORUS_CIRCLE_SAMPLES; i++) {
        const t = (2 * Math.PI * i) / TORUS_CIRCLE_SAMPLES;
        points.push(add(add(rim, x, majorR * Math.cos(t)), y, majorR * Math.sin(t)));
      }
    }
  }
  return { points, size: majorR + minorR };
}

/**
 * Minimum distance between two shapes. brepkit-wasm measures from a point to a
 * solid, face or edge, and between two solids; a wire, shell or compound is
 * measured through its edges, faces or children, taking the closest pair. Any
 * other pairing (face to face, edge to edge, face to solid, ...) has no exact
 * brepkit measure and throws {@link UnsupportedKernelOperationError}.
 */
export function distance(
  bk: BrepkitKernel,
  shape1: KernelShape,
  shape2: KernelShape
): DistanceResult {
  const parts1 = distanceParts(bk, shape1 as BrepkitHandle);
  const parts2 = distanceParts(bk, shape2 as BrepkitHandle);
  let best: DistanceResult | undefined;
  for (const a of parts1) {
    for (const b of parts2) {
      const d = partDistance(bk, a, b);
      if (best === undefined || d.value < best.value) best = d;
    }
  }
  if (best === undefined) throw new Error('brepkit: distance needs two non-empty shapes');
  return best;
}

/** The solids, faces, edges and vertices a shape is measured through. */
function distanceParts(bk: BrepkitKernel, h: BrepkitHandle): BrepkitHandle[] {
  switch (h.type) {
    case 'wire':
      return toArray(bk.getWireEdges(h.id)).map(edgeHandle);
    case 'shell':
      return toArray(bk.getShellFaces(h.id)).map(faceHandle);
    case 'compound': {
      const children = syntheticCompounds.get(h.id) ?? compoundSolidIds(bk, h.id).map(solidHandle);
      return children.flatMap((child) => distanceParts(bk, child));
    }
    default:
      return [h];
  }
}

function partDistance(bk: BrepkitKernel, a: BrepkitHandle, b: BrepkitHandle): DistanceResult {
  if (a.type === 'solid' && b.type === 'solid') {
    const buf = bk.solidToSolidDistance(a.id, b.id);
    return { value: wasmIndex(buf, 0), point1: vec3At(buf, 1), point2: vec3At(buf, 4) };
  }
  if (a.type === 'vertex') return pointDistance(bk, a, b);
  if (b.type === 'vertex') {
    const d = pointDistance(bk, b, a);
    return { value: d.value, point1: d.point2, point2: d.point1 };
  }
  throw new UnsupportedKernelOperationError(
    `brepkit: no distance between a ${a.type} and a ${b.type}; brepkit-wasm measures from a point to a solid, face or edge, and between two solids`
  );
}

function pointDistance(bk: BrepkitKernel, v: BrepkitHandle, to: BrepkitHandle): DistanceResult {
  const point1 = vec3At(bk.getVertexPosition(v.id));
  if (to.type === 'vertex') {
    const point2 = vec3At(bk.getVertexPosition(to.id));
    const value = Math.hypot(point2[0] - point1[0], point2[1] - point1[1], point2[2] - point1[2]);
    return { value, point1, point2 };
  }
  const [x, y, z] = point1;
  let result: Float64Array;
  if (to.type === 'solid') result = bk.pointToSolidDistance(x, y, z, to.id);
  else if (to.type === 'face') result = bk.pointToFaceDistance(x, y, z, to.id);
  else if (to.type === 'edge') result = bk.pointToEdgeDistance(x, y, z, to.id);
  else {
    throw new UnsupportedKernelOperationError(`brepkit: no distance from a vertex to a ${to.type}`);
  }
  return { value: wasmIndex(result, 0), point1, point2: vec3At(result, 1) };
}

export function surfaceCurvature(
  bk: BrepkitKernel,
  face: KernelShape,
  u: number,
  v: number
): {
  gaussian: number;
  mean: number;
  max: number;
  min: number;
  maxDirection: [number, number, number];
  minDirection: [number, number, number];
} {
  const fid = unwrap(face, 'face');
  // Native API: [k1, k2, d1x, d1y, d1z, d2x, d2y, d2z]
  const data: Float64Array = bk.measureCurvatureAtSurface(fid, u, v);
  if (data.length < 8) {
    throw new Error(
      `brepkit: measureCurvatureAtSurface returned ${data.length} values, expected 8`
    );
  }
  const k1 = wasmIndex(data, 0);
  const k2 = wasmIndex(data, 1);
  return {
    gaussian: k1 * k2,
    mean: (k1 + k2) / 2,
    max: Math.max(k1, k2),
    min: Math.min(k1, k2),
    maxDirection: vec3At(data, 2),
    minDirection: vec3At(data, 5),
  };
}

export function surfaceCenterOfMass(
  bk: BrepkitKernel,
  face: KernelShape
): [number, number, number] {
  // Area-weighted centroid via tessellation
  const mesh = bk.tessellateFace(unwrap(face, 'face'), 0.1);
  const pos = mesh.positions;
  const idx = mesh.indices;
  let cx = 0,
    cy = 0,
    cz = 0,
    totalArea = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const i0 = wasmIndex(idx, t) * 3;
    const i1 = wasmIndex(idx, t + 1) * 3;
    const i2 = wasmIndex(idx, t + 2) * 3;
    const p0x = wasmIndex(pos, i0);
    const p0y = wasmIndex(pos, i0 + 1);
    const p0z = wasmIndex(pos, i0 + 2);
    const p1x = wasmIndex(pos, i1);
    const p1y = wasmIndex(pos, i1 + 1);
    const p1z = wasmIndex(pos, i1 + 2);
    const p2x = wasmIndex(pos, i2);
    const p2y = wasmIndex(pos, i2 + 1);
    const p2z = wasmIndex(pos, i2 + 2);
    const tcx = (p0x + p1x + p2x) / 3;
    const tcy = (p0y + p1y + p2y) / 3;
    const tcz = (p0z + p1z + p2z) / 3;
    const ux = p1x - p0x,
      uy = p1y - p0y,
      uz = p1z - p0z;
    const vx = p2x - p0x,
      vy = p2y - p0y,
      vz = p2z - p0z;
    const faceArea =
      0.5 *
      Math.sqrt((uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2);
    cx += tcx * faceArea;
    cy += tcy * faceArea;
    cz += tcz * faceArea;
    totalArea += faceArea;
  }
  if (totalArea < 1e-30) return [0, 0, 0];
  return [cx / totalArea, cy / totalArea, cz / totalArea];
}

export function createDistanceQuery(
  bk: BrepkitKernel,
  referenceShape: KernelShape
): {
  distanceTo(shape: KernelShape): {
    value: number;
    point1: [number, number, number];
    point2: [number, number, number];
  };
  dispose(): void;
} {
  const distanceFn = (shape: KernelShape) => distance(bk, referenceShape, shape);
  return {
    distanceTo(shape: KernelShape) {
      return distanceFn(shape);
    },
    dispose() {
      // No-op: arena-based
    },
  };
}

/**
 * Compose bulk-measurement: brepkit `length()` throws for non-linear shapes,
 * so we guard to edge/wire/face before calling. OCCT's LinearProperties
 * returns edge-length sum even for solids — intentional divergence per
 * ADR-0006.
 */
export function measureBulk(
  bk: BrepkitKernel,
  shape: KernelShape,
  includeLinear = false
): BulkMeasurement {
  const h = shape as { type: ShapeType };
  const canMeasureLength = h.type === 'edge' || h.type === 'wire' || h.type === 'face';
  return {
    volume: volume(bk, shape),
    area: area(bk, shape),
    length: includeLinear && canMeasureLength ? length(bk, shape) : 0,
    centerOfMass: centerOfMass(bk, shape),
    boundingBox: boundingBox(bk, shape),
  };
}

/** Co-located factory: returns the measurement slice of {@link KernelAdapter} bound to `bk`. */
export function makeMeasureOps(bk: BrepkitKernel) {
  return {
    volume: (shape) => volume(bk, shape),
    area: (shape) => area(bk, shape),
    length: (shape) => length(bk, shape),
    centerOfMass: (shape) => centerOfMass(bk, shape),
    linearCenterOfMass: (shape) => linearCenterOfMass(bk, shape),
    boundingBox: (shape) => boundingBox(bk, shape),
    distance: (a, b) => distance(bk, a, b),
    surfaceCurvature: (face, u, v) => surfaceCurvature(bk, face, u, v),
    surfaceCenterOfMass: (face) => surfaceCenterOfMass(bk, face),
    createDistanceQuery: (referenceShape) => createDistanceQuery(bk, referenceShape),
    measureBulk: (shape, includeLinear) => measureBulk(bk, shape, includeLinear),
  } satisfies Pick<
    KernelAdapter,
    | 'volume'
    | 'area'
    | 'length'
    | 'centerOfMass'
    | 'linearCenterOfMass'
    | 'boundingBox'
    | 'distance'
    | 'surfaceCurvature'
    | 'surfaceCenterOfMass'
    | 'createDistanceQuery'
    | 'measureBulk'
  >;
}
