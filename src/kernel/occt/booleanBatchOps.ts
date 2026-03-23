/**
 * Wire up the existing BooleanBatch C++ extractor.
 *
 * The BooleanBatch class is compiled into the WASM build but was previously
 * unused from TypeScript. It performs fuseAll/cutAll in a single WASM call
 * with parallel execution and OBB spatial rejection enabled.
 *
 * Used by booleanOps.ts as a fast path when available.
 */

import type { KernelInstance, KernelShape, BooleanOptions } from '@/kernel/types.js';
import { perfTimer } from '../perfStats.js';

let hasCppBooleanBatch: boolean | undefined;

export function resetBooleanBatchDetectionCache(): void {
  hasCppBooleanBatch = undefined;
}

function detectCppBooleanBatch(oc: KernelInstance): boolean {
  hasCppBooleanBatch ??= typeof oc.BooleanBatch === 'function';
  return hasCppBooleanBatch;
}

function glueToInt(optimisation?: string): number {
  if (optimisation === 'commonFace') return 1;
  if (optimisation === 'sameFace') return 2;
  return 0;
}

/**
 * Attempt fuseAll via C++ BooleanBatch extractor.
 * Returns null if C++ extractor is not available.
 */
export function cppFuseAll(
  oc: KernelInstance,
  shapes: KernelShape[],
  options: BooleanOptions = {}
): KernelShape | null {
  /* v8 ignore start -- C++ extractor not available in test WASM build */
  if (!detectCppBooleanBatch(oc)) return null;

  const end = perfTimer('boolean');
  const batch = new oc.BooleanBatch();
  try {
    for (const s of shapes) {
      batch.addShape(s);
    }
    return batch.fuseAll(
      glueToInt(options.optimisation),
      !!options.simplify,
      options.fuzzyValue ?? 0
    );
  } finally {
    batch.delete();
    end();
  }
  /* v8 ignore stop */
}

/**
 * Attempt cutAll via C++ BooleanBatch extractor.
 * Returns null if C++ extractor is not available.
 */
export function cppCutAll(
  oc: KernelInstance,
  base: KernelShape,
  tools: KernelShape[],
  options: BooleanOptions = {}
): KernelShape | null {
  /* v8 ignore start -- C++ extractor not available in test WASM build */
  if (!detectCppBooleanBatch(oc)) return null;
  if (tools.length === 0) return base;

  const end = perfTimer('boolean');
  const batch = new oc.BooleanBatch();
  try {
    for (const t of tools) {
      batch.addShape(t);
    }
    return batch.cutAll(
      base,
      glueToInt(options.optimisation),
      !!options.simplify,
      options.fuzzyValue ?? 0
    );
  } finally {
    batch.delete();
    end();
  }
  /* v8 ignore stop */
}
