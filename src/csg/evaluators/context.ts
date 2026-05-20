import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import type { Result } from '@/core/result.js';
import type { Env } from '../expressions.js';
import type { IRNode } from '../types.js';

export interface EvalContext {
  readonly env: Env;
  readonly tolerance: number | undefined;
  readonly evalNode: (node: IRNode) => Result<AnyShape<Dimension>>;
}
