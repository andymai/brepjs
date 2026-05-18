/**
 * Opaque boolean pipeline — executes chained operations in a single WASM call.
 *
 * Used by DefaultAdapter. Requires BooleanPipeline C++ class in WASM build.
 * Returns undefined when unavailable — caller handles fallback.
 */

import type { KernelInstance, KernelShape } from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';

export type PipelineOp = 'fuse' | 'cut' | 'intersect';

export interface PipelineStep {
  readonly op: PipelineOp;
  readonly tool: KernelShape;
}

const OP_CODES: Readonly<Record<PipelineOp, number>> = { fuse: 0, cut: 1, intersect: 2 };

/**
 * Execute a chained boolean pipeline.
 * Uses C++ BooleanPipeline when available (zero JS↔WASM bridge crossings
 * between steps, auto-skips UnifySameDomain on intermediates).
 * Returns undefined when C++ class is unavailable.
 */
export function executeBooleanPipeline(
  oc: KernelInstance,
  base: KernelShape,
  steps: readonly PipelineStep[],
  options: { glueMode?: number | undefined; fuzzyValue?: number | undefined } = {}
): KernelShape | null | undefined {
  const { glueMode = 0, fuzzyValue = 0 } = options;

  // Feature-detect C++ pipeline
  if (typeof oc.BooleanPipeline === 'function') {
    const pipeline = new oc.BooleanPipeline();
    try {
      for (const step of steps) {
        pipeline.addStep(OP_CODES[step.op], step.tool);
      }
      const result = pipeline.execute(base, glueMode, fuzzyValue);
      if (result.IsNull()) return null;
      return result;
    } finally {
      pipeline.delete();
    }
  }

  // C++ pipeline not available — return undefined so caller uses higher-level fallback
  return undefined;
}

/** Co-located factory: returns the boolean-pipeline slice of {@link KernelAdapter} bound to `oc`. */
export function makeBooleanPipelineOps(oc: KernelInstance) {
  return {
    booleanPipeline: (base, steps, options) =>
      executeBooleanPipeline(oc, base, steps, options) ?? null,
  } satisfies Pick<KernelAdapter, 'booleanPipeline'>;
}
