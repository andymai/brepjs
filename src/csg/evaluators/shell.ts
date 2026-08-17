import { shell as shellFn } from '@/topology/modifierFns.js';
import { resolveRefIn } from '@/topology/shapeRef/refResolveFns.js';
import { err, type Result } from '@/core/result.js';
import { validationError } from '@/core/errors.js';
import { isFace, isSolid, type AnyShape, type Dimension, type Face } from '@/core/shapeTypes.js';
import { validSolid } from '@/core/validityTypes.js';
import { evalScalar } from '../expressions.js';
import type { ShellNode } from '../types.js';
import type { EvalContext } from './context.js';

export function evalShell(node: ShellNode, ctx: EvalContext): Result<AnyShape<Dimension>> {
  const thickness = evalScalar(node.thickness, ctx.env, 'Shell.thickness');
  if (!thickness.ok) return thickness;
  if (!Number.isFinite(thickness.value) || thickness.value <= 0) {
    return err(
      validationError(
        'CSG_SHELL_THICKNESS',
        `Shell.thickness must be positive, got ${thickness.value}`
      )
    );
  }
  const t = ctx.evalNode(node.target);
  if (!t.ok) return t;
  if (!isSolid(t.value)) {
    return err(validationError('CSG_SHELL_TARGET', 'Shell.target did not produce a Solid'));
  }
  const solid = validSolid(t.value);
  if (!solid.ok) return err(validationError('CSG_SHELL_TARGET', solid.error));
  const faces: Face[] = [];
  for (const ref of node.refs) {
    const resolved = resolveRefIn(ref, t.value);
    if (!resolved.ok) {
      return err(
        validationError(
          'CSG_SHELL_REF',
          `Shell ref '${ref.role}' did not resolve: ${resolved.reason}`
        )
      );
    }
    if (!isFace(resolved.entity)) {
      return err(
        validationError('CSG_SHELL_REF', `Shell ref '${ref.role}' resolved to a non-face`)
      );
    }
    faces.push(resolved.entity);
  }
  return shellFn(solid.value, faces, thickness.value);
}
