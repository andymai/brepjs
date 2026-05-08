/**
 * Vec3 type alias and bounds-checked WASM index helper.
 *
 * Centralizes the `[number, number, number]` tuple type so kernel ops can
 * declare local axis vectors with explicit tuple typing — `nz: [number, number, number]`
 * instead of `nz: number[]` — and drop the `arr[i]!` non-null assertions that
 * `noUncheckedIndexedAccess` otherwise demands.
 *
 * `wasmIndex` is the escape hatch for genuinely variadic WASM arrays (knot
 * vectors, control-point flat arrays) where the index has been structurally
 * guaranteed by the surrounding loop or the WASM ABI.
 *
 * Math helpers (cross/sub/normalize/etc.) are intentionally NOT included —
 * the closure allocations they introduce regressed the gridfinity benchmark
 * by 17% in early experiments. Hot-path code keeps inline math.
 */

export type Vec3 = readonly [number, number, number];

/**
 * Index into a typed/regular array at a position the caller has structurally
 * guaranteed (WASM ABI fixed-length arrays, post-bounds-check loops, etc.).
 * Equivalent to `arr[i]!` but typed as `T` directly — no eslint-disable needed.
 */
export function wasmIndex<T>(arr: ArrayLike<T>, i: number): T {
  return arr[i] as T;
}
