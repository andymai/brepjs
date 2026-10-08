import { err, type Result } from '@/core/result.js';
import { BrepErrorCode, validationError } from '@/core/errors.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { evalScalar } from '../expressions.js';
import type { ExtensionNode } from '../types.js';
import type { EvalContext } from './context.js';

export function evalExtension(node: ExtensionNode, ctx: EvalContext): Result<AnyShape<Dimension>> {
  const evaluator = ctx.extensions.get(node.name);
  if (evaluator === undefined) {
    return err(
      validationError(
        BrepErrorCode.CSG_EXTENSION_UNKNOWN,
        `Extension: no evaluator registered for '${node.name}'`,
        undefined,
        { name: node.name },
        `Register one with new csg.Evaluator({ extensions: { '${node.name}': fn } })`
      )
    );
  }
  const params: [string, number][] = [];
  for (const [key, expr] of Object.entries(node.params)) {
    const v = evalScalar(expr, ctx.env, `Extension(${node.name}).params.${key}`);
    if (!v.ok) return v;
    params.push([key, v.value]);
  }
  // Children materialize through the evaluator, so each is cached under its
  // own content address and stays owned by the cache.
  const children: AnyShape<Dimension>[] = [];
  for (const child of node.children) {
    const r = ctx.evalNode(child);
    if (!r.ok) return r;
    children.push(r.value);
  }
  return evaluator({ params: Object.fromEntries(params), data: node.data, children });
}
