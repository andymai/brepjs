/**
 * Functional modifier operations — fillet, chamfer, shell, thicken, offset.
 *
 * These are standalone functions that operate on branded shape types
 * and return Result values.
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { castShape } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { occtError } from '../core/errors.js';

/**
 * Thickens a surface (face or shell) into a solid by offsetting it.
 *
 * Takes a planar or non-planar surface shape and creates a solid
 * by offsetting it by the given thickness. Positive thickness offsets
 * along the surface normal; negative thickness offsets against it.
 */
export function thickenSurface(shape: AnyShape, thickness: number): Result<AnyShape> {
  try {
    const kernel = getKernel();
    const resultOc = kernel.thicken(shape.wrapped, thickness);
    return ok(castShape(resultOc));
  } catch (e) {
    return err(
      occtError(
        'THICKEN_FAILED',
        `Thicken operation failed: ${e instanceof Error ? e.message : String(e)}`
      )
    );
  }
}
