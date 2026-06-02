/**
 * Lattice / TPMS geometry domain (ADR-0013, Layer 3).
 *
 * Builds triangle meshes from triply-periodic minimal surfaces, either filling a
 * solid (infill) or clipped to a box. Sits on the voxel domain's FWN-signed grid
 * and Surface-Nets contour, surfaced through the shared voxel engine registry.
 */

export { latticeInfill, latticeInfillShape, tpmsLattice } from './latticeFns.js';
export type { LatticeType, LatticeOptions, LatticeBounds } from './latticeFns.js';
