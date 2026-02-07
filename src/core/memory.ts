/**
 * Memory management utilities — re-export hub for disposal.ts.
 */

export type { Deletable } from './disposal.js';
export {
  createHandle,
  createOcHandle,
  DisposalScope,
  withScope,
  gcWithScope,
  gcWithObject,
  localGC,
  registerForCleanup,
  unregisterFromCleanup,
  type ShapeHandle,
  type OcHandle,
} from './disposal.js';
