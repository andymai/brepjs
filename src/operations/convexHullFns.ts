/**
 * Public convex hull from raw 3D points.
 *
 * Wraps the kernel's `hullFromPoints()` as a user-facing function
 * that accepts `Vec3[]` and returns `Result<Solid>`.
 */

import type { Vec3 } from '../core/types.js';
import type { Solid } from '../core/shapeTypes.js';
import { castShape, isSolid } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { validationError, kernelError, BrepErrorCode } from '../core/errors.js';
import { getKernel } from '../kernel/index.js';

/**
 * Compute the 3D convex hull of a point cloud.
 *
 * Returns the tightest convex solid enclosing all given points.
 * At least 4 non-coplanar points are required to form a solid.
 *
 * @param points - Array of 3D coordinates.
 * @returns `Result<Solid>` — the convex hull solid, or an error.
 *
 * @example
 * ```ts
 * const solid = unwrap(convexHull([
 *   [0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 10],
 * ]));
 * ```
 */
export function convexHull(points: ReadonlyArray<Vec3>): Result<Solid> {
  if (points.length < 4) {
    return err(
      validationError(
        BrepErrorCode.HULL_EMPTY_INPUT,
        `convexHull: at least 4 points required, got ${points.length}`,
        undefined,
        undefined,
        'Provide 4 or more non-coplanar 3D points'
      )
    );
  }

  try {
    const kernel = getKernel();
    const objPoints = points.map((p) => ({ x: p[0], y: p[1], z: p[2] }));
    const result = kernel.hullFromPoints(objPoints, 0.1);
    const cast = castShape(result);

    if (!isSolid(cast)) {
      return err(
        kernelError(
          BrepErrorCode.HULL_NOT_3D,
          'convexHull result is not a solid; points may be coplanar'
        )
      );
    }

    return ok(cast);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    if (raw.includes('coplanar') || raw.includes('fewer than') || raw.includes('degenerate')) {
      return err(kernelError(BrepErrorCode.HULL_DEGENERATE, `convexHull degenerate: ${raw}`, e));
    }
    return err(kernelError(BrepErrorCode.HULL_FAILED, `convexHull failed: ${raw}`, e));
  }
}
