/* tslint:disable */
/* eslint-disable */

/**
 * Inside/outside classification per query point (winding number > 0.5).
 *
 * Returns length Q: 1 = inside, 0 = outside. This is the sign decision the
 * repair pipeline makes on non-watertight input.
 */
export function points_inside(verts: Float32Array, tris: Uint32Array, queries: Float32Array): Uint8Array;

/**
 * Crate version, for the loader to assert artifact/loader compatibility.
 */
export function version(): string;

/**
 * Winding number at each query point, against a triangle-soup mesh.
 *
 * `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T.
 * `queries`: flat xyz, length 3·Q. Returns length Q (winding number per query).
 */
export function winding_numbers(verts: Float32Array, tris: Uint32Array, queries: Float32Array): Float32Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly points_inside: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly version: () => [number, number];
    readonly winding_numbers: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
