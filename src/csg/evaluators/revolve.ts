import { revolve as revolveFn } from '@/operations/extrudeFns.js';
import { ok, err, type Result } from '@/core/result.js';
import { validationError } from '@/core/errors.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import type { Vec3 } from '@/core/types.js';
import { evalScalar, evalVec3 } from '../expressions.js';
import type { RevolveNode } from '../types.js';
import type { EvalContext } from './context.js';
import { resolveProfileFace } from './profileFace.js';

export function evalRevolve(node: RevolveNode, ctx: EvalContext): Result<AnyShape<Dimension>> {
  const a = evalScalar(node.angle, ctx.env, 'Revolve.angle');
  if (!a.ok) return a;
  if (!Number.isFinite(a.value) || a.value <= 0) {
    return err(
      validationError(
        'CSG_REVOLVE_ANGLE',
        `Revolve.angle must be positive (degrees), got ${a.value}`
      )
    );
  }
  // Clamp to one revolution: kernels disagree past 2*pi (OCCT keeps sweeping,
  // brepkit/manifold clamp), and a content-addressed tree must evaluate to the
  // same geometry on every kernel.
  const deg = Math.min(a.value, 360);
  const axis = node.axis ? evalVec3(node.axis, ctx.env, 'Revolve.axis') : ok<Vec3>([0, 0, 1]);
  if (!axis.ok) return axis;
  const at = node.at ? evalVec3(node.at, ctx.env, 'Revolve.at') : ok<Vec3>([0, 0, 0]);
  if (!at.ok) return at;
  const face = resolveProfileFace(ctx, node.profile, 'Revolve.profile');
  if (!face.ok) return face;
  // IR angles are degrees (matching Rotate); the kernel op takes radians.
  return revolveFn(face.value, at.value, axis.value, (deg * Math.PI) / 180);
}
