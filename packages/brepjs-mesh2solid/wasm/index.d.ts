/* tslint:disable */
/* eslint-disable */

/**
 * Freeform charts: each a disc of the mesh bounded by runs (polylines between
 * corners) it shares with its neighbours. Call `free()` when done.
 */
export class FreeformCharts {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Body (as in the Tier 0 result) of each chart.
     */
    readonly chart_bodies: Uint32Array;
    /**
     * Largest height of a chart's fitted points off its surface, per chart.
     */
    readonly fit_errors: Float64Array;
    /**
     * Start of each run in `run_points` (in points), plus the end.
     */
    readonly run_offsets: Uint32Array;
    /**
     * Flat xyz of every run, corner to corner.
     */
    readonly run_points: Float64Array;
    /**
     * Start of each chart's sides in `sides`, plus the end.
     */
    readonly side_offsets: Uint32Array;
    /**
     * Each chart's boundary loop in order: a run id, or `-(id + 1)` for a run
     * traversed backwards.
     */
    readonly sides: Int32Array;
    /**
     * Start of each chart's surface poles in `surface_poles` (in points),
     * plus the end. A chart's surface is a uniform cubic B-spline with k × k poles,
     * row by row, and knots -3, -2, ..., k each of multiplicity 1; none for
     * a chart too small to fit.
     */
    readonly surface_offsets: Uint32Array;
    /**
     * Flat xyz surface poles, chart by chart.
     */
    readonly surface_poles: Float64Array;
}

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
 * Tier 1 session: the Tier 0 result plus the analytic segmentation, kept in
 * wasm memory so B-Rep assembly can ask which surface a sample point lies on.
 * Call `free()` when done.
 */
export class Tier1Session {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Body index (as in the Tier 0 result's bodies) nearest each flat xyz point, or -1.
     */
    bodies_of(points: Float64Array): Float64Array;
    /**
     * Every body split into freeform charts for a B-spline rebuild, or
     * `undefined` when the mesh doesn't split into few enough discs.
     */
    charts(): FreeformCharts | undefined;
    /**
     * Deviation JSON between the input mesh and a candidate triangulation.
     */
    deviation(positions: Float64Array, indices: Uint32Array): string;
    /**
     * For flat xyz `points`: (surface id or -1, distance to the mesh) per point.
     */
    nearest(points: Float64Array): Float64Array;
    /**
     * Like `nearest`, but labels each point with the fitted surface closest
     * to its nearest mesh point (robust to fuzzy region boundaries on scans).
     */
    nearest_by_surface(points: Float64Array): Float64Array;
    /**
     * The whole-mesh Tier 0 result, the fallback when Tier 1 can't rebuild.
     */
    tier0(): Tier0Result;
    /**
     * 1 per closed body, 0 per open one, as in the Tier 0 result.
     */
    readonly body_closed: Uint8Array;
    /**
     * Cavity parent per body (-1 for a top-level body), as in the Tier 0 result.
     */
    readonly body_parent: Int32Array;
    /**
     * Per input vertex distance to the last triangulation passed to `deviation`
     * (empty unless the session was created with a heatmap).
     */
    readonly measured_deviation: Float32Array;
    /**
     * Largest gap between a fitted mesh triangle and its exact surface.
     */
    readonly sag: number;
    /**
     * Bounding box (min xyz, max xyz) of each surface's mesh region.
     */
    readonly surface_bounds: Float64Array;
    /**
     * Kind per surface: 0 plane, 1 cylinder, 2 sphere, 3 cone, 4 torus.
     */
    readonly surface_kinds: Uint8Array;
    /**
     * Eight parameter slots per surface. Plane: normal, offset. Cylinder: axis
     * point, axis, radius. Sphere: center, radius. Cone: apex, axis (into the
     * opening), half-angle. Torus: center, axis, major, minor.
     */
    readonly surface_params: Float64Array;
    readonly tier1_report: string;
    readonly tolerance: number;
    /**
     * Share of the mesh area no fitted surface covers.
     */
    readonly unfit_area: number;
    readonly unfit_triangles: number;
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

/**
 * Run Tier 0 and the Tier 1 segmentation. Arguments as for `convert_tier0`.
 */
export function convert_tier1(bytes: Uint8Array, format_hint: string, unit: string, tolerance: number, max_triangles: number, fill_holes: number, heatmap: boolean): Tier1Session;

/**
 * Format, declared unit, triangle count, and bounding box of a mesh file, as
 * JSON (see `pipeline::inspect`).
 */
export function inspect(bytes: Uint8Array, format_hint: string): string;

export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_freeformcharts_free: (a: number, b: number) => void;
    readonly __wbg_tier0result_free: (a: number, b: number) => void;
    readonly __wbg_tier1session_free: (a: number, b: number) => void;
    readonly convert_tier0: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number];
    readonly convert_tier1: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number];
    readonly freeformcharts_chart_bodies: (a: number) => [number, number];
    readonly freeformcharts_fit_errors: (a: number) => [number, number];
    readonly freeformcharts_run_offsets: (a: number) => [number, number];
    readonly freeformcharts_run_points: (a: number) => [number, number];
    readonly freeformcharts_side_offsets: (a: number) => [number, number];
    readonly freeformcharts_sides: (a: number) => [number, number];
    readonly freeformcharts_surface_offsets: (a: number) => [number, number];
    readonly freeformcharts_surface_poles: (a: number) => [number, number];
    readonly inspect: (a: number, b: number, c: number, d: number) => [number, number, number, number];
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
    readonly tier1session_bodies_of: (a: number, b: number, c: number) => [number, number];
    readonly tier1session_body_closed: (a: number) => [number, number];
    readonly tier1session_body_parent: (a: number) => [number, number];
    readonly tier1session_charts: (a: number) => number;
    readonly tier1session_deviation: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly tier1session_measured_deviation: (a: number) => [number, number];
    readonly tier1session_nearest: (a: number, b: number, c: number) => [number, number];
    readonly tier1session_nearest_by_surface: (a: number, b: number, c: number) => [number, number];
    readonly tier1session_sag: (a: number) => number;
    readonly tier1session_surface_bounds: (a: number) => [number, number];
    readonly tier1session_surface_kinds: (a: number) => [number, number];
    readonly tier1session_surface_params: (a: number) => [number, number];
    readonly tier1session_tier0: (a: number) => number;
    readonly tier1session_tier1_report: (a: number) => [number, number];
    readonly tier1session_tolerance: (a: number) => number;
    readonly tier1session_unfit_area: (a: number) => number;
    readonly tier1session_unfit_triangles: (a: number) => number;
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
