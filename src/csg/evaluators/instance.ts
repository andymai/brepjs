// evalInstance materializes the source once (DAG-shared via the evaluator
// cache) and applies the placements through the topology instancing layer.
import { instance as makeInstance, materialize } from '@/operations/instanceFns.js';
import type { Result } from '@/core/result.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import type { InstanceNode } from '../types.js';
import type { EvalContext } from './context.js';

export function evalInstance(node: InstanceNode, ctx: EvalContext): Result<AnyShape<Dimension>> {
  const r = ctx.evalNode(node.source);
  if (!r.ok) return r;
  // Wrap the evaluator-owned source. InstancedShape has no finalizer, so
  // orphaning the wrapper never disposes the source; materialize disposes only
  // the transient placed copies, never the source.
  const inst = makeInstance(r.value, node.placements);
  return materialize(inst, { fuse: node.fuse });
}
