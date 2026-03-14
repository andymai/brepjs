/**
 * Barrel — re-exports all sub-interfaces and composes `KernelAdapter`.
 *
 * `KernelAdapter` is the intersection of 12 domain-aligned sub-interfaces
 * plus the {@link Kernel2DCapability} mixin. This decomposition follows the
 * Interface Segregation Principle and mirrors OCCT's modular package
 * structure (BRepAlgoAPI, BRepPrimAPI, BRepFilletAPI, etc.).
 *
 * @see docs/decisions/0007-kernel-interface-segregation.md
 */

import type { Kernel2DCapability } from '../kernel2dTypes.js';
import type { KernelBooleanOps } from './boolean-ops.js';
import type { KernelConstructionOps } from './construction-ops.js';
import type { KernelCore } from './core.js';
import type { KernelEvolutionOps } from './evolution-ops.js';
import type { KernelGeometryOps } from './geometry-ops.js';
import type { KernelIOOps } from './io-ops.js';
import type { KernelMeasureOps } from './measure-ops.js';
import type { KernelMeshOps } from './mesh-ops.js';
import type { KernelModifierOps } from './modifier-ops.js';
import type { KernelRepairOps } from './repair-ops.js';
import type { KernelSweepOps } from './sweep-ops.js';
import type { KernelTopologyOps } from './topology-ops.js';
import type { KernelTransformOps } from './transform-ops.js';

export type KernelAdapter = KernelCore &
  KernelBooleanOps &
  KernelConstructionOps &
  KernelSweepOps &
  KernelModifierOps &
  KernelTransformOps &
  KernelEvolutionOps &
  KernelMeshOps &
  KernelIOOps &
  KernelMeasureOps &
  KernelTopologyOps &
  KernelGeometryOps &
  KernelRepairOps &
  Kernel2DCapability;

export type { KernelBooleanOps } from './boolean-ops.js';
export type { KernelConstructionOps } from './construction-ops.js';
export type { KernelCore } from './core.js';
export type { KernelEvolutionOps } from './evolution-ops.js';
export type { KernelGeometryOps } from './geometry-ops.js';
export type { KernelIOOps } from './io-ops.js';
export type { KernelMeasureOps } from './measure-ops.js';
export type { KernelMeshOps } from './mesh-ops.js';
export type { KernelModifierOps } from './modifier-ops.js';
export type { KernelRepairOps } from './repair-ops.js';
export type { KernelSweepOps } from './sweep-ops.js';
export type { KernelTopologyOps } from './topology-ops.js';
export type { KernelTransformOps } from './transform-ops.js';
