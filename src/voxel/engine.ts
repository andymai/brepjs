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
  /** Fill an FWN-signed solid with a TPMS lattice infill, contoured to a mesh. */
  lattice_infill(
    verts: Float32Array,
    tris: Uint32Array,
    resolution: number,
    padding: number,
    lattice_type: number,
    period: number,
    thickness: number
  ): VoxelRepairResult;
  /** Contour the infinite TPMS lattice clipped to an axis-aligned box. */
  tpms_box(
    min_x: number,
    min_y: number,
    min_z: number,
    max_x: number,
    max_y: number,
    max_z: number,
    resolution: number,
    padding: number,
    lattice_type: number,
    period: number,
    thickness: number
  ): VoxelRepairResult;
  /** Offset a mesh by a true-SDF iso-level shift (>0 outward, <0 inward). */
  offset_mesh(
    verts: Float32Array,
    tris: Uint32Array,
    distance: number,
    resolution: number,
    padding: number
  ): VoxelRepairResult;
  /** Hollow a solid mesh into an inward shell of the given thickness (>0). */
  shell_mesh(
    verts: Float32Array,
    tris: Uint32Array,
    thickness: number,
    resolution: number,
    padding: number
  ): VoxelRepairResult;
  /** Voxel CSG of two meshes (op: 0=union, 1=intersection, 2=difference A−B). */
  voxel_boolean(
    verts_a: Float32Array,
    tris_a: Uint32Array,
    verts_b: Float32Array,
    tris_b: Uint32Array,
    op: number,
    resolution: number,
    padding: number
  ): VoxelRepairResult;
  /**
   * Persistent dense voxel-field class, for same-grid op chains: voxelize a mesh
   * once, then boolean/offset/shell/reinit in place, contour once. Structurally
   * satisfied by the generated `VoxelField` wasm-bindgen class.
   */
  VoxelField: WasmVoxelFieldConstructor;
  /**
   * Field-first analytic SDF builder (ADR-0013). Static primitive constructors
   * and combinator methods compose an opaque expression tree that rasterizes
   * directly into a {@link WasmVoxelField} with no input mesh. Structurally
   * satisfied by the generated `Sdf` wasm-bindgen class.
   */
  Sdf: WasmSdfConstructor;
  /**
   * Position-varying scalar fields (brepjs-implicit Phase 2b). Static constructors
   * compose an opaque field that the `Sdf` modulated operators sample per voxel.
   * Structurally satisfied by the generated `ScalarField` wasm-bindgen class.
   */
  ScalarField: WasmScalarFieldConstructor;
  /** Engine artifact version, for loader/artifact compatibility checks. */
  version(): string;
}

/**
 * Static surface of the wasm `ScalarField` class: the constructors that seed a
 * position-varying field. Each returns a fresh {@link WasmScalarField}; the ramp
 * constructors throw (as a JS exception) on an out-of-range axis. Structurally
 * satisfied by the generated `ScalarField` class.
 */
export interface WasmScalarFieldConstructor {
  constant(c: number): WasmScalarField;
  axial_ramp(axis: number, a: number, b: number, lo: number, hi: number): WasmScalarField;
  radial_ramp(
    cx: number,
    cy: number,
    cz: number,
    axis: number,
    r0: number,
    r1: number,
    lo: number,
    hi: number
  ): WasmScalarField;
  from_sdf(sdf: WasmSdf, scale: number, offset: number): WasmScalarField;
  clamp(field: WasmScalarField, min: number, max: number): WasmScalarField;
}

/**
 * An opaque position-varying scalar field. A value, not a builder (each constructor
 * returns a fresh field). Fed to the `Sdf` modulated operators
 * ({@link WasmSdf.offset_field} et al.) to vary an operator parameter per voxel.
 * `free()` releases the backing WASM allocation. Structurally satisfied by the
 * generated `ScalarField` wasm-bindgen class.
 */
export interface WasmScalarField {
  /** Release the backing WASM allocation (wasm-bindgen lifecycle). */
  free(): void;
  [Symbol.dispose](): void;
}

/**
 * Static surface of the wasm `Sdf` class: the primitive constructors that seed an
 * expression tree (centered at the origin unless noted). Each returns a fresh
 * {@link WasmSdf}. Structurally satisfied by the generated `Sdf` class.
 */
