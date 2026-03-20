/**
 * Boolean operation helpers — compound builders and glue optimization.
 */

import type { KernelType } from '@/kernel/types.js';

// BOPAlgo_GlueEnum integer constants
const BOPAlgo_GlueShift = 1;
const BOPAlgo_GlueFull = 2;

// ---------------------------------------------------------------------------
// Glue optimization helper
// ---------------------------------------------------------------------------

/**
 * Applies glue optimization to a boolean operation.
 *
 * @param op - Boolean operation builder with SetGlue method
 * @param optimisation - Optimization level: 'none', 'commonFace', or 'sameFace'
 */
export function applyGlue(
  op: { SetGlue(glue: KernelType): void },
  optimisation: 'none' | 'commonFace' | 'sameFace'
): void {
  if (optimisation === 'commonFace') {
    op.SetGlue(BOPAlgo_GlueShift);
  }
  if (optimisation === 'sameFace') {
    op.SetGlue(BOPAlgo_GlueFull);
  }
}
