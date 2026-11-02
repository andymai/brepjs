/* tslint:disable */
/* eslint-disable */

/**
 * Tier 0 conversion output. Region `r` owns loops in `loops` (encoded as
 * `[loopCount, len0, ...ids0, len1, ...ids1, ...]` per region, in order) and
 * triangles `triangle_offsets[r]..triangle_offsets[r + 1]`, counted in
 * triangles: its vertex indices are `triangles[3 * triangle_offsets[r]..3 *
 * triangle_offsets[r + 1]]`. Indices refer to `positions` (flat xyz, mm).
 */
export class Tier0Result {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly body_closed: Uint8Array;
    readonly body_parent: Int32Array;
    readonly input_deviation: Float32Array;
    readonly input_indices: Uint32Array;
    readonly input_positions: Float64Array;
    readonly loops: Uint32Array;
    readonly positions: Float64Array;
    readonly region_body: Uint32Array;
    readonly report: string;
    readonly triangle_offsets: Uint32Array;
    readonly triangles: Uint32Array;
}

/**
 * Run the Tier 0 pipeline on raw file bytes.
 *
 * `unit`: "auto" or one of um/mm/cm/m/in/ft. `tolerance`: millimeters, or
 * NaN/≤0 to estimate it. `fill_holes`: -1 fills every hole, 0 none, n > 0
 * holes with at most n edges. `heatmap` returns the welded input mesh with each
 * vertex's distance to the result.
 */
export function convert_tier0(bytes: Uint8Array, format_hint: string, unit: string, tolerance: number, max_triangles: number, fill_holes: number, heatmap: boolean): Tier0Result;

export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_tier0result_free: (a: number, b: number) => void;
    readonly convert_tier0: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number];
    readonly tier0result_body_closed: (a: number) => [number, number];
    readonly tier0result_body_parent: (a: number) => [number, number];
    readonly tier0result_input_deviation: (a: number) => [number, number];
    readonly tier0result_input_indices: (a: number) => [number, number];
    readonly tier0result_input_positions: (a: number) => [number, number];
    readonly tier0result_loops: (a: number) => [number, number];
    readonly tier0result_positions: (a: number) => [number, number];
    readonly tier0result_region_body: (a: number) => [number, number];
    readonly tier0result_report: (a: number) => [number, number];
    readonly tier0result_triangle_offsets: (a: number) => [number, number];
    readonly tier0result_triangles: (a: number) => [number, number];
    readonly version: () => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
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
