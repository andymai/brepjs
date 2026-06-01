/**
 * Voxel / SDF geometry domain (ADR-0013).
 *
 * A parallel domain to the B-rep kernel: its own engine registry and functional
 * API. v1 surfaces the repair-slice keystone (Generalized Winding Number sign);
 * grid / contour / bridge seams land behind the same registry.
 */

export type { VoxelEngine, VoxelRepairResult } from './engine.js';
export type { VoxelMeshInput } from './signFns.js';
export type { RepairOptions } from './repairFns.js';

export { registerVoxel, getVoxel, getActiveVoxelId, initVoxel } from './registry.js';
export { windingNumbers, pointsInside } from './signFns.js';
export { repairMesh } from './repairFns.js';
