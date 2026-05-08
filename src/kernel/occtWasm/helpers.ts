/* v8 ignore file -- occt-wasm kernel not available in brepkit test suite */
/**
 * Shared helpers for the occt-wasm adapter — handle wrapping, kernel result
 * unwrapping, and Embind vector marshalling.
 *
 * Extracted from occtWasmAdapter.ts to enable decomposing the adapter into
 * per-section files (booleanOps, sweepOps, etc.). Each section imports the
 * helpers it needs without depending on the adapter class.
 *
 * @module
 */

import type { KernelShape, ShapeType } from '@/kernel/types.js';
import type {
  OcctWasmHandle,
  OcctWasmModule,
  OcctKernelWasm,
  EmVectorUint32,
  EmVectorInt,
  EmVectorDouble,
} from './occtWasmTypes.js';

export const noop = (): void => {};

/** Build an opaque kernel handle for an arena-allocated WASM shape. */
export function handle(type: ShapeType, id: number): OcctWasmHandle {
  return {
    __occtWasm: true,
    type,
    id,
    delete: noop,
    HashCode(upperBound: number) {
      return id % upperBound;
    },
    IsNull() {
      return false;
    },
  };
}

export function isOcctWasmHandle(shape: unknown): shape is OcctWasmHandle {
  return typeof shape === 'object' && shape !== null && (shape as OcctWasmHandle).__occtWasm;
}

/** Extract the u32 id from a handle. */
export function unwrap(shape: KernelShape): number {
  if (isOcctWasmHandle(shape)) return shape.id;
  if (typeof shape === 'number') return shape;
  throw new Error('occt-wasm: expected an OcctWasmHandle or number, got ' + typeof shape);
}

/** Map a WASM shape type string to our ShapeType enum. */
export function mapShapeType(wasmType: string): ShapeType {
  const lower = wasmType.toLowerCase();
  switch (lower) {
    case 'vertex':
      return 'vertex';
    case 'edge':
      return 'edge';
    case 'wire':
      return 'wire';
    case 'face':
      return 'face';
    case 'shell':
      return 'shell';
    case 'solid':
      return 'solid';
    case 'compsolid':
      return 'compsolid';
    case 'compound':
      return 'compound';
    default:
      return 'compound';
  }
}

/** Wrap a WASM u32 result as a typed handle, querying the kernel for type. */
export function wrapResult(kernel: OcctKernelWasm, id: number): OcctWasmHandle {
  const type = mapShapeType(kernel.getShapeType(id));
  return handle(type, id);
}

// ─── Embind vector helpers ───────────────────────────────────────────────────
// Embind vectors must be created, populated, and explicitly released via
// `.delete()`. Callers wrap the lifecycle in try/finally.

export function makeVecU32(Module: OcctWasmModule, values: number[]): EmVectorUint32 {
  const vec = new Module.VectorUint32();
  for (const v of values) vec.push_back(v);
  return vec;
}

export function makeVecInt(Module: OcctWasmModule, values: number[]): EmVectorInt {
  const vec = new Module.VectorInt();
  for (const v of values) vec.push_back(v);
  return vec;
}

export function makeVecDouble(Module: OcctWasmModule, values: number[]): EmVectorDouble {
  const vec = new Module.VectorDouble();
  for (const v of values) vec.push_back(v);
  return vec;
}

export function readVecInt(vec: EmVectorInt): number[] {
  const result: number[] = [];
  const n = vec.size();
  for (let i = 0; i < n; i++) result.push(vec.get(i));
  return result;
}

/**
 * 4x4 matrix multiplication in row-major order. Used by composeTransform
 * and any other transform-stack composition.
 */
export function multiplyMatrices4x4(a: number[], b: number[]): number[] {
  const result = new Array(16).fill(0) as number[];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 4; k++) {
        result[i * 4 + j] =
          (result[i * 4 + j] as number) + (a[i * 4 + k] as number) * (b[k * 4 + j] as number);
      }
    }
  }
  return result;
}

/**
 * Resolve a callback-style radius/distance to a uniform number.
 * occt-wasm's fillet/chamfer take a single radius — uniform per call.
 */
export function resolveUniformRadius(
  edges: KernelShape[],
  radius: number | [number, number] | ((edge: KernelShape) => number | [number, number])
): number {
  if (typeof radius === 'number') return radius;
  if (Array.isArray(radius)) return radius[0];
  if (edges.length === 0) throw new Error('occt-wasm: no edges provided');
  const val = radius(edges[0] as KernelShape);
  return typeof val === 'number' ? val : val[0];
}

/**
 * Rotate a shape from the kernel's default Z-axis to an arbitrary direction.
 * Used by primitives whose creation API only takes a Z-aligned form.
 */
export function rotateZToDirection(
  k: OcctKernelWasm,
  shapeId: number,
  dir: [number, number, number]
): number {
  const [dx, dy, dz] = dir;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-10) return shapeId;
  const nx = dx / len,
    ny = dy / len,
    nz = dz / len;
  if (Math.abs(nz - 1) < 1e-10) return shapeId;
  if (Math.abs(nz + 1) < 1e-10) return k.rotate(shapeId, 0, 0, 0, 1, 0, 0, Math.PI);
  const ax = -ny,
    ay = nx;
  const axLen = Math.sqrt(ax * ax + ay * ay);
  if (axLen < 1e-10) return shapeId;
  const angle = Math.acos(Math.max(-1, Math.min(1, nz)));
  return k.rotate(shapeId, 0, 0, 0, ax / axLen, ay / axLen, 0, angle);
}
