/**
 * Boolean operation helpers — compound builders and glue optimization.
 */

import type { OcType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';

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
  op: { SetGlue(glue: OcType): void },
  optimisation: 'none' | 'commonFace' | 'sameFace'
): void {
  const oc = getKernel().oc;
  if (optimisation === 'commonFace') {
    op.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueShift);
  }
  if (optimisation === 'sameFace') {
    op.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueFull);
  }
}
