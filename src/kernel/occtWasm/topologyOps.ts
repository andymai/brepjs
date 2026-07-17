/**
 * Topology query and assembly operations for the occt-wasm adapter.
 *
 * @module
 */

import type { KernelShape, ShapeOrientation, ShapeType } from '@/kernel/types.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import {
  handle,
  isOcctWasmHandle,
  makeVecU32,
  mapShapeType,
  readVecInt,
  unwrap,
  wrapResult,
} from './helpers.js';
import { wasmIndex } from '@/utils/vec3.js';

export function iterShapes(k: OcctKernelWasm, shape: KernelShape, type: ShapeType): KernelShape[] {
  const vec = k.getSubShapes(unwrap(shape), type);
  const results: KernelShape[] = [];
  try {
    const n = vec.size();
    for (let i = 0; i < n; i++) {
      results.push(handle(type, vec.get(i)));
    }
  } finally {
    vec.delete();
  }
  return results;
}

export function shapeType(k: OcctKernelWasm, shape: KernelShape): ShapeType {
  if (isOcctWasmHandle(shape)) return shape.type;
  return mapShapeType(k.getShapeType(unwrap(shape)));
}

export function isSame(k: OcctKernelWasm, a: KernelShape, b: KernelShape): boolean {
  return k.isSame(unwrap(a), unwrap(b));
}

export function isEqual(k: OcctKernelWasm, a: KernelShape, b: KernelShape): boolean {
  return k.isEqual(unwrap(a), unwrap(b));
}

export function downcast(k: OcctKernelWasm, shape: KernelShape, type?: ShapeType): KernelShape {
  if (type) {
    const id = k.downcast(unwrap(shape), type);
    return handle(type, id);
  }
  return shape;
}

export function copyShape(k: OcctKernelWasm, shape: KernelShape): KernelShape {
  // Real geometric copy into a fresh arena slot. `downcast` would alias the
  // source id, so a copy is the only way to get an independently-disposable
  // handle on this kernel.
  return wrapResult(k, k.copy(unwrap(shape)));
}

export function hashCode(k: OcctKernelWasm, shape: KernelShape, upperBound: number): number {
  return k.hashCode(unwrap(shape), upperBound);
}

export function isNull(k: OcctKernelWasm, shape: KernelShape): boolean {
  return k.isNull(unwrap(shape));
}

export function shapeOrientation(k: OcctKernelWasm, shape: KernelShape): ShapeOrientation {
  const orient = k.shapeOrientation(unwrap(shape));
  return orient.toLowerCase() as ShapeOrientation;
}

export function edgeToFaceMap(k: OcctKernelWasm, shape: KernelShape): string {
  const HASH_UPPER = 1000000;
  const vec = k.edgeToFaceMap(unwrap(shape), HASH_UPPER);
  let data: number[];
  try {
    data = readVecInt(vec);
  } finally {
    vec.delete();
  }
  const map: Record<number, number[]> = {};
  for (let i = 0; i + 1 < data.length; i += 2) {
    const edgeHash = wasmIndex(data, i);
    const faceHash = wasmIndex(data, i + 1);
    if (!map[edgeHash]) map[edgeHash] = [];
    map[edgeHash].push(faceHash);
  }
  return JSON.stringify(map);
}

/** Count sub-shapes of `type` without materialising a handle per sub-shape (3.7.0). */
export function subShapeCount(k: OcctKernelWasm, shape: KernelShape, type: ShapeType): number {
  return k.subShapeCount(unwrap(shape), type);
}

/** Deduplicated sub-shape hashes at `hashUpperBound`, no per-sub-shape handle (3.7.0). */
export function subShapeHashes(
  k: OcctKernelWasm,
  shape: KernelShape,
  type: ShapeType,
  hashUpperBound: number
): number[] {
  const vec = k.subShapeHashes(unwrap(shape), type, hashUpperBound);
  try {
    return readVecInt(vec);
  } finally {
    vec.delete();
  }
}

export function sharedEdges(
  k: OcctKernelWasm,
  faceA: KernelShape,
  faceB: KernelShape
): KernelShape[] {
  const vec = k.sharedEdges(unwrap(faceA), unwrap(faceB));
  const results: KernelShape[] = [];
  try {
    const n = vec.size();
    for (let i = 0; i < n; i++) {
      results.push(handle('edge', vec.get(i)));
    }
  } finally {
    vec.delete();
  }
  return results;
}

export function adjacentFaces(
  k: OcctKernelWasm,
  shape: KernelShape,
  face: KernelShape
): KernelShape[] {
  const vec = k.adjacentFaces(unwrap(shape), unwrap(face));
  const results: KernelShape[] = [];
  try {
    const n = vec.size();
    for (let i = 0; i < n; i++) {
      results.push(handle('face', vec.get(i)));
    }
  } finally {
    vec.delete();
  }
  return results;
}

export function sew(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shapes: KernelShape[],
  tolerance?: number
): KernelShape {
  const vec = makeVecU32(Module, shapes.map(unwrap));
  try {
    return wrapResult(k, k.sew(vec, tolerance ?? 1e-6));
  } finally {
    vec.delete();
  }
}
