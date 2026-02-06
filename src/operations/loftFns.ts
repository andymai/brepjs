/**
 * Functional loft operation using branded shape types.
 */

import { getKernel } from '../kernel/index.js';
import type { PointInput } from '../core/types.js';
import { toVec3 } from '../core/types.js';
import { toOcPnt } from '../core/occtBoundary.js';
import type { Wire, Shape3D } from '../core/shapeTypes.js';
import { castShape, isShape3D } from '../core/shapeTypes.js';
import { gcWithScope } from '../core/disposal.js';
import { type Result, ok, err } from '../core/result.js';
import { typeCastError, validationError, occtError } from '../core/errors.js';

/** Configuration for the functional loft operation. */
export interface LoftConfig {
  /** Use ruled (straight) interpolation between profiles. Defaults to `true`. */
  ruled?: boolean;
  /** Optional start vertex before the first wire profile. */
  startPoint?: PointInput;
  /** Optional end vertex after the last wire profile. */
  endPoint?: PointInput;
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
 * const result = loftWires([bottomWire, topWire], { ruled: false });
 * ```
 *
 * @see {@link loft!loft | loft} for the OOP API equivalent.
 */
export function loftWires(
  wires: Wire[],
  { ruled = true, startPoint, endPoint }: LoftConfig = {},
  returnShell = false
): Result<Shape3D> {
  if (wires.length === 0 && !startPoint && !endPoint) {
    return err(validationError('LOFT_EMPTY', 'Loft requires at least one wire or start/end point'));
  }

  const oc = getKernel().oc;
  const r = gcWithScope();

  const builder = r(new oc.BRepOffsetAPI_ThruSections(!returnShell, ruled, 1e-6));

  if (startPoint) {
    const pnt = r(toOcPnt(toVec3(startPoint)));
    const vMaker = r(new oc.BRepBuilderAPI_MakeVertex(pnt));
    builder.AddVertex(vMaker.Vertex());
  }
  for (const w of wires) {
    builder.AddWire(w.wrapped);
  }
  if (endPoint) {
    const pnt = r(toOcPnt(toVec3(endPoint)));
    const vMaker = r(new oc.BRepBuilderAPI_MakeVertex(pnt));
    builder.AddVertex(vMaker.Vertex());
  }

  const progress = r(new oc.Message_ProgressRange_1());
  builder.Build(progress);

  if (!builder.IsDone()) {
    return err(occtError('LOFT_FAILED', 'Loft operation failed'));
  }

  const result = castShape(builder.Shape());
  if (!isShape3D(result)) {
    return err(typeCastError('LOFT_NOT_3D', 'Loft did not produce a 3D shape'));
  }
  return ok(result);
}
