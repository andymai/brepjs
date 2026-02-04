import { getKernel } from '../kernel/index.js';
import { localGC } from '../core/memory.js';
import type { PointInput } from '../core/types.js';
import { toVec3 } from '../core/types.js';
import { cast, isShape3D } from '../topology/cast.js';
import { type Result, ok, err, andThen } from '../core/result.js';
import { typeCastError, validationError, occtError } from '../core/errors.js';
import type { Wire, Shape3D } from '../topology/shapes.js';
import { makeVertex } from '../topology/shapeHelpers.js';

export interface LoftConfig {
  ruled?: boolean | undefined;
  startPoint?: PointInput | undefined;
  endPoint?: PointInput | undefined;
}

export const loft = (
  wires: Wire[],
  { ruled = true, startPoint, endPoint }: LoftConfig = {},
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
