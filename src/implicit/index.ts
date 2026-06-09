/**
 * Field-first implicit CAD domain (ADR-0013, brepjs-implicit Phase 1).
 *
 * An analytic SDF expression tree that rasterizes DIRECTLY into the voxel
 * substrate's dense grid with no input mesh — the field-first twin of the
 * mesh-first voxel path. Primitives compose through CSG / smooth / domain
 * combinators into an {@link SdfHandle}, which rasterizes to a banded-SDF
 * {@link VoxelFieldHandle} for contour / offset / shell.
 */

export type { SdfHandle, SdfBounds, SdfSweepOptions, ScalarFieldHandle } from './sdfFns.js';
export { sphere, box, roundedBox, cylinder, cone, capsule, torus, plane, sweep } from './sdfFns.js';
export { fieldConst, fieldAxialRamp, fieldRadialRamp, fieldFromSdf, fieldClamp } from './sdfFns.js';
