import { extrude as extrudeFn } from '@/operations/extrudeFns.js';
import { err, type Result } from '@/core/result.js';
import { typeCastError } from '@/core/errors.js';
import { isFace, type AnyShape, type Dimension } from '@/core/shapeTypes.js';
import { orientedFace, isPlanarFace } from '@/core/validityTypes.js';
import { evalVec3 } from '../expressions.js';
import type { ExtrudeNode } from '../types.js';
import type { EvalContext } from './context.js';

export function evalExtrude(node: ExtrudeNode, ctx: EvalContext): Result<AnyShape<Dimension>> {
  const v = evalVec3(node.vector, ctx.env, 'Extrude.vector');
  if (!v.ok) return v;
  const p = ctx.evalNode(node.profile);
  if (!p.ok) return p;
  if (!isFace(p.value)) {
    return err(typeCastError('CSG_NOT_FACE', 'Extrude.profile: node did not produce a Face'));
  }
  const oriented = orientedFace(p.value);
  if (!oriented.ok) return err(typeCastError('CSG_NOT_FACE', `Extrude.profile: ${oriented.error}`));
  if (!isPlanarFace(oriented.value)) {
    return err(typeCastError('CSG_NOT_FACE', 'Extrude.profile: face is not planar'));
  }
  return extrudeFn(oriented.value, v.value);
}
