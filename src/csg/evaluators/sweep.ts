import { sweep as sweepFn } from '@/operations/sweepFns.js';
import { assembleWire } from '@/topology/curveBuilders.js';
import { outerWire } from '@/topology/faceFns.js';
import { DisposalScope } from '@/core/disposal.js';
import { ok, err, type Result } from '@/core/result.js';
import { typeCastError } from '@/core/errors.js';
import {
  isEdge,
  isWire,
  type AnyShape,
  type Dimension,
  type Edge,
  type Wire,
} from '@/core/shapeTypes.js';
import type { SweepNode } from '../types.js';
import type { EvalContext } from './context.js';
import { resolveProfileFace } from './profileFace.js';

export function evalSweep(node: SweepNode, ctx: EvalContext): Result<AnyShape<Dimension>> {
  const face = resolveProfileFace(ctx, node.profile, 'Sweep.profile');
  if (!face.ok) return face;
  const spineShape = ctx.evalNode(node.spine);
  if (!spineShape.ok) return spineShape;

  // The extracted profile wire (and an Edge spine's wrapper wire) are fresh
  // handles owned here; the swept solid does not retain them. The spine shape
  // itself stays owned by the evaluator cache.
  using scope = new DisposalScope();
  let spine: Wire<Dimension>;
  if (isWire(spineShape.value)) {
    spine = spineShape.value;
  } else if (isEdge(spineShape.value)) {
    const wrapped = assembleWire([spineShape.value as Edge]);
    if (!wrapped.ok) return wrapped;
    scope.register(wrapped.value);
    spine = wrapped.value;
  } else {
    return err(
      typeCastError('CSG_SWEEP_SPINE', 'Sweep.spine: node did not produce a Wire or Edge')
    );
  }
  const profileWire = outerWire(face.value);
  scope.register(profileWire);

  const r = sweepFn(profileWire, spine, { frenet: node.frenet });
  if (!r.ok) return r;
  if (Array.isArray(r.value)) {
    // Shell mode is never requested here; guard the union anyway.
    for (const s of r.value) s[Symbol.dispose]();
    return err(typeCastError('CSG_SWEEP_SPINE', 'Sweep: unexpected shell-mode result'));
  }
  return ok(r.value);
}
