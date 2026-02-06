/**
 * Plane type definitions — immutable plain objects.
 * Replaces the old Plane class.
 */

import type { Vec3 } from './types.js';

/** Immutable plane defined by origin and three orthogonal direction vectors. */
export interface Plane {
  readonly origin: Vec3;
  readonly xDir: Vec3;
  readonly yDir: Vec3;
  readonly zDir: Vec3;
}

/**
 * Named standard planes.
 *
 * Axis pairs (`'XY'`, `'YZ'`, …) and view names (`'front'`, `'top'`, …)
 * are both supported. The axis-pair order determines the normal direction.
 */
export type PlaneName =
  | 'XY'
  | 'YZ'
  | 'ZX'
  | 'XZ'
  | 'YX'
  | 'ZY'
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom';

/** Accept either an explicit {@link Plane} object or a {@link PlaneName} string. */
export type PlaneInput = Plane | PlaneName;
