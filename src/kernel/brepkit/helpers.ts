/**
 * Shared helpers for the brepkit adapter module files.
 *
 * All handle creation, type guards, unwrapping, matrix construction, and
 * shared mutable state (synthetic compounds) live here.
 *
 * @module
 */

import type { KernelShape, ShapeType } from '@/kernel/types.js';
import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { Curve2dHandle, BBox2dHandle } from '@/kernel/kernel2dTypes.js';
import type { Curve2dObj, BBox2d as BkBBox2d } from '../geometry2d.js';
import { wasmIndex } from '@/utils/vec3.js';

// ---------------------------------------------------------------------------
// Handle types
// ---------------------------------------------------------------------------

/**
 * Typed wrapper around a brepkit u32 arena handle.
 *
 * brepjs passes these around as opaque `KernelShape`. The adapter extracts
 * the `.id` and `.type` when calling back into brepkit WASM.
 */
export interface BrepkitHandle {
  readonly __brepkit: true;
  readonly type: ShapeType;
  /** Raw u32 arena index. */
  readonly id: number;
  /** No-op -- arena-based allocation doesn't free individual handles.
   *  Present for compatibility with OCCT's wasm-bindgen `.delete()` convention. */
  delete(): void;
  /** OCCT-compatible hash code derived from the arena handle id. */
  HashCode(upperBound: number): number;
  /** OCCT-compatible null check -- brepkit handles are never null. */
  IsNull(): boolean;
}

/** Shared no-op delete -- one function instance for all handles. */
export const noop = () => {};

/** Type guard: is this shape a brepkit handle? */
export function isBrepkitHandle(shape: unknown): shape is BrepkitHandle {
  return typeof shape === 'object' && shape !== null && (shape as BrepkitHandle).__brepkit;
}

