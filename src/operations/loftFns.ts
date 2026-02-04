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

export interface LoftConfig {
  ruled?: boolean;
  startPoint?: PointInput;
  endPoint?: PointInput;
}

/** Loft through a set of wire profiles to create a shape. */
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
