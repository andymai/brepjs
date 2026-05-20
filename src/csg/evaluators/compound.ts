import { compound as compoundFn } from '@/topology/primitiveFns.js';
import { ok, err, type Result } from '@/core/result.js';
import { computationError, BrepErrorCode } from '@/core/errors.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import type { CompoundNode } from '../types.js';
import type { EvalContext } from './context.js';

type S = Result<AnyShape<Dimension>>;

export function evalCompound(node: CompoundNode, ctx: EvalContext): S {
  const non = node.children.filter((c) => c.kind !== 'Empty');
  if (non.length === 0) {
    return err(
      computationError(
        BrepErrorCode.NULL_SHAPE_INPUT,
        'Compound: cannot materialize a compound with zero non-empty children'
      )
    );
  }
  const shapes: AnyShape<Dimension>[] = [];
  for (const c of non) {
    const r = ctx.evalNode(c);
    if (!r.ok) return r;
    shapes.push(r.value);
  }
  return ok(compoundFn(shapes));
}

export function evalEmpty(): S {
  return err(
    computationError(
      BrepErrorCode.NULL_SHAPE_INPUT,
      'Empty: cannot materialize an Empty node directly — only valid as boolean/transform operand'
    )
  );
}
