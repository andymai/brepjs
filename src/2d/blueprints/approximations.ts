import type { ApproximationOptions } from '../lib/index.js';
import { approximateAsSvgCompatibleCurve } from '../lib/index.js';
import Blueprint from './Blueprint.js';
import Blueprints from './Blueprints.js';
import type { Shape2D } from './boolean2D.js';
import CompoundBlueprint from './CompoundBlueprint.js';

/**
 * Replace curves that have no native SVG equivalent with polyline/arc approximations.
 *
 * Processes all curves within a {@link Shape2D} (Blueprint, CompoundBlueprint,
 * or Blueprints) so the result can be faithfully rendered as SVG paths.
 *
 * @typeParam T - Preserves the concrete Shape2D subtype through the transform.
 * @param bp - The shape whose curves should be approximated.
 * @param options - Tolerance and segmentation settings for the approximation.
 * @returns A new shape of the same type with SVG-compatible curves.
 */
export function approximateForSVG<T extends Shape2D>(bp: T, options: ApproximationOptions): T {
  if (bp instanceof Blueprint) {
    return new Blueprint(approximateAsSvgCompatibleCurve(bp.curves, options)) as T;
  } else if (bp instanceof CompoundBlueprint) {
    return new CompoundBlueprint(bp.blueprints.map((b) => approximateForSVG(b, options))) as T;
  } else if (bp instanceof Blueprints) {
    return new Blueprints(bp.blueprints.map((b) => approximateForSVG(b, options))) as T;
  }
  return bp;
}
