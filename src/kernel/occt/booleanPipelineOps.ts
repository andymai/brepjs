/**
 * Opaque boolean pipeline — executes chained operations in a single WASM call.
 *
 * Used by DefaultAdapter. Requires BooleanPipeline C++ class in WASM build.
 * Falls back to sequential JS calls when unavailable.
 */

import type { KernelInstance, KernelShape } from '@/kernel/types.js';

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
 * Falls back to sequential JS calls otherwise.
 */
export function executeBooleanPipeline(
  oc: KernelInstance,
  base: KernelShape,
  steps: readonly PipelineStep[],
  options: { glueMode?: number | undefined; fuzzyValue?: number | undefined } = {}
): KernelShape | null {
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

  // JS fallback: sequential operations with simplify only on last step
  let current = base;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const isLast = i === steps.length - 1;
    const progress = new oc.Message_ProgressRange_1();

    let op;
    if (step.op === 'fuse') {
      op = new oc.BRepAlgoAPI_Fuse_3(current, step.tool, progress);
    } else if (step.op === 'cut') {
      op = new oc.BRepAlgoAPI_Cut_4(current, step.tool, progress);
    } else {
      op = new oc.BRepAlgoAPI_Common_4(current, step.tool, progress);
    }

    op.SetRunParallel(true);
    op.SetUseOBB(true);
    op.Build(progress);

    if (isLast) {
      op.SimplifyResult(true, true, 1e-3);
    }

    current = op.Shape();
    op.delete();
    progress.delete();
  }
  return current;
}
