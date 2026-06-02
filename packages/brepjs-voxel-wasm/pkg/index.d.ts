/* tslint:disable */
/* eslint-disable */

/**
 * Repaired triangle mesh handed back across the wasm boundary. wasm-bindgen
 * exposes the `Vec` getters as typed arrays (flat xyz positions/normals,
 * triangle-list indices). World-space coords; the bridge does not re-scale.
 */
export class RepairResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly indices: Uint32Array;
    readonly normals: Float32Array;
    readonly positions: Float32Array;
}

/**
 * Fill a mesh with a TPMS lattice infill: voxelize the FWN-signed solid over a
 * grid sized to the mesh bbox, build a shell field of the chosen lattice over the
 * same grid, intersect them (keep voxels both inside the solid AND in strut
 * material), then Surface-Nets contour back to triangles (world-space).
 *
 * `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T.
 * `lattice_type`: 0=Gyroid, 1=SchwarzP, 2=Diamond. `period` is the unit-cell size
 * (world units); `thickness` is the strut wall width in field units.
 * Errors (as a JS exception) on a bad lattice tag or a grid over the voxel cap.
 */
export function lattice_infill(verts: Float32Array, tris: Uint32Array, resolution: number, padding: number, lattice_type: number, period: number, thickness: number): RepairResult;

/**
 * Inside/outside classification per query point (winding number > 0.5).
 *
 * Returns length Q: 1 = inside, 0 = outside. This is the sign decision the
 * repair pipeline makes on non-watertight input.
 */
export function points_inside(verts: Float32Array, tris: Uint32Array, queries: Float32Array): Uint8Array;

/**
 * Repair a (possibly non-watertight) mesh into a closed surface: voxelize the
 * FWN-signed SDF over a grid sized to the mesh bbox, then Surface-Nets contour
 * it back to triangles (world-space). `resolution` sizes the longest bbox axis;
 * `padding` is the positive air margin Surface Nets needs (>= 1 to avoid clip).
 *
 * `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T.
 * Errors (as a JS exception) if the grid exceeds the voxel cap.
 */
export function repair_mesh(verts: Float32Array, tris: Uint32Array, resolution: number, padding: number): RepairResult;

/**
 * The infinite TPMS lattice clipped to an axis-aligned box. Build a grid over
 * `[min..max]`, fill the chosen lattice shell field, Surface-Nets contour it.
 *
 * `lattice_type`: 0=Gyroid, 1=SchwarzP, 2=Diamond. `period` is the unit-cell size
 * (world units); `thickness` is the strut wall width in field units.
 * Errors (as a JS exception) on a bad lattice tag or a grid over the voxel cap.
 */
export function tpms_box(min_x: number, min_y: number, min_z: number, max_x: number, max_y: number, max_z: number, resolution: number, padding: number, lattice_type: number, period: number, thickness: number): RepairResult;

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
    readonly __wbg_repairresult_free: (a: number, b: number) => void;
    readonly lattice_infill: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly points_inside: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly repair_mesh: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly repairresult_indices: (a: number) => [number, number];
    readonly repairresult_normals: (a: number) => [number, number];
    readonly repairresult_positions: (a: number) => [number, number];
    readonly tpms_box: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number];
    readonly version: () => [number, number];
    readonly winding_numbers: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
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
