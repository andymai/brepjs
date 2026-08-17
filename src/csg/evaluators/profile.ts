import { face as makeFace } from '@/topology/primitiveFns.js';
import { DisposalScope } from '@/core/disposal.js';
import { ok, err, type Result } from '@/core/result.js';
import { validationError } from '@/core/errors.js';
import {
  closedWire,
  isPlanarWire,
  type ClosedWire,
  type PlanarWire,
} from '@/core/validityTypes.js';
import type { AnyShape, Dimension, Wire } from '@/core/shapeTypes.js';
import type { Contour } from '../segments.js';
import type { ProfileNode } from '../types.js';
import type { EvalContext } from './context.js';
import { buildSegmentWire } from './path.js';

type Proven = ClosedWire<Dimension> & PlanarWire<Dimension>;

function proveClosedPlanar(w: Wire<Dimension>, where: string): Result<Proven> {
  const cw = closedWire(w);
  if (!cw.ok) return err(validationError('CSG_PROFILE_CONTOUR', `${where}: ${cw.error}`));
  if (!isPlanarWire(cw.value)) {
    return err(validationError('CSG_PROFILE_CONTOUR', `${where}: contour is not planar`));
  }
  return ok(cw.value);
}

export function evalProfile(node: ProfileNode, ctx: EvalContext): Result<AnyShape<Dimension>> {
  // Contour wires (and their edges) are intermediates; the face copies their
  // topology, so everything in the scope is disposed on every exit path.
  using scope = new DisposalScope();
  const contourWire = (c: Contour, where: string): Result<Proven> => {
    const w = buildSegmentWire(c.start, c.segments, ctx, scope, true, where);
    if (!w.ok) return w;
    scope.register(w.value);
    return proveClosedPlanar(w.value, where);
  };
  const outline = contourWire(node.outline, 'Profile.outline');
  if (!outline.ok) return outline;
  const holes: Proven[] = [];
  for (const [i, hc] of node.holes.entries()) {
    const hw = contourWire(hc, `Profile.holes[${i}]`);
    if (!hw.ok) return hw;
    holes.push(hw.value);
  }
  return makeFace(
    outline.value as ClosedWire & PlanarWire,
    holes.length > 0 ? (holes as Array<ClosedWire & PlanarWire>) : undefined
  );
}
