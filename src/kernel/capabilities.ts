/**
 * Kernel capability flags — let callers route work by what a kernel *is*, not by
 * its id. The headline need: send export/measurement to an exact B-rep kernel
 * and fast previews to a mesh kernel without hard-coding `'manifold'` vs
 * `'occt-wasm'` at every call site.
 *
 * `tessellationModel` also tells the quality layer (see {@link ./quality.js})
 * *how* a kernel's mesh resolution is controlled:
 * - `'build-time'`  — the mesh is fixed when the solid is built (e.g. Manifold's
 *   global circular-segment setting); quality must be applied *before* building.
 * - `'extract-time'`— the shape is exact and tessellated on demand with a
 *   per-call deflection (e.g. OCCT); quality is the default deflection at
 *   `mesh()`/export time.
 * - `'none'`        — no tessellation control (or not a meshing kernel).
 * @module
 */

export type TessellationModel = 'build-time' | 'extract-time' | 'none';

export interface KernelCapabilities {
  /** Exact B-rep geometry (vs. a mesh approximation). */
  readonly exact: boolean;
  /** Can serialize to B-rep exchange formats (BREP/STEP). */
  readonly brepExport: boolean;
  /** Volume/area/length match the analytic value (vs. mesh-approximate). */
  readonly exactMeasurement: boolean;
  /** How tessellation resolution is controlled — see module docs. */
  readonly tessellationModel: TessellationModel;
}

/** Default for an exact B-rep kernel (OCCT family, brepkit). */
export const EXACT_BREP_CAPABILITIES: KernelCapabilities = {
  exact: true,
  brepExport: true,
  exactMeasurement: true,
  tessellationModel: 'extract-time',
};

/**
 * Conservative fallback for a kernel that doesn't declare capabilities: assume
 * exact B-rep so export/measurement aren't wrongly blocked, but claim no
 * tessellation control.
 */
export const DEFAULT_CAPABILITIES: KernelCapabilities = {
  exact: true,
  brepExport: true,
  exactMeasurement: true,
  tessellationModel: 'none',
};
