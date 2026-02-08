import { getKernel } from '../kernel/index.js';
import { localGC } from '../core/memory.js';
import type { PointInput } from '../core/types.js';
import { toVec3 } from '../core/types.js';
import { cast, isShape3D } from '../topology/cast.js';
import { type Result, ok, err, andThen } from '../core/result.js';
import { typeCastError, validationError, occtError } from '../core/errors.js';
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

/** @deprecated Use LoftOptions instead. Will be removed in v8.0.0. */
export type LoftConfig = LoftOptions;

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
 * @see {@link loftFns!loftWires | loftWires} for the functional API equivalent.
 */
export const loft = (
  wires: Wire[],
  { ruled = true, startPoint, endPoint }: LoftOptions = {},
  returnShell = false
): Result<Shape3D> => {
  if (wires.length === 0 && !startPoint && !endPoint) {
    return err(validationError('LOFT_EMPTY', 'Loft requires at least one wire or start/end point'));
  }

  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const loftBuilder = r(new oc.BRepOffsetAPI_ThruSections(!returnShell, ruled, 1e-6));

  if (startPoint) {
    loftBuilder.AddVertex(r(makeVertex(toVec3(startPoint))).wrapped);
  }
  wires.forEach((w) => loftBuilder.AddWire(w.wrapped));
  if (endPoint) {
    loftBuilder.AddVertex(r(makeVertex(toVec3(endPoint))).wrapped);
  }

  const progress = r(new oc.Message_ProgressRange_1());
  loftBuilder.Build(progress);

  if (!loftBuilder.IsDone()) {
    gc();
    return err(occtError('LOFT_FAILED', 'Loft operation failed'));
  }

  const result = andThen(cast(loftBuilder.Shape()), (shape) => {
    if (!isShape3D(shape))
      return err(typeCastError('LOFT_NOT_3D', 'Loft did not produce a 3D shape'));
    return ok(shape);
  });
  gc();

  return result;
};
