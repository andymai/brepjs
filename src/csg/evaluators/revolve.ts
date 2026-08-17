import { revolve as revolveFn } from '@/operations/extrudeFns.js';
import { ok, type Result } from '@/core/result.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import type { Vec3 } from '@/core/types.js';
import { evalScalar, evalVec3 } from '../expressions.js';
import type { RevolveNode } from '../types.js';
import type { EvalContext } from './context.js';
import { resolveProfileFace } from './profileFace.js';

export function evalRevolve(node: RevolveNode, ctx: EvalContext): Result<AnyShape<Dimension>> {
  const a = evalScalar(node.angle, ctx.env, 'Revolve.angle');
  if (!a.ok) return a;
  const axis = node.axis ? evalVec3(node.axis, ctx.env, 'Revolve.axis') : ok<Vec3>([0, 0, 1]);
  if (!axis.ok) return axis;
  const at = node.at ? evalVec3(node.at, ctx.env, 'Revolve.at') : ok<Vec3>([0, 0, 0]);
  if (!at.ok) return at;
  const face = resolveProfileFace(ctx, node.profile, 'Revolve.profile');
  if (!face.ok) return face;
  // IR angles are degrees (matching Rotate); the kernel op takes radians.
  return revolveFn(face.value, at.value, axis.value, (a.value * Math.PI) / 180);
}
