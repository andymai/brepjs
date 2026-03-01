/**
 * Memory management utilities — re-export hub for disposal.ts.
 */

export type { Deletable } from './disposal.js';
export {
  createHandle,
  createOcHandle,
  DisposalScope,
  withScope,
  withScopeResult,
  withScopeResultAsync,
  isLive,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- intentional: re-exporting for backward compat, callers should migrate
  gcWithScope,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- intentional: re-exporting for backward compat, callers should migrate
  gcWithObject,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- intentional: re-exporting for backward compat, callers should migrate
  localGC,
  registerForCleanup,
  unregisterFromCleanup,
  type ShapeHandle,
  type OcHandle,
} from './disposal.js';
