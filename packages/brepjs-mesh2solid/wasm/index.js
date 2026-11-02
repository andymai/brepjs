/* @ts-self-types="./index.d.ts" */

/**
 * Freeform charts: each a disc of the mesh bounded by runs (polylines between
 * corners) it shares with its neighbours. Call `free()` when done.
 */
export class FreeformCharts {
    static __wrap(ptr) {
        const obj = Object.create(FreeformCharts.prototype);
        obj.__wbg_ptr = ptr;
        FreeformChartsFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        FreeformChartsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_freeformcharts_free(ptr, 0);
    }
    /**
     * Body (as in the Tier 0 result) of each chart.
     * @returns {Uint32Array}
     */
    get chart_bodies() {
        const ret = wasm.freeformcharts_chart_bodies(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Largest height of a chart's fitted points off its surface, per chart.
     * @returns {Float64Array}
     */
    get fit_errors() {
        const ret = wasm.freeformcharts_fit_errors(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Start of each run in `run_points` (in points), plus the end.
     * @returns {Uint32Array}
     */
    get run_offsets() {
        const ret = wasm.freeformcharts_run_offsets(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Flat xyz of every run, corner to corner.
     * @returns {Float64Array}
     */
    get run_points() {
        const ret = wasm.freeformcharts_run_points(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Start of each chart's sides in `sides`, plus the end.
     * @returns {Uint32Array}
     */
    get side_offsets() {
        const ret = wasm.freeformcharts_side_offsets(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Each chart's boundary loop in order: a run id, or `-(id + 1)` for a run
     * traversed backwards.
     * @returns {Int32Array}
     */
    get sides() {
        const ret = wasm.freeformcharts_sides(this.__wbg_ptr);
        var v1 = getArrayI32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Start of each chart's surface poles in `surface_poles` (in points),
     * plus the end. A chart's surface is a uniform cubic B-spline with k × k poles,
     * row by row, and knots -3, -2, ..., k each of multiplicity 1; none for
     * a chart too small to fit.
     * @returns {Uint32Array}
     */
    get surface_offsets() {
        const ret = wasm.freeformcharts_surface_offsets(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Flat xyz surface poles, chart by chart.
     * @returns {Float64Array}
     */
    get surface_poles() {
        const ret = wasm.freeformcharts_surface_poles(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
}
if (Symbol.dispose) FreeformCharts.prototype[Symbol.dispose] = FreeformCharts.prototype.free;

/**
 * Tier 0 conversion output. Region `r` owns loops in `loops` (encoded as
 * `[loopCount, len0, ...ids0, len1, ...ids1, ...]` per region, in order) and
 * triangles `triangle_offsets[r]..triangle_offsets[r + 1]`, counted in
 * triangles: its vertex indices are `triangles[3 * triangle_offsets[r]..3 *
 * triangle_offsets[r + 1]]`. Indices refer to `positions` (flat xyz, mm).
 */
export class Tier0Result {
    static __wrap(ptr) {
        const obj = Object.create(Tier0Result.prototype);
        obj.__wbg_ptr = ptr;
        Tier0ResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        Tier0ResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_tier0result_free(ptr, 0);
    }
    /**
     * @returns {Uint8Array}
     */
    get body_closed() {
        const ret = wasm.tier0result_body_closed(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Int32Array}
     */
    get body_parent() {
        const ret = wasm.tier0result_body_parent(this.__wbg_ptr);
        var v1 = getArrayI32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Float32Array}
     */
    get input_deviation() {
        const ret = wasm.tier0result_input_deviation(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Uint32Array}
     */
    get input_indices() {
        const ret = wasm.tier0result_input_indices(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    get input_positions() {
        const ret = wasm.tier0result_input_positions(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Uint32Array}
     */
    get loops() {
        const ret = wasm.tier0result_loops(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    get positions() {
        const ret = wasm.tier0result_positions(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Uint32Array}
     */
    get region_body() {
        const ret = wasm.tier0result_region_body(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {string}
     */
    get report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.tier0result_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Uint32Array}
     */
    get triangle_offsets() {
        const ret = wasm.tier0result_triangle_offsets(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Uint32Array}
     */
    get triangles() {
        const ret = wasm.tier0result_triangles(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
}
if (Symbol.dispose) Tier0Result.prototype[Symbol.dispose] = Tier0Result.prototype.free;

/**
 * Tier 1 session: the Tier 0 result plus the analytic segmentation, kept in
 * wasm memory so B-Rep assembly can ask which surface a sample point lies on.
 * Call `free()` when done.
 */
export class Tier1Session {
    static __wrap(ptr) {
        const obj = Object.create(Tier1Session.prototype);
        obj.__wbg_ptr = ptr;
        Tier1SessionFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        Tier1SessionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_tier1session_free(ptr, 0);
    }
    /**
     * Body index (as in the Tier 0 result's bodies) nearest each flat xyz point, or -1.
     * @param {Float64Array} points
     * @returns {Float64Array}
     */
    bodies_of(points) {
        const ptr0 = passArrayF64ToWasm0(points, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tier1session_bodies_of(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * 1 per closed body, 0 per open one, as in the Tier 0 result.
     * @returns {Uint8Array}
     */
    get body_closed() {
        const ret = wasm.tier1session_body_closed(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Cavity parent per body (-1 for a top-level body), as in the Tier 0 result.
     * @returns {Int32Array}
     */
    get body_parent() {
        const ret = wasm.tier1session_body_parent(this.__wbg_ptr);
        var v1 = getArrayI32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Every body split into freeform charts for a B-spline rebuild, or
     * `undefined` when the mesh doesn't split into few enough discs.
     * @returns {FreeformCharts | undefined}
     */
    charts() {
        const ret = wasm.tier1session_charts(this.__wbg_ptr);
        return ret === 0 ? undefined : FreeformCharts.__wrap(ret);
    }
    /**
     * Deviation JSON between the input mesh and a candidate triangulation.
     * @param {Float64Array} positions
     * @param {Uint32Array} indices
     * @returns {string}
     */
    deviation(positions, indices) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passArrayF64ToWasm0(positions, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray32ToWasm0(indices, wasm.__wbindgen_malloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.tier1session_deviation(this.__wbg_ptr, ptr0, len0, ptr1, len1);
            deferred3_0 = ret[0];
            deferred3_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Per input vertex distance to the last triangulation passed to `deviation`
     * (empty unless the session was created with a heatmap).
     * @returns {Float32Array}
     */
    get measured_deviation() {
        const ret = wasm.tier1session_measured_deviation(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * For flat xyz `points`: (surface id or -1, distance to the mesh) per point.
     * @param {Float64Array} points
     * @returns {Float64Array}
     */
    nearest(points) {
        const ptr0 = passArrayF64ToWasm0(points, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tier1session_nearest(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Like `nearest`, but labels each point with the fitted surface closest
     * to its nearest mesh point (robust to fuzzy region boundaries on scans).
     * @param {Float64Array} points
     * @returns {Float64Array}
     */
    nearest_by_surface(points) {
        const ptr0 = passArrayF64ToWasm0(points, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tier1session_nearest_by_surface(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v2;
    }
    /**
     * Largest gap between a fitted mesh triangle and its exact surface.
     * @returns {number}
     */
    get sag() {
        const ret = wasm.tier1session_sag(this.__wbg_ptr);
        return ret;
    }
    /**
     * Bounding box (min xyz, max xyz) of each surface's mesh region.
     * @returns {Float64Array}
     */
    get surface_bounds() {
        const ret = wasm.tier1session_surface_bounds(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Kind per surface: 0 plane, 1 cylinder, 2 sphere, 3 cone, 4 torus.
     * @returns {Uint8Array}
     */
    get surface_kinds() {
        const ret = wasm.tier1session_surface_kinds(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Eight parameter slots per surface. Plane: normal, offset. Cylinder: axis
     * point, axis, radius. Sphere: center, radius. Cone: apex, axis (into the
     * opening), half-angle. Torus: center, axis, major, minor.
     * @returns {Float64Array}
     */
    get surface_params() {
        const ret = wasm.tier1session_surface_params(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * The whole-mesh Tier 0 result, the fallback when Tier 1 can't rebuild.
     * @returns {Tier0Result}
     */
    tier0() {
        const ret = wasm.tier1session_tier0(this.__wbg_ptr);
        return Tier0Result.__wrap(ret);
    }
    /**
     * @returns {string}
     */
    get tier1_report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.tier1session_tier1_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get tolerance() {
        const ret = wasm.tier1session_tolerance(this.__wbg_ptr);
        return ret;
    }
    /**
     * Share of the mesh area no fitted surface covers.
     * @returns {number}
     */
    get unfit_area() {
        const ret = wasm.tier1session_unfit_area(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get unfit_triangles() {
        const ret = wasm.tier1session_unfit_triangles(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) Tier1Session.prototype[Symbol.dispose] = Tier1Session.prototype.free;

/**
 * Run the Tier 0 pipeline on raw file bytes.
 *
 * `unit`: "auto" or one of um/mm/cm/m/in/ft. `tolerance`: millimeters, or
 * NaN/≤0 to estimate it. `fill_holes`: -1 fills every hole, 0 none, n > 0
 * holes with at most n edges. `heatmap` returns the welded input mesh with each
 * vertex's distance to the result.
 * @param {Uint8Array} bytes
 * @param {string} format_hint
 * @param {string} unit
 * @param {number} tolerance
 * @param {number} max_triangles
 * @param {number} fill_holes
 * @param {boolean} heatmap
 * @returns {Tier0Result}
 */
export function convert_tier0(bytes, format_hint, unit, tolerance, max_triangles, fill_holes, heatmap) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(format_hint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(unit, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.convert_tier0(ptr0, len0, ptr1, len1, ptr2, len2, tolerance, max_triangles, fill_holes, heatmap);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Tier0Result.__wrap(ret[0]);
}

/**
 * Run Tier 0 and the Tier 1 segmentation. Arguments as for `convert_tier0`.
 * @param {Uint8Array} bytes
 * @param {string} format_hint
 * @param {string} unit
 * @param {number} tolerance
 * @param {number} max_triangles
 * @param {number} fill_holes
 * @param {boolean} heatmap
 * @returns {Tier1Session}
 */
export function convert_tier1(bytes, format_hint, unit, tolerance, max_triangles, fill_holes, heatmap) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(format_hint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(unit, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.convert_tier1(ptr0, len0, ptr1, len1, ptr2, len2, tolerance, max_triangles, fill_holes, heatmap);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Tier1Session.__wrap(ret[0]);
}

/**
 * Format, declared unit, triangle count, and bounding box of a mesh file, as
 * JSON (see `pipeline::inspect`).
 * @param {Uint8Array} bytes
 * @param {string} format_hint
 * @returns {string}
 */
export function inspect(bytes, format_hint) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(format_hint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.inspect(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
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
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_67e7344beaa85059: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_throw_5d9e815e6fdf150f: function(arg0, arg1) {
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

const FreeformChartsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_freeformcharts_free(ptr, 1));
const Tier0ResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_tier0result_free(ptr, 1));
const Tier1SessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_tier1session_free(ptr, 1));

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayI32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
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

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

let cachedInt32ArrayMemory0 = null;
function getInt32ArrayMemory0() {
    if (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.byteLength === 0) {
        cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32ArrayMemory0;
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

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
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

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat32ArrayMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedInt32ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

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
