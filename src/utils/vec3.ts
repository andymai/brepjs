/**
 * Vec3 helpers for kernel-adapter math.
 *
 * Centralizes the `[number, number, number]` tuple type so kernel ops avoid
 * the `noUncheckedIndexedAccess` × `number[]` pile-up of `arr[0]! arr[1]! arr[2]!`
 * patterns and their accompanying eslint-disable forest.
 *
 * For genuinely variadic WASM arrays (matrices, mesh buffers), use {@link wasmIndex}.
 */

export type Vec3 = readonly [number, number, number];
export type MutVec3 = [number, number, number];

/** Subtract two Vec3 values component-wise. */
export function sub3(a: Vec3, b: Vec3): MutVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Cross product of two Vec3 values. */
export function cross3(a: Vec3, b: Vec3): MutVec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Squared magnitude — cheaper than length when only comparison is needed. */
export function lenSq3(v: Vec3): number {
  return v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
}

/** Euclidean length of a Vec3. */
export function len3(v: Vec3): number {
  return Math.sqrt(lenSq3(v));
}

/** Scale a Vec3 by a scalar. */
export function scale3(v: Vec3, k: number): MutVec3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

/** Normalize a Vec3, returning the zero vector if length is below {@link eps}. */
export function normalize3(v: Vec3, eps = 1e-12): MutVec3 {
  const l = len3(v);
  return l < eps ? [0, 0, 0] : [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Read three consecutive numbers from a flat array as a Vec3 tuple. Caller
 * must guarantee `arr.length >= offset + 3` (typical at WASM boundary).
 */
export function read3(arr: ArrayLike<number>, offset = 0): MutVec3 {
  return [arr[offset] as number, arr[offset + 1] as number, arr[offset + 2] as number];
}

/**
 * Index into a typed/regular array at a position the caller has structurally
 * guaranteed (WASM ABI fixed-length arrays, post-bounds-check loops, etc.).
 * Equivalent to `arr[i]!` but typed as `T` directly — no eslint-disable needed.
 */
export function wasmIndex<T>(arr: ArrayLike<T>, i: number): T {
  return arr[i] as T;
}
