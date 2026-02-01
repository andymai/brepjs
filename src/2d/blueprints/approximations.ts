import type { ApproximationOptions } from '../lib/index.js';
import { approximateAsSvgCompatibleCurve } from '../lib/index.js';
import Blueprint from './Blueprint.js';
import Blueprints from './Blueprints.js';
import type { Shape2D } from './boolean2D.js';
import CompoundBlueprint from './CompoundBlueprint.js';

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
