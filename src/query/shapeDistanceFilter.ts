/**
 * Shared distance-from-point filter used by edge, face, and vertex finders.
 */

import type { Vec3 } from '../core/types.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { getKernel } from '../kernel/index.js';
import { toOcPnt } from '../core/occtBoundary.js';
import { gcWithScope } from '../core/disposal.js';
import type { Predicate } from './finderCore.js';

/**
 * Create a predicate that checks whether a shape element's minimum distance
 * from `point` equals `distance` (within `tolerance`).
 *
 * Uses OCCT's `BRepExtrema_DistShapeShape` and works for any shape type.
 */
export function distanceFromPointFilter<T extends AnyShape>(
  distance: number,
  point: Vec3,
  tolerance: number
): Predicate<T> {
  // Hoist WASM object creation outside the predicate — these are reused
  // for every element tested, avoiding N alloc/delete cycles.
  const oc = getKernel().oc;
  const r = gcWithScope();

  const pnt = r(toOcPnt(point));
  const vtxMaker = r(new oc.BRepBuilderAPI_MakeVertex(pnt));
  const vtx = vtxMaker.Vertex();

  const distTool = r(new oc.BRepExtrema_DistShapeShape_1());
  distTool.LoadS1(vtx);

  const progress = r(new oc.Message_ProgressRange_1());

  return (element: T): boolean => {
    distTool.LoadS2(element.wrapped);
    distTool.Perform(progress);
    const d = distTool.Value();
    return Math.abs(d - distance) < tolerance;
  };
}
