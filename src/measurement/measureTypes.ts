/**
 * Type definitions for measurement results.
 *
 * Extracted from measureFns.ts for reuse by measureCache.ts.
 */

import type { Vec3 } from '@/core/types.js';

/** Base physical properties returned by BRepGProp measurements. */
export interface PhysicalProps {
  /** Raw mass property from BRepGProp (volume, area, or length depending on measurement type). */
  readonly mass: number;
  /** Center of mass as an [x, y, z] tuple. */
  readonly centerOfMass: Vec3;
}

/** Volume properties with a domain-specific `volume` alias. */
export interface VolumeProps extends PhysicalProps {
  readonly volume: number;
}

/** Surface properties with a domain-specific `area` alias. */
export interface SurfaceProps extends PhysicalProps {
  readonly area: number;
}

/** Linear properties with a domain-specific `length` alias. */
export interface LinearProps extends PhysicalProps {
  readonly length: number;
}

/** Distance measurement result including witness points. */
export interface DistanceProps {
  /** The minimum distance between the two shapes. */
  readonly distance: number;
  /** Closest point on the first shape. */
  readonly point1: Vec3;
  /** Closest point on the second shape. */
  readonly point2: Vec3;
}
