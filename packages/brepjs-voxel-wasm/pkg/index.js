/* @ts-self-types="./index.d.ts" */

/**
 * Repaired triangle mesh handed back across the wasm boundary. wasm-bindgen
 * exposes the `Vec` getters as typed arrays (flat xyz positions/normals,
 * triangle-list indices). World-space coords; the bridge does not re-scale.
 */
export class RepairResult {
    static __wrap(ptr) {
        const obj = Object.create(RepairResult.prototype);
        obj.__wbg_ptr = ptr;
        RepairResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RepairResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_repairresult_free(ptr, 0);
    }
    /**
     * @returns {Uint32Array}
     */
    get indices() {
        const ret = wasm.repairresult_indices(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Float32Array}
     */
    get normals() {
        const ret = wasm.repairresult_normals(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Float32Array}
     */
    get positions() {
        const ret = wasm.repairresult_positions(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
}
if (Symbol.dispose) RepairResult.prototype[Symbol.dispose] = RepairResult.prototype.free;

/**
 * An opaque analytic SDF expression (the field-first authoring path, ADR-0013).
 * Wraps an immutable [`sdf::Expr`] tree built by the static primitive
 * constructors and grown by the combinator methods. Every method CLONES into a
 * fresh node and returns a new `Sdf` (wasm-bindgen has no shared borrow across
 * calls), so an `Sdf` is a value, not a mutable builder.
 */
export class Sdf {
    static __wrap(ptr) {
        const obj = Object.create(Sdf.prototype);
        obj.__wbg_ptr = ptr;
        SdfFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SdfFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_sdf_free(ptr, 0);
    }
    /**
     * @param {number} hx
     * @param {number} hy
     * @param {number} hz
     * @returns {Sdf}
     */
    static box_(hx, hy, hz) {
        const ret = wasm.sdf_box_(hx, hy, hz);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {number} ax
     * @param {number} ay
     * @param {number} az
     * @param {number} bx
     * @param {number} by
     * @param {number} bz
     * @param {number} r
     * @returns {Sdf}
     */
    static capsule(ax, ay, az, bx, by, bz, r) {
        const ret = wasm.sdf_capsule(ax, ay, az, bx, by, bz, r);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {number} r
     * @param {number} h
     * @returns {Sdf}
     */
    static cone(r, h) {
        const ret = wasm.sdf_cone(r, h);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {number} r
     * @param {number} h
     * @returns {Sdf}
     */
    static cylinder(r, h) {
        const ret = wasm.sdf_cylinder(r, h);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {Sdf} other
     * @returns {Sdf}
     */
    difference(other) {
        _assertClass(other, Sdf);
        const ret = wasm.sdf_difference(this.__wbg_ptr, other.__wbg_ptr);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {Sdf} other
     * @returns {Sdf}
     */
    intersection(other) {
        _assertClass(other, Sdf);
        const ret = wasm.sdf_intersection(this.__wbg_ptr, other.__wbg_ptr);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {number} d
     * @returns {Sdf}
     */
    offset(d) {
        const ret = wasm.sdf_offset(this.__wbg_ptr, d);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {number} t
     * @returns {Sdf}
     */
    onion(t) {
        const ret = wasm.sdf_onion(this.__wbg_ptr, t);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {number} nx
     * @param {number} ny
     * @param {number} nz
     * @param {number} h
     * @returns {Sdf}
     */
    static plane(nx, ny, nz, h) {
        const ret = wasm.sdf_plane(nx, ny, nz, h);
        return Sdf.__wrap(ret);
    }
    /**
     * Rasterize this expression into a persistent dense [`VoxelField`] using its
     * analytic bounds. The result is a true banded SDF, so the field starts clean
     * (`dirty: false`). Rejects a grid over the dense voxel cap with a clear
     * JsError, mirroring `VoxelField::new`.
     * @param {number} resolution
     * @param {number} padding
     * @returns {VoxelField}
     */
    rasterize(resolution, padding) {
        const ret = wasm.sdf_rasterize(this.__wbg_ptr, resolution, padding);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return VoxelField.__wrap(ret[0]);
    }
    /**
     * Rasterize this expression into a dense [`VoxelField`] over EXPLICIT bounds
     * `[min..max]`, for clipping unbounded primitives (a half-space) or framing a
     * custom region. Same banded SDF semantics as [`Sdf::rasterize`].
     * @param {number} min_x
     * @param {number} min_y
     * @param {number} min_z
     * @param {number} max_x
     * @param {number} max_y
     * @param {number} max_z
     * @param {number} resolution
     * @param {number} padding
     * @returns {VoxelField}
     */
    rasterize_in(min_x, min_y, min_z, max_x, max_y, max_z, resolution, padding) {
        const ret = wasm.sdf_rasterize_in(this.__wbg_ptr, min_x, min_y, min_z, max_x, max_y, max_z, resolution, padding);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return VoxelField.__wrap(ret[0]);
    }
    /**
     * @param {number} ax
     * @param {number} ay
     * @param {number} az
     * @param {number} angle
     * @returns {Sdf}
     */
    rotate(ax, ay, az, angle) {
        const ret = wasm.sdf_rotate(this.__wbg_ptr, ax, ay, az, angle);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {number} r
     * @returns {Sdf}
     */
    round(r) {
        const ret = wasm.sdf_round(this.__wbg_ptr, r);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {number} hx
     * @param {number} hy
     * @param {number} hz
     * @param {number} r
     * @returns {Sdf}
     */
    static rounded_box(hx, hy, hz, r) {
        const ret = wasm.sdf_rounded_box(hx, hy, hz, r);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {number} s
     * @returns {Sdf}
     */
    scale(s) {
        const ret = wasm.sdf_scale(this.__wbg_ptr, s);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {number} t
     * @returns {Sdf}
     */
    shell(t) {
        const ret = wasm.sdf_shell(this.__wbg_ptr, t);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {Sdf} other
     * @param {number} k
     * @returns {Sdf}
     */
    smooth_difference(other, k) {
        _assertClass(other, Sdf);
        const ret = wasm.sdf_smooth_difference(this.__wbg_ptr, other.__wbg_ptr, k);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {Sdf} other
     * @param {number} k
     * @returns {Sdf}
     */
    smooth_intersection(other, k) {
        _assertClass(other, Sdf);
        const ret = wasm.sdf_smooth_intersection(this.__wbg_ptr, other.__wbg_ptr, k);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {Sdf} other
     * @param {number} k
     * @returns {Sdf}
     */
    smooth_union(other, k) {
        _assertClass(other, Sdf);
        const ret = wasm.sdf_smooth_union(this.__wbg_ptr, other.__wbg_ptr, k);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {number} r
     * @returns {Sdf}
     */
    static sphere(r) {
        const ret = wasm.sdf_sphere(r);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {number} major
     * @param {number} minor
     * @returns {Sdf}
     */
    static torus(major, minor) {
        const ret = wasm.sdf_torus(major, minor);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Sdf}
     */
    translate(x, y, z) {
        const ret = wasm.sdf_translate(this.__wbg_ptr, x, y, z);
        return Sdf.__wrap(ret);
    }
    /**
     * @param {Sdf} other
     * @returns {Sdf}
     */
    union(other) {
        _assertClass(other, Sdf);
        const ret = wasm.sdf_union(this.__wbg_ptr, other.__wbg_ptr);
        return Sdf.__wrap(ret);
    }
}
if (Symbol.dispose) Sdf.prototype[Symbol.dispose] = Sdf.prototype.free;

/**
 * A persistent dense voxel field for same-grid op chains: voxelize a mesh once,
 * then boolean / offset / shell / reinit IN PLACE on the kept grid, and contour
 * it once at the end. The value-returning free functions above re-voxelize and
 * re-contour on every call; this handle keeps one grid so an offset/shell after
 * a boolean is both cheaper AND correct (it reinitializes the drifted gradient).
 *
 * Dense-only (v1): the persistent path wraps the dense [`Grid`] only, matching
 * boolean's dense-only scope. A grid whose bounds exceed the dense budget is
 * rejected at construction. wasm-bindgen auto-generates `.free()` (the struct
 * owns the grid's `Vec<f32>`).
 */
export class VoxelField {
    static __wrap(ptr) {
        const obj = Object.create(VoxelField.prototype);
        obj.__wbg_ptr = ptr;
        VoxelFieldFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        VoxelFieldFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_voxelfield_free(ptr, 0);
    }
    /**
     * CSG-combine this field with `other` IN PLACE (0=union, 1=intersection,
     * 2=difference self−other). Both operands MUST share grid geometry — same
     * origin, spacing, AND dims — or this errors (`GeometryMismatch`) rather than
     * silently blending mismatched coordinate frames. Two fields built by `new`
     * from DIFFERENT meshes generally do NOT share geometry (each sizes its grid
     * to its own bbox); use [`VoxelField::boolean_of`] for the easy co-registered
     * path. The min/max blend keeps the zero set exact but drifts the gradient
     * near the join, so this marks the field dirty (a subsequent offset/shell
     * auto-reinitializes).
     * @param {VoxelField} other
     * @param {number} op
     */
    boolean(other, op) {
        _assertClass(other, VoxelField);
        const ret = wasm.voxelfield_boolean(this.__wbg_ptr, other.__wbg_ptr, op);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Boolean two meshes onto ONE co-registered field, ready to chain. Mirrors
     * `voxel_boolean` (union bbox → voxelize BOTH onto one shared dense grid →
     * combine by `op`) but keeps the combined grid instead of contouring it, so
     * the result is directly chainable (`.offset()`, `.shell()`, `.contour()`).
     *
     * This is THE correct way to "boolean then chain offset/shell" two
     * independently-described meshes: a single shared grid means a single
     * coordinate frame, where the per-field `boolean` method requires the caller
     * to have already co-registered both operands onto matching grid geometry.
     *
     * `op`: 0=union, 1=intersection, 2=difference A−B. The combined field is
     * `dirty` (the min/max blend drifts the gradient), so a subsequent
     * offset/shell auto-reinitializes. Rejects `op > 2` and a grid over the
     * dense voxel cap (the persistent path is dense-only, like `new`).
     * @param {Float32Array} verts_a
     * @param {Uint32Array} tris_a
     * @param {Float32Array} verts_b
     * @param {Uint32Array} tris_b
     * @param {number} op
     * @param {number} resolution
     * @param {number} padding
     * @returns {VoxelField}
     */
    static boolean_of(verts_a, tris_a, verts_b, tris_b, op, resolution, padding) {
        const ptr0 = passArrayF32ToWasm0(verts_a, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray32ToWasm0(tris_a, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF32ToWasm0(verts_b, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray32ToWasm0(tris_b, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.voxelfield_boolean_of(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, op, resolution, padding);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return VoxelField.__wrap(ret[0]);
    }
    /**
     * Surface-Nets contour the current field to a triangle mesh. Borrows `&self`
     * so the field stays alive and chainable afterwards. Does NOT reinitialize:
     * the zero set is exact (boolean preserves it), and reinit only matters for a
     * SUBSEQUENT offset/shell.
     * @returns {RepairResult}
     */
    contour() {
        const ret = wasm.voxelfield_contour(this.__wbg_ptr);
        return RepairResult.__wrap(ret);
    }
    /**
     * Voxelize a mesh into a persistent dense field sized to its bbox. Mirrors
     * `offset_mesh`'s voxelize path (bbox → `Grid::for_bounds` → banded SDF) but
     * stops before contour and keeps the grid. The result IS a true banded SDF,
     * so `dirty` starts false.
     *
     * `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T.
     * `resolution` sizes the longest bbox axis; `padding` is the air-margin ring.
     * Errors if the grid would exceed the dense budget (the persistent path is
     * dense-only) or the voxel cap.
     * @param {Float32Array} verts
     * @param {Uint32Array} tris
     * @param {number} resolution
     * @param {number} padding
     */
    constructor(verts, tris, resolution, padding) {
        const ptr0 = passArrayF32ToWasm0(verts, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray32ToWasm0(tris, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.voxelfield_new(ptr0, len0, ptr1, len1, resolution, padding);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        VoxelFieldFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Offset (grow/shrink) the surface by `distance` via an iso-level shift
     * (`> 0` outward, `< 0` inward), IN PLACE. AUTO-REINITIALIZES first if the
     * field is dirty, so an iso-shift always rides a true SDF — this is what
     * makes offset-after-boolean correct without the caller intervening.
     *
     * The grid bounds are fixed at voxelize time, so a large outward offset can
     * clip at the padding ring; size resolution/padding for the intended offset.
     * @param {number} distance
     */
    offset(distance) {
        const ret = wasm.voxelfield_offset(this.__wbg_ptr, distance);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Explicitly reinitialize φ to a true SDF (|∇φ| = 1) while preserving the
     * zero set (Fast Sweeping). Idempotent on a clean field; clears `dirty`.
     */
    reinit() {
        wasm.voxelfield_reinit(this.__wbg_ptr);
    }
    /**
     * Hollow the field into an inward shell of wall `thickness`, IN PLACE.
     * AUTO-REINITIALIZES first if dirty. The `max(s, -(s + t))` re-introduces a
     * kink, so the field is dirty again afterwards.
     * @param {number} thickness
     */
    shell(thickness) {
        const ret = wasm.voxelfield_shell(this.__wbg_ptr, thickness);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) VoxelField.prototype[Symbol.dispose] = VoxelField.prototype.free;

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
 * @param {Float32Array} verts
 * @param {Uint32Array} tris
 * @param {number} resolution
 * @param {number} padding
 * @param {number} lattice_type
 * @param {number} period
 * @param {number} thickness
 * @returns {RepairResult}
 */
export function lattice_infill(verts, tris, resolution, padding, lattice_type, period, thickness) {
    const ptr0 = passArrayF32ToWasm0(verts, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray32ToWasm0(tris, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.lattice_infill(ptr0, len0, ptr1, len1, resolution, padding, lattice_type, period, thickness);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return RepairResult.__wrap(ret[0]);
}

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
 * @param {Float32Array} verts
 * @param {Uint32Array} tris
 * @param {number} distance
 * @param {number} resolution
 * @param {number} padding
 * @returns {RepairResult}
 */
export function offset_mesh(verts, tris, distance, resolution, padding) {
    const ptr0 = passArrayF32ToWasm0(verts, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray32ToWasm0(tris, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.offset_mesh(ptr0, len0, ptr1, len1, distance, resolution, padding);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return RepairResult.__wrap(ret[0]);
}

/**
 * Inside/outside classification per query point (winding number > 0.5).
 *
 * Returns length Q: 1 = inside, 0 = outside. This is the sign decision the
 * repair pipeline makes on non-watertight input.
 * @param {Float32Array} verts
 * @param {Uint32Array} tris
 * @param {Float32Array} queries
 * @returns {Uint8Array}
 */
export function points_inside(verts, tris, queries) {
    const ptr0 = passArrayF32ToWasm0(verts, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray32ToWasm0(tris, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF32ToWasm0(queries, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.points_inside(ptr0, len0, ptr1, len1, ptr2, len2);
    var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v4;
}

/**
 * Repair a (possibly non-watertight) mesh into a closed surface: voxelize the
 * FWN-signed SDF over a grid sized to the mesh bbox, then Surface-Nets contour
 * it back to triangles (world-space). `resolution` sizes the longest bbox axis;
 * `padding` is the positive air margin Surface Nets needs (>= 1 to avoid clip).
 *
 * `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T.
 * Errors (as a JS exception) if the grid exceeds the voxel cap.
 * @param {Float32Array} verts
 * @param {Uint32Array} tris
 * @param {number} resolution
 * @param {number} padding
 * @returns {RepairResult}
 */
export function repair_mesh(verts, tris, resolution, padding) {
    const ptr0 = passArrayF32ToWasm0(verts, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray32ToWasm0(tris, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.repair_mesh(ptr0, len0, ptr1, len1, resolution, padding);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return RepairResult.__wrap(ret[0]);
}

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
 * @param {Float32Array} verts
 * @param {Uint32Array} tris
 * @param {number} thickness
 * @param {number} resolution
 * @param {number} padding
 * @returns {RepairResult}
 */
export function shell_mesh(verts, tris, thickness, resolution, padding) {
    const ptr0 = passArrayF32ToWasm0(verts, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray32ToWasm0(tris, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.shell_mesh(ptr0, len0, ptr1, len1, thickness, resolution, padding);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return RepairResult.__wrap(ret[0]);
}

/**
 * The infinite TPMS lattice clipped to an axis-aligned box. Build a grid over
 * `[min..max]`, fill the chosen lattice shell field, Surface-Nets contour it.
 *
 * `lattice_type`: 0=Gyroid, 1=SchwarzP, 2=Diamond. `period` is the unit-cell size
 * (world units); `thickness` is the strut wall width in field units.
 * Errors (as a JS exception) on a bad lattice tag or a grid over the voxel cap.
 * @param {number} min_x
 * @param {number} min_y
 * @param {number} min_z
 * @param {number} max_x
 * @param {number} max_y
 * @param {number} max_z
 * @param {number} resolution
 * @param {number} padding
 * @param {number} lattice_type
 * @param {number} period
 * @param {number} thickness
 * @returns {RepairResult}
 */
export function tpms_box(min_x, min_y, min_z, max_x, max_y, max_z, resolution, padding, lattice_type, period, thickness) {
    const ret = wasm.tpms_box(min_x, min_y, min_z, max_x, max_y, max_z, resolution, padding, lattice_type, period, thickness);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return RepairResult.__wrap(ret[0]);
}

/**
 * Crate version, for the loader to assert artifact/loader compatibility.
 * @returns {string}
 */
export function version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Robust CSG boolean of two meshes via voxelized SDFs. Voxelize both meshes over
 * a shared grid sized to their UNION bbox, combine by `op`
 * (0=union, 1=intersection, 2=difference A−B), then Surface-Nets contour.
 *
 * `verts_a`/`verts_b`: flat xyz; `tris_a`/`tris_b`: flat vertex indices.
 * Errors (as a JS exception) on an unknown `op` tag, a dim mismatch, or a grid
 * over the voxel cap.
 * @param {Float32Array} verts_a
 * @param {Uint32Array} tris_a
 * @param {Float32Array} verts_b
 * @param {Uint32Array} tris_b
 * @param {number} op
 * @param {number} resolution
 * @param {number} padding
 * @returns {RepairResult}
 */
export function voxel_boolean(verts_a, tris_a, verts_b, tris_b, op, resolution, padding) {
    const ptr0 = passArrayF32ToWasm0(verts_a, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray32ToWasm0(tris_a, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF32ToWasm0(verts_b, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray32ToWasm0(tris_b, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.voxel_boolean(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, op, resolution, padding);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return RepairResult.__wrap(ret[0]);
}

/**
 * Winding number at each query point, against a triangle-soup mesh.
 *
 * `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T.
 * `queries`: flat xyz, length 3·Q. Returns length Q (winding number per query).
 * @param {Float32Array} verts
 * @param {Uint32Array} tris
 * @param {Float32Array} queries
 * @returns {Float32Array}
 */
export function winding_numbers(verts, tris, queries) {
    const ptr0 = passArrayF32ToWasm0(verts, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray32ToWasm0(tris, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF32ToWasm0(queries, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.winding_numbers(ptr0, len0, ptr1, len1, ptr2, len2);
    var v4 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v4;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_ef53bc310eb298a0: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_throw_1506f2235d1bdba0: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./index_bg.js": import0,
    };
}

const RepairResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_repairresult_free(ptr, 1));
const SdfFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_sdf_free(ptr, 1));
const VoxelFieldFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_voxelfield_free(ptr, 1));

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat32ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('index_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
