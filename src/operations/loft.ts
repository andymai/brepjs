/**
 * Loft operation.
 * Ported from replicad's addThickness.ts.
 */

import { getKernel } from '../kernel/index.js';
import { localGC } from '../core/memory.js';
import type { Point } from '../core/geometry.js';
import { cast, isShape3D } from '../topology/cast.js';
import type { Wire, Shape3D } from '../topology/shapes.js';
import { makeVertex } from '../topology/shapeHelpers.js';

export interface LoftConfig {
  ruled?: boolean | undefined;
  startPoint?: Point | undefined;
  endPoint?: Point | undefined;
}

export const loft = (
  wires: Wire[],
  { ruled = true, startPoint, endPoint }: LoftConfig = {},
  returnShell = false
): Shape3D => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const loftBuilder = r(new oc.BRepOffsetAPI_ThruSections(!returnShell, ruled, 1e-6));

  if (startPoint) {
    loftBuilder.AddVertex(r(makeVertex(startPoint)).wrapped);
  }
  wires.forEach((w) => loftBuilder.AddWire(w.wrapped));
  if (endPoint) {
    loftBuilder.AddVertex(r(makeVertex(endPoint)).wrapped);
  }

  const progress = r(new oc.Message_ProgressRange_1());
  loftBuilder.Build(progress);
  const shape = cast(loftBuilder.Shape());
  gc();

  if (!isShape3D(shape)) throw new Error('Loft did not produce a 3D shape');
  return shape;
};
