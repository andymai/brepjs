import { loft as loftFn } from '@/operations/loftFns.js';
import { err, type Result } from '@/core/result.js';
import { validationError } from '@/core/errors.js';
import { DisposalScope } from '@/core/disposal.js';
import type { AnyShape, Dimension, Wire } from '@/core/shapeTypes.js';
import { outerWire } from '@/topology/faceFns.js';
import type { LoftNode } from '../types.js';
import type { EvalContext } from './context.js';
import { resolveProfileFace } from './profileFace.js';

export function evalLoft(node: LoftNode, ctx: EvalContext): Result<AnyShape<Dimension>> {
  if (node.sections.length < 2) {
    return err(
      validationError(
        'CSG_LOFT_SECTIONS',
        `Loft requires at least 2 sections, got ${node.sections.length}`
      )
    );
  }
  // The extracted outer wires are fresh kernel handles owned here; the loft
  // copies their topology, so they are disposed on every exit path. The
  // section faces stay owned by the evaluator cache.
  using scope = new DisposalScope();
  const wires: Wire<Dimension>[] = [];
  for (const [i, section] of node.sections.entries()) {
    const face = resolveProfileFace(ctx, section, `Loft.sections[${i}]`);
    if (!face.ok) return face;
    const w = outerWire(face.value);
    scope.register(w);
    wires.push(w);
  }
  return loftFn(wires, { ruled: node.ruled });
}
