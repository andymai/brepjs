/**
 * Functional convex hull operation.
 *
 * Computes the 3D convex hull of one or more shapes using QuickHull.
 */

import { getKernel } from '../kernel/index.js';
import type { KernelShape } from '../kernel/types.js';
import type { Solid, AnyShape } from '../core/shapeTypes.js';
import { castShape, isSolid } from '../core/shapeTypes.js';
import { type Result, ok, err, isErr } from '../core/result.js';
import { validationError, kernelError, BrepErrorCode } from '../core/errors.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface HullOptions {
  /** Meshing / sewing tolerance (default: 0.1). */
  tolerance?: number;
}

// ---------------------------------------------------------------------------
// Pre-validation
// ---------------------------------------------------------------------------

function validateNotNull(
  shape: { wrapped: KernelShape },
  label: string
): Result<undefined> {
  if (getKernel().isNull(shape.wrapped)) {
    return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, `${label} is a null shape`));
  }
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// hull()
// ---------------------------------------------------------------------------

/**
 * Compute the 3D convex hull of one or more shapes.
 *
 * Returns the tightest convex solid enclosing all input geometry.
 *
 * @param shapes - One or more 3D shapes to hull.
 * @param options - Optional tolerance settings.
 */
export function hull(shapes: ReadonlyArray<AnyShape>, options: HullOptions = {}): Result<Solid> {
  if (shapes.length === 0) {
    return err(
      validationError(
        BrepErrorCode.HULL_EMPTY_INPUT,
        'hull: at least one shape is required',
        undefined,
        undefined,
        'Provide one or more shapes to compute a convex hull'
      )
    );
  }

  for (const [i, shape] of shapes.entries()) {
    const check = validateNotNull(shape, `hull: shapes[${i}]`);
    if (isErr(check)) return check as Result<Solid>;
  }

  const tolerance = options.tolerance ?? 0.1;

  try {
    const kernel = getKernel();
    const ocShapes = shapes.map((s) => s.wrapped);
    const resultOc = kernel.hull(ocShapes, tolerance);
    const cast = castShape(resultOc);

    if (!isSolid(cast)) {
      return err(
        kernelError(BrepErrorCode.HULL_NOT_3D, 'Hull result is not a solid; input may be degenerate')
      );
    }

    return ok(cast);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);

    // Distinguish degenerate from general failures
    if (raw.includes('coplanar') || raw.includes('fewer than') || raw.includes('degenerate')) {
      return err(kernelError(BrepErrorCode.HULL_DEGENERATE, `Hull degenerate: ${raw}`, e));
    }

    return err(kernelError(BrepErrorCode.HULL_FAILED, `Hull operation failed: ${raw}`, e));
  }
}
