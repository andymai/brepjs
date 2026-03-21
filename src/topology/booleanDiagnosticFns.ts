/**
 * Boolean pre-validation diagnostics.
 */

import { getKernel } from '@/kernel/index.js';
import type { Shape3D } from '@/core/shapeTypes.js';
import type { BooleanOpType, CheckBooleanResult } from '@/kernel/types.js';

/**
 * Pre-validate operands before a boolean operation.
 *
 * Checks that both shapes are non-null and topologically valid.
 * Returns a structured report of any issues found.
 *
 * @example
 * ```typescript
 * const check = checkBoolean(base, tool, 'fuse');
 * if (!check.valid) {
 *   console.warn('Boolean will likely fail:', check.issues);
 * }
 * ```
 */
export function checkBoolean(base: Shape3D, tool: Shape3D, op: BooleanOpType): CheckBooleanResult {
  const kernel = getKernel();
  return kernel.checkBoolean(base.wrapped, tool.wrapped, op);
}
