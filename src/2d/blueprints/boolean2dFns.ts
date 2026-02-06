/**
 * Standalone functions for 2D boolean operations.
 *
 * Thin functional wrappers around the OOP boolean API in `boolean2D.ts`.
 *
 * @see {@link fuse2D}, {@link cut2D}, {@link intersect2D} for the underlying implementations.
 */

import type Blueprint from './Blueprint.js';
import type Blueprints from './Blueprints.js';
import type CompoundBlueprint from './CompoundBlueprint.js';
import { fuse2D, cut2D, intersect2D, type Shape2D } from './boolean2D.js';

/**
 * Compute the boolean union of two 2D shapes.
 *
 * @returns The fused shape, or `null` if the result is empty.
 * @see {@link fuse2D}
 *
 * @example
 * ```ts
 * const union = fuseBlueprint2D(circle, rectangle);
 * ```
 */
export function fuseBlueprint2D(
  a: Blueprint | CompoundBlueprint | Blueprints,
  b: Blueprint | CompoundBlueprint | Blueprints
): Shape2D {
  return fuse2D(a, b);
}

/**
 * Compute the boolean difference of two 2D shapes (base minus tool).
 *
 * @param base - The shape to cut from.
 * @param tool - The shape to subtract.
 * @returns The remaining shape, or `null` if nothing remains.
 * @see {@link cut2D}
 *
 * @example
 * ```ts
 * const withHole = cutBlueprint2D(outerRect, innerCircle);
 * ```
 */
export function cutBlueprint2D(
  base: Blueprint | CompoundBlueprint | Blueprints,
  tool: Blueprint | CompoundBlueprint | Blueprints
): Shape2D {
  return cut2D(base, tool);
}

/**
 * Compute the boolean intersection of two 2D shapes.
 *
 * @returns The overlapping region, or `null` if the shapes do not overlap.
 * @see {@link intersect2D}
 *
 * @example
 * ```ts
 * const overlap = intersectBlueprint2D(circle, rectangle);
 * ```
 */
export function intersectBlueprint2D(
  a: Blueprint | CompoundBlueprint | Blueprints,
  b: Blueprint | CompoundBlueprint | Blueprints
): Shape2D {
  return intersect2D(a, b);
}
