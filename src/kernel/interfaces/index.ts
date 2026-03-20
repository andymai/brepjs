/**
 * Barrel — re-exports all sub-interfaces and composes `KernelAdapter`.
 *
 * `KernelAdapter` is the intersection of 14 domain-aligned sub-interfaces
 * plus the {@link Kernel2DCapability} mixin. This decomposition follows the
 * Interface Segregation Principle and mirrors OCCT's modular package
 * structure (BRepAlgoAPI, BRepPrimAPI, BRepFilletAPI, etc.).
 *
 * @see docs/decisions/0007-kernel-interface-segregation.md
 */

import type { Kernel2DCapability } from '@/kernel/kernel2dTypes.js';
import type { KernelBooleanOps } from './booleanOps.js';
import type { KernelBuilderOps } from './builderOps.js';
import type { KernelCore } from './core.js';
import type { KernelCurveOps } from './curveOps.js';
import type { KernelEvolutionOps } from './evolutionOps.js';
import type { KernelIOOps } from './ioOps.js';
import type { KernelMeasureOps } from './measureOps.js';
import type { KernelMeshOps } from './meshOps.js';
import type { KernelModifierOps } from './modifierOps.js';
import type { KernelPrimitiveOps } from './primitiveOps.js';
import type { KernelRepairOps } from './repairOps.js';
import type { KernelSurfaceOps } from './surfaceOps.js';
import type { KernelSweepOps } from './sweepOps.js';
import type { KernelTopologyOps } from './topologyOps.js';
import type { KernelTransformOps } from './transformOps.js';

export type KernelAdapter = KernelCore &
  KernelBooleanOps &
  KernelPrimitiveOps &
  KernelBuilderOps &
  KernelSweepOps &
  KernelModifierOps &
  KernelTransformOps &
  KernelEvolutionOps &
  KernelMeshOps &
  KernelIOOps &
  KernelMeasureOps &
  KernelTopologyOps &
  KernelCurveOps &
  KernelSurfaceOps &
  KernelRepairOps &
  Kernel2DCapability;

// --- New sub-interfaces ---
export type { KernelBooleanOps } from './booleanOps.js';
export type { KernelBuilderOps } from './builderOps.js';
export type { KernelCore } from './core.js';
export type { KernelCurveOps } from './curveOps.js';
export type { KernelEvolutionOps } from './evolutionOps.js';
export type { KernelIOOps } from './ioOps.js';
export type { BulkMeasurement, KernelMeasureOps } from './measureOps.js';
export type { KernelMeshOps } from './meshOps.js';
export type { KernelModifierOps } from './modifierOps.js';
export type { KernelPrimitiveOps } from './primitiveOps.js';
export type { KernelRepairOps } from './repairOps.js';
export type { KernelSurfaceOps } from './surfaceOps.js';
export type { KernelSweepOps } from './sweepOps.js';
export type { KernelTopologyOps } from './topologyOps.js';
export type { KernelTransformOps, TransformEntry } from './transformOps.js';
