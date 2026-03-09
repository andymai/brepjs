/**
 * 2D vector/point math — re-exports from the canonical Layer 0 source.
 *
 * ADR-0006: src/utils/vec2d.ts is the single source of truth.
 * This file re-exports everything for backward compatibility, with
 * normalize2d overridden to throw on zero-length (Layer 2 can use bug()).
 */

import type { Point2D } from './definitions.js';
import { bug } from '../../core/errors.js';
import { distance2d } from '../../utils/vec2d.js';

export {
  samePoint,
  add2d,
  subtract2d,
  scalarMultiply2d,
  distance2d,
  squareDistance2d,
  crossProduct2d,
  dotProduct2d,
  angle2d,
  polarAngle2d,
  rotate2d,
  polarToCartesian,
  cartesianToPolar,
} from '../../utils/vec2d.js';

/**
 * Normalize a 2D vector to unit length.
 *
 * @throws When the vector has near-zero length.
 */
export const normalize2d = ([x0, y0]: Point2D): Point2D => {
  const l = distance2d([x0, y0]);
  if (l < 1e-12) {
    bug('normalize2d', 'Cannot normalize zero-length vector');
  }
  return [x0 / l, y0 / l];
};
