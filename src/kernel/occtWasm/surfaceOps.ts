/**
 * Surface query operations for the occt-wasm adapter.
 *
 * @module
 */

import type { KernelShape, SurfaceType } from '@/kernel/types.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import { handle, unwrap } from './helpers.js';

export function vertexPosition(k: OcctKernelWasm, vertex: KernelShape): [number, number, number] {
  const vec = k.vertexPosition(unwrap(vertex));
  try {
    return [vec.get(0), vec.get(1), vec.get(2)];
  } finally {
    vec.delete();
  }
}

export function surfaceType(k: OcctKernelWasm, face: KernelShape): SurfaceType {
  return k.surfaceType(unwrap(face)).toLowerCase() as SurfaceType;
}

export function uvBounds(
  k: OcctKernelWasm,
  face: KernelShape
): { uMin: number; uMax: number; vMin: number; vMax: number } {
  const vec = k.uvBounds(unwrap(face));
  try {
    return { uMin: vec.get(0), uMax: vec.get(1), vMin: vec.get(2), vMax: vec.get(3) };
  } finally {
    vec.delete();
  }
}

export function outerWire(k: OcctKernelWasm, face: KernelShape): KernelShape {
  return handle('wire', k.outerWire(unwrap(face)));
}

export function surfaceNormal(
  k: OcctKernelWasm,
  face: KernelShape,
  u: number,
  v: number
): [number, number, number] {
  const vec = k.surfaceNormal(unwrap(face), u, v);
  try {
    return [vec.get(0), vec.get(1), vec.get(2)];
  } finally {
    vec.delete();
  }
}

export function pointOnSurface(
  k: OcctKernelWasm,
  face: KernelShape,
  u: number,
  v: number
): [number, number, number] {
  const vec = k.pointOnSurface(unwrap(face), u, v);
  try {
    return [vec.get(0), vec.get(1), vec.get(2)];
  } finally {
    vec.delete();
  }
}

type V3 = [number, number, number];
const subV = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const lenV = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const crossV = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * Derive a cylindrical face's axis (point on axis + unit direction) from the
 * primitives occt-wasm exposes — it has no analytic `gp_Cylinder` accessor.
 *
 * Two surface samples at the same height v give radial normals n1,n2 (lying in
 * the plane perpendicular to the axis), so `n1 x n2` is parallel to the axis.
 * The points satisfy `p1 - p2 = ±r(n1 - n2)`, giving the radius
 * `r = |p1-p2| / |n1-n2|`; the axis point is then `p - r·n` with the normal's
 * sign chosen so both samples agree. Exact for full and partial cylinders.
 * Returns null for non-cylinders.
 */
export function getSurfaceAxis(
  k: OcctKernelWasm,
  face: KernelShape
): { origin: V3; direction: V3 } | null {
  if (surfaceType(k, face) !== 'cylinder') return null;
  const b = uvBounds(k, face);
  const vMid = 0.5 * (b.vMin + b.vMax);
  const u1 = b.uMin + 0.25 * (b.uMax - b.uMin);
  const u2 = b.uMin + 0.5 * (b.uMax - b.uMin);
  const n1 = surfaceNormal(k, face, u1, vMid);
  const n2 = surfaceNormal(k, face, u2, vMid);
  const p1 = pointOnSurface(k, face, u1, vMid);
  const p2 = pointOnSurface(k, face, u2, vMid);

  const axis = crossV(n1, n2);
  const axisLen = lenV(axis);
  const dnLen = lenV(subV(n1, n2));
  if (axisLen < 1e-9 || dnLen < 1e-9) return null; // samples too close to resolve
  const direction: V3 = [axis[0] / axisLen, axis[1] / axisLen, axis[2] / axisLen];
  const r = lenV(subV(p1, p2)) / dnLen;

  // Axis point is p - r·n; pick the normal sign that makes both samples agree.
  const minus1: V3 = [p1[0] - r * n1[0], p1[1] - r * n1[1], p1[2] - r * n1[2]];
  const minus2: V3 = [p2[0] - r * n2[0], p2[1] - r * n2[1], p2[2] - r * n2[2]];
  if (lenV(subV(minus1, minus2)) < 1e-6) return { origin: minus1, direction };
  return { origin: [p1[0] + r * n1[0], p1[1] + r * n1[1], p1[2] + r * n1[2]], direction };
}

export function uvFromPoint(
  k: OcctKernelWasm,
  face: KernelShape,
  point: [number, number, number]
): [number, number] | null {
  const vec = k.uvFromPoint(unwrap(face), point[0], point[1], point[2]);
  try {
    if (vec.size() < 2) return null;
    return [vec.get(0), vec.get(1)];
  } finally {
    vec.delete();
  }
}

export function projectPointOnFace(
  k: OcctKernelWasm,
  face: KernelShape,
  point: [number, number, number]
): [number, number, number] {
  const vec = k.projectPointOnFace(unwrap(face), point[0], point[1], point[2]);
  try {
    return [vec.get(0), vec.get(1), vec.get(2)];
  } finally {
    vec.delete();
  }
}

export function classifyPointOnFace(
  k: OcctKernelWasm,
  face: KernelShape,
  u: number,
  v: number,
  _tolerance?: number
): 'in' | 'on' | 'out' {
  return k.classifyPointOnFace(unwrap(face), u, v).toLowerCase() as 'in' | 'on' | 'out';
}

export function projectEdges(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shape: KernelShape,
  cameraOrigin: [number, number, number],
  cameraDirection: [number, number, number],
  cameraXAxis?: [number, number, number]
): {
  visible: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
  hidden: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
} {
  const [ox, oy, oz] = cameraOrigin;
  const [dx, dy, dz] = cameraDirection;
  const hasXAxis = !!cameraXAxis;
  const [xx, xy, xz] = cameraXAxis ?? [1, 0, 0];
  const proj = k.projectEdges(unwrap(shape), ox, oy, oz, dx, dy, dz, xx, xy, xz, hasXAxis);
  const wrapOrNull = (id: number): KernelShape =>
    id === 0
      ? handle('compound', k.makeCompound(new Module.VectorUint32()))
      : handle('compound', id);
  return {
    visible: {
      outline: wrapOrNull(proj.visibleOutline),
      smooth: wrapOrNull(proj.visibleSmooth),
      sharp: wrapOrNull(proj.visibleSharp),
    },
    hidden: {
      outline: wrapOrNull(proj.hiddenOutline),
      smooth: wrapOrNull(proj.hiddenSmooth),
      sharp: wrapOrNull(proj.hiddenSharp),
    },
  };
}
