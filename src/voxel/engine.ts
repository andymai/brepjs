/**
 * The wasm surface the voxel domain depends on — structurally satisfied by the
 * loaded `brepjs-voxel-wasm` module. Kept snake_case to match the wasm-bindgen
 * exports exactly, so the raw module is a zero-adapter `VoxelEngine`.
 *
 * All buffers are flat (no zero-copy across the wasm boundary, per ADR-0013):
 * `verts` is xyz·V, `tris` is index·T, `queries` is xyz·Q.
 */
export interface VoxelEngine {
  /** Generalized winding number per query point (~1 inside, ~0 outside). */
  winding_numbers(verts: Float32Array, tris: Uint32Array, queries: Float32Array): Float32Array;
  /** Inside/outside classification per query point (1 = inside, 0 = outside). */
  points_inside(verts: Float32Array, tris: Uint32Array, queries: Float32Array): Uint8Array;
  /** Voxelize-and-contour a mesh into a closed surface (FWN sign keystone). */
  repair_mesh(
    verts: Float32Array,
    tris: Uint32Array,
    resolution: number,
    padding: number
  ): VoxelRepairResult;
  /** Engine artifact version, for loader/artifact compatibility checks. */
  version(): string;
}

/**
 * The repaired-mesh handle the wasm `repair_mesh` returns. Flat xyz
 * `positions`/`normals` (length 3·V) and a triangle-list `indices` (3 per tri),
 * in world space. Structurally satisfied by the generated `RepairResult` class.
 */
export interface VoxelRepairResult {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  /** Release the backing WASM allocation (wasm-bindgen lifecycle). */
  free(): void;
  [Symbol.dispose](): void;
}
