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
