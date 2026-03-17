/**
 * Functional loft operation using branded shape types.
 */

import { getKernel } from '../kernel/index.js';
import type { PointInput } from '../core/types.js';
import { toVec3 } from '../core/types.js';
import type { Dimension, Wire, Shape3D } from '../core/shapeTypes.js';
import { castShape, isShape3D } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { typeCastError, validationError, kernelError } from '../core/errors.js';

/** Configuration for the functional loft operation. */
export interface LoftOptions {
  /** Use ruled (straight) interpolation between profiles. Defaults to `true`. */
  ruled?: boolean;
  /** Optional start vertex before the first wire profile. */
  startPoint?: PointInput;
  /** Optional end vertex after the last wire profile. */
  endPoint?: PointInput;
  /** Sewing tolerance for ThruSections builder. Defaults to `1e-6`. */
  tolerance?: number;
}

/**
 * Loft through a set of wire profiles to create a 3D shape.
 *
 * Builds a `BRepOffsetAPI_ThruSections` surface through the given wires,
 * optionally starting and/or ending at point vertices. Produces a solid
 * by default, or a shell when `returnShell` is `true`.
 *
 * @param wires - Ordered wire profiles to loft through.
 * @param config - Loft configuration (ruled interpolation, start/end points).
 * @param returnShell - When `true`, return a shell instead of a solid.
 * @returns `Result` containing the lofted 3D shape, or an error on failure.
 *
 * @example
 * ```ts
 * const result = loft([bottomWire, topWire], { ruled: false });
 * ```
 *
 * @see {@link loft!loft | loft} for the OOP API equivalent.
 */
export function loft(
  wires: Wire<Dimension>[],
  { ruled = true, startPoint, endPoint, tolerance = 1e-6 }: LoftOptions = {},
  returnShell = false
): Result<Shape3D> {
  if (wires.length === 0 && !startPoint && !endPoint) {
    return err(validationError('LOFT_EMPTY', 'Loft requires at least one wire or start/end point'));
  }

  const kernel = getKernel();

  const startVertex = startPoint ? kernel.makeVertex(...toVec3(startPoint)) : undefined;
  const endVertex = endPoint ? kernel.makeVertex(...toVec3(endPoint)) : undefined;

  try {
    const shape = kernel.loftAdvanced(
      wires.map((w) => w.wrapped),
      {
        solid: !returnShell,
        ruled,
        tolerance,
        ...(startVertex ? { startVertex } : {}),
        ...(endVertex ? { endVertex } : {}),
      }
    );

    const result = castShape(shape);
    if (!isShape3D(result)) {
      return err(typeCastError('LOFT_NOT_3D', 'Loft did not produce a 3D shape'));
    }
    return ok(result);
  } catch {
    return err(
      kernelError(
        'LOFT_FAILED',
        'Loft operation failed',
        undefined,
        undefined,
        'Common causes: wire profiles with different edge counts, self-intersecting result, or profiles too far apart. Ensure profiles are compatible and ordered.'
      )
    );
  }
}
