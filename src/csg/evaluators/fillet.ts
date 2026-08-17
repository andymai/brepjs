import { fillet as filletFn } from '@/topology/modifierFns.js';
import { resolveRefIn } from '@/topology/shapeRef/refResolveFns.js';
import { err, type Result } from '@/core/result.js';
import { validationError } from '@/core/errors.js';
import { isEdge, isSolid, type AnyShape, type Dimension } from '@/core/shapeTypes.js';
import { validSolid } from '@/core/validityTypes.js';
import { evalScalar } from '../expressions.js';
import type { FilletNode } from '../types.js';
import type { EvalContext } from './context.js';

export function evalFillet(node: FilletNode, ctx: EvalContext): Result<AnyShape<Dimension>> {
  const radius = evalScalar(node.radius, ctx.env, 'Fillet.radius');
  if (!radius.ok) return radius;
  if (radius.value <= 0) {
    return err(
      validationError('CSG_FILLET_RADIUS', `Fillet.radius must be positive, got ${radius.value}`)
    );
  }
  const t = ctx.evalNode(node.target);
  if (!t.ok) return t;
  if (!isSolid(t.value)) {
    return err(validationError('CSG_FILLET_TARGET', 'Fillet.target did not produce a Solid'));
  }
  const solid = validSolid(t.value);
  if (!solid.ok) return err(validationError('CSG_FILLET_TARGET', solid.error));
  const resolved = resolveRefIn(node.ref, t.value);
  if (!resolved.ok) {
    return err(validationError('CSG_FILLET_REF', `Fillet.ref did not resolve: ${resolved.reason}`));
  }
  if (!isEdge(resolved.entity)) {
    return err(validationError('CSG_FILLET_REF', 'Fillet.ref resolved to a non-edge'));
  }
  return filletFn(solid.value, [resolved.entity], radius.value);
}
