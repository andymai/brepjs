import { extrude as extrudeFn } from '@/operations/extrudeFns.js';
import type { Result } from '@/core/result.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { evalVec3 } from '../expressions.js';
import type { ExtrudeNode } from '../types.js';
import type { EvalContext } from './context.js';
import { resolveProfileFace } from './profileFace.js';

export function evalExtrude(node: ExtrudeNode, ctx: EvalContext): Result<AnyShape<Dimension>> {
  const v = evalVec3(node.vector, ctx.env, 'Extrude.vector');
  if (!v.ok) return v;
  const face = resolveProfileFace(ctx, node.profile, 'Extrude.profile');
  if (!face.ok) return face;
  return extrudeFn(face.value, v.value);
}