export interface WasmSdfConstructor {
  sphere(r: number): WasmSdf;
  box_(hx: number, hy: number, hz: number): WasmSdf;
  rounded_box(hx: number, hy: number, hz: number, r: number): WasmSdf;
  cylinder(r: number, h: number): WasmSdf;
  cone(r: number, h: number): WasmSdf;
  capsule(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    r: number
  ): WasmSdf;
  torus(major: number, minor: number): WasmSdf;
  plane(nx: number, ny: number, nz: number, h: number): WasmSdf;
  /**
   * Sweep an in-plane `profile` along `spine` (flat xyz, length 3·N, N >= 2)
   * using rotation-minimizing frames. `closed` skips the end caps. Throws (as a
   * JS exception) on fewer than two stations or a degenerate spine.
   */
  sweep(spine: Float64Array, profile: WasmSdf, closed: boolean): WasmSdf;
}

/**
 * An opaque analytic SDF expression. Every combinator CLONES into a new node and
 * returns a fresh `WasmSdf` (wasm-bindgen has no shared borrow across calls), so an
 * `Sdf` is a value, not a mutable builder. `rasterize` builds a banded-SDF
 * {@link WasmVoxelField}; `free()` releases the backing WASM expression tree.
 * Structurally satisfied by the generated `Sdf` wasm-bindgen class.
 */
export interface WasmSdf {
  union(other: WasmSdf): WasmSdf;
  intersection(other: WasmSdf): WasmSdf;
  difference(other: WasmSdf): WasmSdf;
  smooth_union(other: WasmSdf, k: number): WasmSdf;
  smooth_intersection(other: WasmSdf, k: number): WasmSdf;
  smooth_difference(other: WasmSdf, k: number): WasmSdf;
  offset(d: number): WasmSdf;
  round(r: number): WasmSdf;
  shell(t: number): WasmSdf;
  onion(t: number): WasmSdf;
  offset_field(f: WasmScalarField): WasmSdf;
  round_field(f: WasmScalarField): WasmSdf;
  shell_field(f: WasmScalarField): WasmSdf;
  smooth_union_field(other: WasmSdf, k: WasmScalarField): WasmSdf;
  translate(x: number, y: number, z: number): WasmSdf;
  rotate(ax: number, ay: number, az: number, angle: number): WasmSdf;
  scale(s: number): WasmSdf;
  /** Rasterize into a banded-SDF dense field over the expression's analytic bounds. */
  rasterize(resolution: number, padding: number): WasmVoxelField;
  /** Rasterize over explicit `[min..max]` bounds (clips unbounded primitives). */
  rasterize_in(
    min_x: number,
    min_y: number,
    min_z: number,
    max_x: number,
    max_y: number,
    max_z: number,
    resolution: number,
    padding: number
  ): WasmVoxelField;
  /** Release the backing WASM expression-tree allocation (wasm-bindgen lifecycle). */
  free(): void;
  [Symbol.dispose](): void;
}

/**
 * Constructor of the wasm `VoxelField` class. `new VoxelField(verts, tris, res,
 * padding)` voxelizes a mesh into a persistent dense field. Throws (as a JS
 * exception) on a non-dense grid or a grid over the voxel cap.
 */
export interface WasmVoxelFieldConstructor {
  new (verts: Float32Array, tris: Uint32Array, resolution: number, padding: number): WasmVoxelField;
  /**
   * Boolean two meshes onto ONE co-registered dense field (union bbox → voxelize
   * both onto a shared grid → combine), ready to chain. The correct path for
   * "boolean then offset/shell" two independently-described meshes, where
   * {@link WasmVoxelField.boolean} requires the operands to already share grid
   * geometry. `op`: 0=union, 1=intersection, 2=difference A−B.
   */
  boolean_of(
    verts_a: Float32Array,
    tris_a: Uint32Array,
    verts_b: Float32Array,
    tris_b: Uint32Array,
    op: number,
    resolution: number,
    padding: number
  ): WasmVoxelField;
}

/**
 * A persistent dense voxel field. All ops MUTATE IN PLACE (return void), so the
 * same grid persists across a chain. `contour()` reads the zero set into a fresh
 * {@link VoxelRepairResult}; `free()` releases the backing WASM grid (mandatory).
 * Structurally satisfied by the generated `VoxelField` wasm-bindgen class.
 */
export interface WasmVoxelField {
  /** CSG-combine in place (op: 0=union, 1=intersection, 2=difference self−B). */
  boolean(other: WasmVoxelField, op: number): void;
  /** Offset the surface in place (>0 outward, <0 inward); auto-reinits if dirty. */
  offset(distance: number): void;
  /** Hollow into an inward shell in place (thickness > 0); auto-reinits if dirty. */
  shell(thickness: number): void;
  /** Reinitialize φ to a true SDF (|∇φ|=1) while preserving the zero set. */
  reinit(): void;
  /** Surface-Nets contour the current field to a triangle mesh. */
  contour(): VoxelRepairResult;
  /** Release the backing WASM grid allocation (wasm-bindgen lifecycle). */
  free(): void;
  [Symbol.dispose](): void;
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