export function handle(type: ShapeType, id: number): BrepkitHandle {
  return {
    __brepkit: true,
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

export function solidHandle(id: number): BrepkitHandle {
  return handle('solid', id);
}
export function faceHandle(id: number): BrepkitHandle {
  return handle('face', id);
}
export function edgeHandle(id: number): BrepkitHandle {
  return handle('edge', id);
}
export function wireHandle(id: number): BrepkitHandle {
  return handle('wire', id);
}
export function shellHandle(id: number): BrepkitHandle {
  return handle('shell', id);
}
export function compoundHandle(id: number): BrepkitHandle {
  const h = handle('compound', id);
  // Clean up JS-side synthetic compound storage on delete
  if (syntheticCompounds.has(id)) {
    return { ...h, delete: () => syntheticCompounds.delete(id) };
  }
  return h;
}
export function vertexHandle(id: number): BrepkitHandle {
  return handle('vertex', id);
}

// ---------------------------------------------------------------------------
// Unwrapping
// ---------------------------------------------------------------------------

/** Extract the u32 id from a handle, with a type assertion. */
export function unwrap(shape: KernelShape, expected?: ShapeType): number {
  if (!isBrepkitHandle(shape)) {
    throw new Error('brepkit: expected a BrepkitHandle, got ' + typeof shape);
  }
  if (expected && shape.type !== expected) {
    throw new Error(`brepkit: expected ${expected} handle, got ${shape.type}`);
  }
  return shape.id;
}

/** Convert a WASM Uint32Array of handles to a plain number[] for use with .map/.filter/.flatMap. */
export function toArray(ids: Uint32Array): number[] {
  return Array.from(ids);
}

/** Unwrap a shape that must be a solid, with a descriptive error naming the method. */
export function unwrapSolidOrThrow(shape: KernelShape, methodName: string): number {
  if (!isBrepkitHandle(shape)) {
    throw new Error('brepkit: expected a BrepkitHandle, got ' + typeof shape);
  }
  if (shape.type !== 'solid') {
    throw new Error(
      `brepkit: ${methodName} requires a solid, got ${shape.type}. ` +
        'Consider using makeCompound() to combine shapes first.'
    );
  }
  return shape.id;
}

/**
 * Extract solid ids from a shape. For solids, returns the id directly.
 * For compounds, attempts to extract child solids via getCompoundSolids.
 * Throws a descriptive error for other types.
 */
export function unwrapSolidsForExport(
  bk: BrepkitKernel,
  shape: KernelShape,
  methodName: string
): number[] {
  if (!isBrepkitHandle(shape)) {
    throw new Error('brepkit: expected a BrepkitHandle, got ' + typeof shape);
  }
  if (shape.type === 'solid') {
    return [shape.id];
  }
  if (shape.type === 'compound') {
    const ids = toArray(bk.getCompoundSolids(shape.id));
    if (ids.length > 0) return ids;
    throw new Error(`brepkit: ${methodName} received a compound with no solids.`);
  }
  throw new Error(
    `brepkit: ${methodName} requires a solid or compound of solids, got ${shape.type}.`
  );
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Euclidean distance between two 3D points. */
export function dist3(
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number
): number {
  const dx = x1 - x2,
    dy = y1 - y2,
    dz = z1 - z2;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Copy a WASM-backed Uint8Array into an independent ArrayBuffer. */
export function copyWasmBytes(bytes: Uint8Array): ArrayBuffer {
  return (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

// ---------------------------------------------------------------------------
// Matrix helpers
// ---------------------------------------------------------------------------

/** Build a row-major 4x4 translation matrix. */
export function translationMatrix(x: number, y: number, z: number): number[] {
  // prettier-ignore
  return [
    1, 0, 0, x,
    0, 1, 0, y,
    0, 0, 1, z,
    0, 0, 0, 1,
  ];
}

/**
 * Coerce a possibly-malformed value into a Vec3 tuple, falling back to `fallback`.
 *
 * The matrix builders sit at the JS↔WASM boundary where `no-unsafe-*` is off, so
 * an `axis`/`center` typed as `Vec3` can arrive as a non-iterable at runtime (a
 * `{x,y,z}` object, `null`, a scalar from a malformed compose op). Default
 * parameters only guard `undefined`, so destructuring such a value throws a
 * cryptic `center is not iterable`. This extends the existing `undefined → default`
 * tolerance to any non-Vec3 input instead of crashing.
 */
function asVec3(
  value: unknown,
  fallback: readonly [number, number, number]
): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  const [x, y, z] = value as [unknown, unknown, unknown];
  return typeof x === 'number' &&
    typeof y === 'number' &&
    typeof z === 'number' &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(z)
    ? [x, y, z]
    : fallback;
}

/** Build a row-major 4x4 rotation matrix (angle in degrees, optional axis/center). */
export function rotationMatrix(
  angleDeg: number,
  axisInput: readonly [number, number, number] = [0, 0, 1],
  centerInput: readonly [number, number, number] = [0, 0, 0]
): number[] {
  const rawAxis = asVec3(axisInput, [0, 0, 1]);
  // A zero-length axis can't be normalised (len === 0 → division by zero → NaN);
  // fall back to +Z, matching the `undefined`/non-Vec3 default.
  const axis: readonly [number, number, number] =
    rawAxis[0] === 0 && rawAxis[1] === 0 && rawAxis[2] === 0 ? [0, 0, 1] : rawAxis;
  const center = asVec3(centerInput, [0, 0, 0]);
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const t = 1 - c;
  // Normalise axis
  const len = Math.sqrt(axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2);
  const [ux, uy, uz] = [axis[0] / len, axis[1] / len, axis[2] / len];

  // Rotation about arbitrary axis through origin
  const r00 = t * ux * ux + c;
  const r01 = t * ux * uy - s * uz;
  const r02 = t * ux * uz + s * uy;
  const r10 = t * uy * ux + s * uz;
  const r11 = t * uy * uy + c;
  const r12 = t * uy * uz - s * ux;
  const r20 = t * uz * ux - s * uy;
  const r21 = t * uz * uy + s * ux;
  const r22 = t * uz * uz + c;

  // If center is non-zero, conjugate: T(center) * R * T(-center)
  const [cx, cy, cz] = center;
  const tx = cx - (r00 * cx + r01 * cy + r02 * cz);
  const ty = cy - (r10 * cx + r11 * cy + r12 * cz);
  const tz = cz - (r20 * cx + r21 * cy + r22 * cz);

  // prettier-ignore
  return [
    r00, r01, r02, tx,
    r10, r11, r12, ty,
    r20, r21, r22, tz,
    0,   0,   0,   1,
  ];
}

/** Build a row-major 4x4 uniform scale matrix about a center point. */
export function scaleMatrix(
  centerInput: readonly [number, number, number],
  factor: number
): number[] {
  const [cx, cy, cz] = asVec3(centerInput, [0, 0, 0]);
  const tx = cx * (1 - factor);
  const ty = cy * (1 - factor);
  const tz = cz * (1 - factor);
  // prettier-ignore
  return [
    factor, 0,      0,      tx,
    0,      factor, 0,      ty,
    0,      0,      factor, tz,
    0,      0,      0,      1,
  ];
}

/** Build a row-major 4x4 matrix from a 3x3 linear part + translation. */
export function affineMatrix(
  linear: readonly number[],
  translation: readonly [number, number, number]
): number[] {
  const li = (i: number) => wasmIndex(linear, i);
  // prettier-ignore
  return [
    li(0), li(1), li(2), translation[0],
    li(3), li(4), li(5), translation[1],
    li(6), li(7), li(8), translation[2],
    0,     0,     0,     1,
  ];
}

/** Build a 4x4 reflection matrix for a plane defined by origin + normal. */
export function mirrorMatrix(
  origin: readonly [number, number, number],
  normal: readonly [number, number, number]
): number[] {
  const [ox, oy, oz] = origin;
  const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
  const nx = normal[0] / len;
  const ny = normal[1] / len;
  const nz = normal[2] / len;
  // Householder reflection: I - 2*n*n^T, translated to origin
  const d = 2 * (ox * nx + oy * ny + oz * nz);
  // prettier-ignore
  return [
    1 - 2*nx*nx,  -2*nx*ny,     -2*nx*nz,     d*nx,
    -2*ny*nx,     1 - 2*ny*ny,  -2*ny*nz,     d*ny,
    -2*nz*nx,     -2*nz*ny,     1 - 2*nz*nz,  d*nz,
    0,            0,            0,             1,
  ];
}

/** Multiply two 4x4 row-major matrices. */
export function multiplyMatrices(a: number[], b: number[]): number[] {
  const result = new Array(16).fill(0);
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

// ---------------------------------------------------------------------------
// Deflection defaults
// ---------------------------------------------------------------------------

/** Default tessellation deflection used when brepkit requires it but brepjs doesn't pass it. */
export const DEFAULT_DEFLECTION = 0.01;

/** Default sphere/torus segment count (brepkit requires explicit segments). */
export const DEFAULT_SEGMENTS = 32;

// ---------------------------------------------------------------------------
// Synthetic compounds (JS-side compound storage)
// ---------------------------------------------------------------------------

/**
 * Counter for synthetic compound IDs (non-solid compounds stored JS-side).
 * Starts high to avoid colliding with WASM arena indices.
 */
let syntheticCompoundCounter = 900_000;

/** Increment and return the synthetic compound counter. */
export function nextSyntheticId(): number {
  return syntheticCompoundCounter++;
}

/** JS-side storage for compound children (wires, faces, edges). */
export const syntheticCompounds = new Map<number, BrepkitHandle[]>();

// ---------------------------------------------------------------------------
// One-time degradation warnings (ADR-0006 Phase 4)
// ---------------------------------------------------------------------------

const _warned = new Set<string>();

/** Emit a console.warn once per key per session. */
export function warnOnce(key: string, message: string): void {
  if (_warned.has(key)) return;
  _warned.add(key);
  console.warn(`brepkit: ${message}`);
}

/** Check if a BooleanOptions object has any meaningful (non-signal) property set. */
export function hasBooleanOptions(opts: {
  optimisation?: unknown;
  simplify?: unknown;
  strategy?: unknown;
  fuzzyValue?: unknown;
}): boolean {
  return (
    opts.optimisation !== undefined ||
    opts.simplify !== undefined ||
    opts.strategy !== undefined ||
    opts.fuzzyValue !== undefined
  );
}

// ---------------------------------------------------------------------------
// 2D handle casts
// ---------------------------------------------------------------------------

/** Cast opaque Curve2dHandle to internal Curve2dObj. */
export function c2d(h: Curve2dHandle): Curve2dObj {
  return h as Curve2dObj;
}

/** Unwrap trimmed curve wrappers to get the basis geometry. */
export function c2dBasis(h: Curve2dHandle): Curve2dObj {
  let c = h as Curve2dObj;
  while (c.__bk2d === 'trimmed') c = c.basis;
  return c;
}

/** Cast opaque BBox2dHandle to internal BkBBox2d. */
export function bb2d(h: BBox2dHandle): BkBBox2d {
  return h as BkBBox2d;
}

/**
 * Resolve a callback-style draft angle to a uniform number.
 * brepkit only supports a single angle per draft call — throws if the
 * callback would produce distinct angles per face.
 */
export function resolveUniformAngle(
  faces: KernelShape[],
  angleDeg: number | ((face: KernelShape) => number)
): number {
  if (typeof angleDeg !== 'function') return angleDeg;
  let uniform: number | undefined;
  for (const face of faces) {
    let angle: number;
    try {
      angle = angleDeg(face);
    } catch {
      throw new Error(
        'brepkit does not support variable draft with multiple distinct angles. ' +
          'Use the OCCT kernel for per-face angle variation, or use a uniform angle.'
      );
    }
    if (uniform === undefined) {
      uniform = angle;
    } else if (angle !== uniform) {
      throw new Error(
        'brepkit does not support variable draft with multiple distinct angles. ' +
          'Use the OCCT kernel for per-face angle variation, or use a uniform angle.'
      );
    }
  }
  if (uniform === undefined) throw new Error('draft: no faces provided');
  return uniform;
}
