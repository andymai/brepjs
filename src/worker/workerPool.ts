/**
 * Worker pool for spreading CAD operations across several Web Workers.
 *
 * Wraps N {@link WorkerClient}s behind the same promise API and dispatches each
 * operation to the least-loaded worker, so independent work can span cores
 * instead of serializing through a single worker.
 */

import { createWorkerClient } from './workerClient.js';
import type { WorkerClient, WorkerResult } from './workerClient.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkerPoolOptions {
  /** The Worker instances to pool over; each is wrapped in a WorkerClient. */
  workers: Worker[];
  /** Optional URL for the WASM binary, forwarded to every worker on init. */
  wasmUrl?: string;
}

/** A single operation for {@link WorkerPool.executeBatch}. */
export interface WorkerOperation {
  /** Name of the registered operation to invoke. */
  operation: string;
  /** BREP-serialized input shapes. */
  shapesBrep: string[];
  /** Parameters forwarded to the operation handler. */
  params: Record<string, unknown>;
}

export interface WorkerPool {
  /** Number of workers in the pool. */
  readonly size: number;
  /**
   * Initialize every worker (load WASM) in parallel. Atomic: if any worker
   * fails, the pool disposes every worker and rejects with the original error,
   * leaving the pool in a terminal disposed state.
   */
  init(): Promise<void>;
  /** Run one operation on the least-loaded worker. */
  execute(
    operation: string,
    shapesBrep: string[],
    params: Record<string, unknown>
  ): Promise<WorkerResult>;
  /**
   * Run a batch of independent operations, fanned across the pool concurrently.
   * Resolves with results in the same order as `operations`.
   */
  executeBatch(operations: ReadonlyArray<WorkerOperation>): Promise<WorkerResult[]>;
  /** In-flight task count per worker, indexed as the pool was constructed. */
  inFlight(): readonly number[];
  /** Dispose every worker, rejecting all pending and future operations. Idempotent. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

interface PoolSlot {
  readonly client: WorkerClient;
  inFlight: number;
}

/**
 * Create a worker pool over the given Worker instances.
 *
 * Dispatch is least-loaded: each operation goes to the worker with the fewest
 * in-flight tasks (ties resolve to the first). The count is bumped synchronously
 * at dispatch, so a burst of calls spreads across workers rather than piling
 * onto one. Under uniform op cost this degrades to round-robin.
 */
export function createWorkerPool(options: WorkerPoolOptions): WorkerPool {
  const { workers, wasmUrl } = options;
  if (workers.length === 0) {
    throw new Error('createWorkerPool requires at least one worker');
  }

  const slots: PoolSlot[] = workers.map((worker) => ({
    client: createWorkerClient({ worker, ...(wasmUrl !== undefined ? { wasmUrl } : {}) }),
    inFlight: 0,
  }));
  let disposed = false;

  // reduce over a non-empty array returns a PoolSlot (never undefined), so this
  // sidesteps noUncheckedIndexedAccess without a non-null assertion.
  function leastLoaded(): PoolSlot {
    return slots.reduce((best, slot) => (slot.inFlight < best.inFlight ? slot : best));
  }

  function execute(
    operation: string,
    shapesBrep: string[],
    params: Record<string, unknown>
  ): Promise<WorkerResult> {
    if (disposed) return Promise.reject(new Error('WorkerPool has been disposed'));
    const slot = leastLoaded();
    slot.inFlight += 1;
    return slot.client.execute(operation, shapesBrep, params).finally(() => {
      slot.inFlight -= 1;
    });
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const slot of slots) slot.client.dispose();
  }

  return {
    size: slots.length,

    async init(): Promise<void> {
      try {
        await Promise.all(slots.map((slot) => slot.client.init()));
      } catch (err) {
        // A partially-initialized pool is unusable — least-loaded dispatch would
        // still route to the failed worker — and would leak the workers that did
        // start. Fail atomically: dispose every worker, then rethrow.
        dispose();
        throw err;
      }
    },

    execute,

    executeBatch(operations: ReadonlyArray<WorkerOperation>): Promise<WorkerResult[]> {
      return Promise.all(operations.map((op) => execute(op.operation, op.shapesBrep, op.params)));
    },

    inFlight(): readonly number[] {
      return slots.map((slot) => slot.inFlight);
    },

    dispose,
  };
}
