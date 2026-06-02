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
 * Offset (grow/shrink) a mesh by an exact SDF iso-shift. Voxelize the mesh into
 * a true SDF, subtract `distance` from every voxel (so `distance > 0` grows
 * outward, `< 0` shrinks inward), then Surface-Nets contour back to triangles.
 * Because the field is a true SDF this is an exact offset — no reinitialization.
 *
 * `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T.
 * An outward offset surface extends past the input bbox, so the grid bounds are
 * expanded by `distance.max(0)` on every side before allocation.
 * Errors (as a JS exception) on a non-finite `distance` or a grid over the cap.
 */
export function offset_mesh(verts: Float32Array, tris: Uint32Array, distance: number, resolution: number, padding: number): RepairResult;

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
 * Hollow a mesh into a shell of wall `thickness` inward from the surface.
 * Voxelize the mesh into a solid SDF, build the shell field
 * `max(solid, -(solid + thickness))` (the solid intersected with the complement
 * of its inward erosion), then Surface-Nets contour back to triangles.
 *
 * `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T. The
 * shell grows inward only, so the grid is sized to the mesh bbox (no expansion).
 * Errors (as a JS exception) on a non-positive/non-finite `thickness` or a grid
 * over the voxel cap.
 */
export function shell_mesh(verts: Float32Array, tris: Uint32Array, thickness: number, resolution: number, padding: number): RepairResult;

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
 * Robust CSG boolean of two meshes via voxelized SDFs. Voxelize both meshes over
 * a shared grid sized to their UNION bbox, combine by `op`
 * (0=union, 1=intersection, 2=difference A−B), then Surface-Nets contour.
 *
 * `verts_a`/`verts_b`: flat xyz; `tris_a`/`tris_b`: flat vertex indices.
 * Errors (as a JS exception) on an unknown `op` tag, a dim mismatch, or a grid
 * over the voxel cap.
 */
export function voxel_boolean(verts_a: Float32Array, tris_a: Uint32Array, verts_b: Float32Array, tris_b: Uint32Array, op: number, resolution: number, padding: number): RepairResult;

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
    readonly offset_mesh: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly points_inside: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly repair_mesh: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly repairresult_indices: (a: number) => [number, number];
    readonly repairresult_normals: (a: number) => [number, number];
    readonly repairresult_positions: (a: number) => [number, number];
    readonly shell_mesh: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly tpms_box: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number];
    readonly version: () => [number, number];
    readonly voxel_boolean: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number];
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
