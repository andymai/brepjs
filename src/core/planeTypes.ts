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

export type PlaneInput = Plane | PlaneName;
