/**
 * Curve-based positioning operations.
 */

import { getKernel } from '@/kernel/index.js';
import type { Shape3D, Edge, Wire } from '@/core/shapeTypes.js';
import { castResultShape, disposeResultShape, isShape3D } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { kernelError, BrepErrorCode } from '@/core/errors.js';

/**
 * Position a shape at a point along a spine curve with Frenet frame orientation.
 *
 * The shape is translated and rotated so its origin aligns with the curve point
 * and its Z axis aligns with the curve tangent at the given parameter.
 *
 * @param shape - The shape to position.
 * @param spine - The spine curve (Edge or Wire) to position along.
 * @param param - Normalized parameter (0 = start, 1 = end).
 * @returns The repositioned shape.
 */
export function positionOnCurve(
  shape: Shape3D,
  spine: Edge | Wire,
  param: number
): Result<Shape3D> {
  try {
    const kernel = getKernel();
    const result = kernel.positionOnCurve(shape.wrapped, spine.wrapped, param);
    const wrapped = castResultShape(result);
    if (!isShape3D(wrapped)) {
      disposeResultShape(wrapped);
      return err(
        kernelError(
          BrepErrorCode.POSITION_ON_CURVE_FAILED,
          'positionOnCurve did not produce a 3D shape'
        )
      );
    }
    return ok(wrapped);
  } catch (e) {
    return err(
      kernelError(
        BrepErrorCode.POSITION_ON_CURVE_FAILED,
        `Failed to position shape on curve at param ${param}`,
        e
      )
    );
  }
}
