/**
 * Memory management utilities — re-export hub for disposal.ts.
 */

export type { Deletable } from './disposal.js';
export {
  createHandle,
  createKernelHandle,
  DisposalScope,
  withScope,
  withScopeResult,
  withScopeResultAsync,
  isLive,
  registerForCleanup,
  unregisterFromCleanup,
  type ShapeHandle,
  type KernelHandle,
} from './disposal.js';
