/* eslint-disable @typescript-eslint/no-non-null-assertion -- WASM arrays have known-valid indices */
/**
 * Measurement operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from '../brepkitWasmTypes.js';
import type { KernelShape, DistanceResult } from '../types.js';
import { type BrepkitHandle, unwrap, DEFAULT_DEFLECTION } from './helpers.js';
import { iterShapes } from './topologyOps.js';
import { vertexPosition, uvBounds, pointOnSurface } from './geometryOps.js';

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

export function centerOfMass(bk: BrepkitKernel, shape: KernelShape): [number, number, number] {
  const h = shape as BrepkitHandle;
  if (h.type === 'solid') {
    const result: number[] = bk.centerOfMass(unwrap(shape), DEFAULT_DEFLECTION);
    return [result[0]!, result[1]!, result[2]!];
  }
  if (h.type === 'face') {
    // Evaluate surface at the center of the UV domain
    const domain = uvBounds(bk, shape);
    const uMid = (domain.uMin + domain.uMax) / 2;
    const vMid = (domain.vMin + domain.vMax) / 2;
    return pointOnSurface(bk, shape, uMid, vMid);
  }
  if (h.type === 'edge') {
    // Use midpoint of edge vertices
    const verts: number[] = bk.getEdgeVertices(h.id);
    return [(verts[0]! + verts[3]!) / 2, (verts[1]! + verts[4]!) / 2, (verts[2]! + verts[5]!) / 2];
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
    const verts: number[] = bk.getEdgeVertices(h.id);
    return [(verts[0]! + verts[3]!) / 2, (verts[1]! + verts[4]!) / 2, (verts[2]! + verts[5]!) / 2];
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
    const bb: number[] = bk.boundingBox(unwrap(shape));
    return {
      min: [bb[0]!, bb[1]!, bb[2]!],
      max: [bb[3]!, bb[4]!, bb[5]!],
    };
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
    const d = bk.solidToSolidDistance(h1.id, h2.id);
    return { value: d, point1: [0, 0, 0], point2: [0, 0, 0] };
  }

  // Point to solid
  if (h1.type === 'vertex' && h2.type === 'solid') {
    const pos = bk.getVertexPosition(h1.id);
    const result: number[] = bk.pointToSolidDistance(pos[0]!, pos[1]!, pos[2]!, h2.id);
    return {
      value: result[0]!,
      point1: [pos[0]!, pos[1]!, pos[2]!],
      point2: [result[1]!, result[2]!, result[3]!],
    };
  }

  // Point-to-face distance
  if (h1.type === 'vertex' && h2.type === 'face') {
    const pos = bk.getVertexPosition(h1.id);
    const result: number[] = bk.pointToFaceDistance(pos[0]!, pos[1]!, pos[2]!, h2.id);
    return {
      value: result[0]!,
      point1: [pos[0]!, pos[1]!, pos[2]!],
      point2: [result[1]!, result[2]!, result[3]!],
    };
  }

  // Point-to-edge distance
  if (h1.type === 'vertex' && h2.type === 'edge') {
    const pos = bk.getVertexPosition(h1.id);
    const result: number[] = bk.pointToEdgeDistance(pos[0]!, pos[1]!, pos[2]!, h2.id);
    return {
      value: result[0]!,
      point1: [pos[0]!, pos[1]!, pos[2]!],
      point2: [result[1]!, result[2]!, result[3]!],
    };
  }

  // Fallback: use vertex positions for unsupported pairs
  const getPos = (s: BrepkitHandle): [number, number, number] => {
    if (s.type === 'vertex') {
      const p = bk.getVertexPosition(s.id);
      return [p[0]!, p[1]!, p[2]!];
    }
    // Use bounding box center as approximation
    if (s.type === 'solid') {
      const bb: number[] = bk.boundingBox(s.id);
      return [(bb[0]! + bb[3]!) / 2, (bb[1]! + bb[4]!) / 2, (bb[2]! + bb[5]!) / 2];
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
  const k1 = data[0]!;
  const k2 = data[1]!;
  const gaussian = k1 * k2;
  const mean = (k1 + k2) / 2;
  return {
    gaussian,
    mean,
    max: Math.max(k1, k2),
    min: Math.min(k1, k2),
    maxDirection: [data[2]!, data[3]!, data[4]!],
    minDirection: [data[5]!, data[6]!, data[7]!],
  };
}

export function surfaceCenterOfMass(
  bk: BrepkitKernel,
  face: KernelShape
): [number, number, number] {
  // Area-weighted centroid via tessellation
  const mesh = bk.tessellateFace(unwrap(face, 'face'), 0.1);
  const pos: number[] = mesh.positions;
  const idx: number[] = mesh.indices;
  let cx = 0,
    cy = 0,
    cz = 0,
    totalArea = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const i0 = idx[t]! * 3,
      i1 = idx[t + 1]! * 3,
      i2 = idx[t + 2]! * 3;
    const tcx = (pos[i0]! + pos[i1]! + pos[i2]!) / 3;
    const tcy = (pos[i0 + 1]! + pos[i1 + 1]! + pos[i2 + 1]!) / 3;
    const tcz = (pos[i0 + 2]! + pos[i1 + 2]! + pos[i2 + 2]!) / 3;
    const ux = pos[i1]! - pos[i0]!,
      uy = pos[i1 + 1]! - pos[i0 + 1]!,
      uz = pos[i1 + 2]! - pos[i0 + 2]!;
    const vx = pos[i2]! - pos[i0]!,
      vy = pos[i2 + 1]! - pos[i0 + 1]!,
      vz = pos[i2 + 2]! - pos[i0 + 2]!;
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
