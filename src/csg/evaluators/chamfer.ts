import { chamfer as chamferFn } from '@/topology/modifierFns.js';
import { resolveRefIn } from '@/topology/shapeRef/refResolveFns.js';
import { err, type Result } from '@/core/result.js';
import { validationError } from '@/core/errors.js';
import { isEdge, isSolid, type AnyShape, type Dimension } from '@/core/shapeTypes.js';
import { validSolid } from '@/core/validityTypes.js';
import { evalScalar } from '../expressions.js';
import type { ChamferNode } from '../types.js';
import type { EvalContext } from './context.js';

export function evalChamfer(node: ChamferNode, ctx: EvalContext): Result<AnyShape<Dimension>> {
  const distance = evalScalar(node.distance, ctx.env, 'Chamfer.distance');
  if (!distance.ok) return distance;
  if (distance.value <= 0) {
    return err(
      validationError(
        'CSG_CHAMFER_DISTANCE',
        `Chamfer.distance must be positive, got ${distance.value}`
      )
    );
  }
  const t = ctx.evalNode(node.target);
  if (!t.ok) return t;
  if (!isSolid(t.value)) {
    return err(validationError('CSG_CHAMFER_TARGET', 'Chamfer.target did not produce a Solid'));
  }
  const solid = validSolid(t.value);
  if (!solid.ok) return err(validationError('CSG_CHAMFER_TARGET', solid.error));
  const resolved = resolveRefIn(node.ref, t.value);
  if (!resolved.ok) {
    return err(
      validationError('CSG_CHAMFER_REF', `Chamfer.ref did not resolve: ${resolved.reason}`)
    );
  }
  if (!isEdge(resolved.entity)) {
    return err(validationError('CSG_CHAMFER_REF', 'Chamfer.ref resolved to a non-edge'));
  }
  return chamferFn(solid.value, [resolved.entity], distance.value);
}
