import { err, ok, type Result } from '@/core/result.js';
import { typeCastError } from '@/core/errors.js';
import { isFace, type Dimension } from '@/core/shapeTypes.js';
import {
  orientedFace,
  isPlanarFace,
  type OrientedFace,
  type PlanarFace,
} from '@/core/validityTypes.js';
import type { IRNode } from '../types.js';
import type { EvalContext } from './context.js';

/** Evaluate a profile child and prove it is an oriented planar face — the
 *  input contract shared by every profile-consuming feature node. */
export function resolveProfileFace(
  ctx: EvalContext,
  profile: IRNode,
  where: string
): Result<OrientedFace<Dimension> & PlanarFace<Dimension>> {
  const p = ctx.evalNode(profile);
  if (!p.ok) return p;
  if (!isFace(p.value)) {
    return err(typeCastError('CSG_NOT_FACE', `${where}: node did not produce a Face`));
  }
  const oriented = orientedFace(p.value);
  if (!oriented.ok) return err(typeCastError('CSG_NOT_FACE', `${where}: ${oriented.error}`));
  if (!isPlanarFace(oriented.value)) {
    return err(typeCastError('CSG_NOT_FACE', `${where}: face is not planar`));
  }
  return ok(oriented.value);
}
