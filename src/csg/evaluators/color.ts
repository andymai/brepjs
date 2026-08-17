import { getKernel } from '@/kernel/index.js';
import { ok, type Result } from '@/core/result.js';
import { castShape, type AnyShape, type Dimension } from '@/core/shapeTypes.js';
import { colorShape } from '@/topology/metadata/colorFns.js';
import {
  hasAnyMetadata,
  propagateMetadataThroughRelocation,
} from '@/topology/metadata/metadataPropagation.js';
import type { ColorNode } from '../types.js';
import type { EvalContext } from './context.js';

export function evalColor(node: ColorNode, ctx: EvalContext): Result<AnyShape<Dimension>> {
  const t = ctx.evalNode(node.target);
  if (!t.ok) return t;
  // Metadata is keyed by handle identity, and the target's handle is a SHARED
  // cache entry — coloring it directly would leak onto every other consumer.
  // An identity locate gives a fresh, independently-disposable handle over the
  // same geometry (O(1)); the color attaches to that.
  const kernel = getKernel();
  const { handle, dispose } = kernel.composeTransform([{ type: 'translate', x: 0, y: 0, z: 0 }]);
  let moved: AnyShape<Dimension>;
  try {
    moved = castShape(kernel.locate(t.value.wrapped, handle));
  } finally {
    dispose();
  }
  if (hasAnyMetadata(t.value)) propagateMetadataThroughRelocation(t.value, moved);
  return ok(colorShape(moved, [...node.color]));
}
