import { getKernel } from '../kernel/index.js';
import type { PointInput } from '../core/types.js';
import { toVec3 } from '../core/types.js';
import { cast, isShape3D } from '../topology/cast.js';
import { type Result, ok, err, andThen } from '../core/result.js';
import { typeCastError, validationError, kernelError } from '../core/errors.js';
import type { Wire, Shape3D } from '../core/shapeTypes.js';
import { makeVertex } from '../topology/shapeHelpers.js';

/** Configuration for the OOP loft operation. */
export interface LoftOptions {
  /** Use ruled (straight) interpolation between profiles. Defaults to `true`. */
  ruled?: boolean | undefined;
  /** Optional start vertex before the first wire profile. */
  startPoint?: PointInput | undefined;
  /** Optional end vertex after the last wire profile. */
  endPoint?: PointInput | undefined;
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
 * @returns `Result` containing the lofted 3D shape.
 *
 * @example
 * ```ts
 * const result = loft([bottomWire, topWire], { ruled: false });
 * ```
 *
 * @see {@link loftFns!loft | loft} for the functional API equivalent.
 */
export const loft = (
  wires: Wire[],
  { ruled = true, startPoint, endPoint }: LoftOptions = {},
  returnShell = false
): Result<Shape3D> => {
  if (wires.length === 0 && !startPoint && !endPoint) {
    return err(validationError('LOFT_EMPTY', 'Loft requires at least one wire or start/end point'));
  }

  const kernel = getKernel();

  const startVertex = startPoint ? makeVertex(toVec3(startPoint)).wrapped : undefined;
  const endVertex = endPoint ? makeVertex(toVec3(endPoint)).wrapped : undefined;

  try {
    const shape = kernel.loftAdvanced(
      wires.map((w) => w.wrapped),
      {
        solid: !returnShell,
        ruled,
        ...(startVertex ? { startVertex } : {}),
        ...(endVertex ? { endVertex } : {}),
      }
    );

    const result = andThen(cast(shape), (s) => {
      if (!isShape3D(s))
        return err(typeCastError('LOFT_NOT_3D', 'Loft did not produce a 3D shape'));
      return ok(s);
    });

    return result;
  } catch {
    return err(kernelError('LOFT_FAILED', 'Loft operation failed'));
  }
};
