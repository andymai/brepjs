/**
 * Standalone functions for 2D boolean operations.
 * Delegates to the existing fuse2D/cut2D/intersect2D implementations.
 */

import type Blueprint from './Blueprint.js';
import type Blueprints from './Blueprints.js';
import type CompoundBlueprint from './CompoundBlueprint.js';
import { fuse2D, cut2D, intersect2D, type Shape2D } from './boolean2D.js';

/** Fuse (union) two 2D shapes. */
export function fuseBlueprint2D(
  a: Blueprint | CompoundBlueprint | Blueprints,
  b: Blueprint | CompoundBlueprint | Blueprints
): Shape2D {
  return fuse2D(a, b);
}

/** Cut (difference) a 2D shape from another. */
export function cutBlueprint2D(
  base: Blueprint | CompoundBlueprint | Blueprints,
  tool: Blueprint | CompoundBlueprint | Blueprints
): Shape2D {
  return cut2D(base, tool);
}

/** Intersect two 2D shapes. */
export function intersectBlueprint2D(
  a: Blueprint | CompoundBlueprint | Blueprints,
  b: Blueprint | CompoundBlueprint | Blueprints
): Shape2D {
  return intersect2D(a, b);
}
