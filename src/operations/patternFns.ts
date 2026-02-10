/**
 * Pattern operations — linear and circular array replication.
 * Composes translate/rotate transforms with boolean fuse.
 */

import type { Vec3 } from '../core/types.js';
import type { Shape3D } from '../core/shapeTypes.js';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { vecScale, vecNormalize, vecIsZero } from '../core/vecOps.js';
import { translate, rotate } from '../topology/shapeFns.js';
import { fuseAll, type BooleanOptions } from '../topology/booleanFns.js';
import { validationError } from '../core/errors.js';

/**
 * Create a linear pattern of a shape along a direction.
 *
 * @param shape - The shape to replicate
 * @param direction - Direction vector for the pattern
 * @param count - Total number of copies (including the original)
 * @param spacing - Distance between each copy along the direction
 * @param options - Boolean options for the fuse operation
 * @returns Fused shape of all copies
 */
export function linearPattern(
  shape: Shape3D,
  direction: Vec3,
  count: number,
  spacing: number,
  options?: BooleanOptions
): Result<Shape3D> {
  if (count < 1)
    return err(validationError('PATTERN_INVALID_COUNT', 'Pattern count must be at least 1'));
  if (count === 1) return ok(shape);
  if (vecIsZero(direction))
    return err(validationError('PATTERN_ZERO_DIRECTION', 'Pattern direction cannot be zero'));

  const dir = vecNormalize(direction);
  const copies: Shape3D[] = [shape];

  for (let i = 1; i < count; i++) {
    const offset = vecScale(dir, spacing * i);
    copies.push(translate(shape, offset));
  }

  return fuseAll(copies, options);
}

/**
 * Create a circular pattern of a shape around an axis.
 *
 * @param shape - The shape to replicate
 * @param axis - Rotation axis direction
 * @param count - Total number of copies (including the original)
 * @param fullAngle - Total angle to spread copies over in degrees (default: 360)
 * @param center - Center point of rotation (default: [0,0,0])
 * @param options - Boolean options for the fuse operation
 * @returns Fused shape of all copies
 */
export function circularPattern(
  shape: Shape3D,
  axis: Vec3,
  count: number,
  fullAngle: number = 360,
  center: Vec3 = [0, 0, 0],
  options?: BooleanOptions
): Result<Shape3D> {
  if (count < 1)
    return err(validationError('PATTERN_INVALID_COUNT', 'Pattern count must be at least 1'));
  if (count === 1) return ok(shape);
  if (vecIsZero(axis))
    return err(validationError('PATTERN_ZERO_AXIS', 'Pattern axis cannot be zero'));

  const angleStep = fullAngle / count;
  const copies: Shape3D[] = [shape];

  for (let i = 1; i < count; i++) {
    copies.push(rotate(shape, angleStep * i, center, axis));
  }

  return fuseAll(copies, options);
}
