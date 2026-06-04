/**
 * KernelCore — kernel lifecycle, identity, and low-level infrastructure.
 *
 * These methods cover kernel instance access, shape disposal, batch execution,
 * and arena-based memory management (checkpoint/restore). Every kernel adapter
 * must implement these regardless of which CAD operations it supports.
 *
 * @see {@link KernelAdapter} for the full composed interface.
 */

import type { KernelInstance } from '@/kernel/types.js';
import type { KernelCapabilities } from '@/kernel/capabilities.js';
import type { QualityLevel } from '@/kernel/quality.js';

export interface KernelCore {
  /**
   * The raw kernel WASM instance.
   *
   * @internal Only code in `kernel/` and `core/` may access this property.
   * Layer 2+ code must use typed adapter methods instead.
   */
  readonly oc: KernelInstance;

  /**
   * Unique string identifying this kernel implementation.
   * Used to prevent mixing shapes from different kernels.
   */
  readonly kernelId: string;

  /**
   * What this kernel *is* — exact vs mesh-approximate, can export B-rep, how
   * tessellation is controlled. Lets callers route export/measurement and
   * quality without hard-coding kernel ids. See {@link ../capabilities.js}.
   */
  readonly capabilities: KernelCapabilities;

  /**
   * Apply a tessellation quality level. Implemented only by `build-time`
   * kernels (e.g. Manifold maps it to a global circular-segment setting before
   * solids are built); `extract-time` kernels leave this undefined and instead
   * read the active level as their default deflection at `mesh()`/export time.
   */
  setQuality?(level: QualityLevel): void;

  /** Dispose a kernel handle, releasing its resources. */
  dispose(handle: { delete(): void }): void;

  /** Execute a batch of kernel operations from JSON. Returns JSON result. */
  executeBatch(json: string): string;

  /** Create an arena checkpoint. Returns checkpoint index. */
  checkpoint(): number;
  /** Get the current number of active checkpoints. */
  checkpointCount(): number;
  /** Restore arena to a checkpoint, freeing all handles created after it. */
  restoreCheckpoint(cp: number): void;
  /** Discard a checkpoint without restoring (keep all handles). */
  discardCheckpoint(cp: number): void;
}
