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
