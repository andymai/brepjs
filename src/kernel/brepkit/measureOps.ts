/**
 * Measurement operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { KernelShape, DistanceResult, ShapeType } from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import type { BulkMeasurement } from '@/kernel/interfaces/measureOps.js';
import { type BrepkitHandle, unwrap, DEFAULT_DEFLECTION } from './helpers.js';
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
  const h = shape as BrepkitHandle;
  if (h.type === 'solid') {
    const bb = bk.boundingBox(unwrap(shape));
    return { min: vec3At(bb, 0), max: vec3At(bb, 3) };
  }
  if (h.type === 'vertex') {
    const pos = vertexPosition(bk, shape);
    return { min: [...pos], max: [...pos] };
  }
  // For faces, edges, wires, compounds, shells: compute from vertex positions
  const vertices = iterShapes(bk, shape, 'vertex');
  if (vertices.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  const first = vertexPosition(bk, vertices[0]);
  let minX = first[0],
    minY = first[1],
    minZ = first[2];
  let maxX = first[0],
    maxY = first[1],
    maxZ = first[2];
  for (let i = 1; i < vertices.length; i++) {
    const p = vertexPosition(bk, vertices[i]);
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
    if (p[2] < minZ) minZ = p[2];
    if (p[2] > maxZ) maxZ = p[2];
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

export function distance(
  bk: BrepkitKernel,
  shape1: KernelShape,
  shape2: KernelShape
): DistanceResult {
  const h1 = shape1 as BrepkitHandle;
  const h2 = shape2 as BrepkitHandle;

  if (h1.type === 'solid' && h2.type === 'solid') {
    const buf = bk.solidToSolidDistance(h1.id, h2.id);
    return {
      value: wasmIndex(buf, 0),
      point1: vec3At(buf, 1),
      point2: vec3At(buf, 4),
    };
  }

  // Point-to-{solid,face,edge}: same shape — fetch the vertex position then
  // call the appropriate native distance function on it.
  if (h1.type === 'vertex' && (h2.type === 'solid' || h2.type === 'face' || h2.type === 'edge')) {
    const point1 = vec3At(bk.getVertexPosition(h1.id));
    const result =
      h2.type === 'solid'
        ? bk.pointToSolidDistance(point1[0], point1[1], point1[2], h2.id)
        : h2.type === 'face'
          ? bk.pointToFaceDistance(point1[0], point1[1], point1[2], h2.id)
          : bk.pointToEdgeDistance(point1[0], point1[1], point1[2], h2.id);
    return {
      value: wasmIndex(result, 0),
      point1,
      point2: vec3At(result, 1),
    };
  }

  // Fallback: use vertex positions for unsupported pairs
  const getPos = (s: BrepkitHandle): [number, number, number] => {
    if (s.type === 'vertex') {
      return vec3At(bk.getVertexPosition(s.id));
    }
    // Use bounding box center as approximation
    if (s.type === 'solid') {
      const bb = bk.boundingBox(s.id);
      return [
        (wasmIndex(bb, 0) + wasmIndex(bb, 3)) / 2,
        (wasmIndex(bb, 1) + wasmIndex(bb, 4)) / 2,
        (wasmIndex(bb, 2) + wasmIndex(bb, 5)) / 2,
      ];
    }
    return [0, 0, 0];
  };
  const p1 = getPos(h1);
  const p2 = getPos(h2);
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dz = p2[2] - p1[2];
  return { value: Math.sqrt(dx * dx + dy * dy + dz * dz), point1: p1, point2: p2 };
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
