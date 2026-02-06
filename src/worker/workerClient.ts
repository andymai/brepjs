/**
 * Worker client for offloading CAD operations to a Web Worker.
 *
 * Provides a promise-based API over the worker message protocol.
 */

import type {
  InitRequest,
  OperationRequest,
  DisposeRequest,
  WorkerResponse,
  ErrorResponse,
} from './protocol.js';
import { isSuccessResponse } from './protocol.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkerClientOptions {
  /** The Worker instance to communicate with. */
  worker: Worker;
  /** Optional URL for the WASM binary (passed to the worker on init). */
  wasmUrl?: string;
}

export interface WorkerResult {
  resultBrep?: string;
  resultData?: unknown;
}

export interface WorkerClient {
  /** Initialize the worker (load WASM). */
  init(): Promise<void>;
  /** Execute a named operation with BREP-serialized shapes and parameters. */
  execute(
    operation: string,
    shapesBrep: string[],
    params: Record<string, unknown>
  ): Promise<WorkerResult>;
  /** Dispose the client, rejecting all pending operations. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/** Create a worker client that communicates using the brepjs worker protocol. */
export function createWorkerClient(options: WorkerClientOptions): WorkerClient {
  const { worker, wasmUrl } = options;
  const pending = new Map<
    string,
    { resolve: (v: WorkerResult) => void; reject: (e: unknown) => void }
  >();
  let disposed = false;

  function nextId(): string {
    return crypto.randomUUID();
  }

  function onMessage(event: MessageEvent<WorkerResponse>) {
    const msg = event.data;
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);

    if (isSuccessResponse(msg)) {
      const result: WorkerResult = {};
      if (msg.resultBrep !== undefined) result.resultBrep = msg.resultBrep;
      if (msg.resultData !== undefined) result.resultData = msg.resultData;
      entry.resolve(result);
    } else {
      entry.reject(new Error((msg as ErrorResponse).error));
    }
  }

  worker.addEventListener('message', onMessage);

  function send(msg: { id: string }): Promise<WorkerResult> {
    if (disposed) return Promise.reject(new Error('WorkerClient has been disposed'));
    return new Promise<WorkerResult>((resolve, reject) => {
      pending.set(msg.id, { resolve, reject });
      worker.postMessage(msg);
    });
  }

  return {
    async init(): Promise<void> {
      const msg: InitRequest = {
        id: nextId(),
        type: 'init',
        ...(wasmUrl !== undefined ? { wasmUrl } : {}),
      };
      await send(msg);
    },

    async execute(
      operation: string,
      shapesBrep: string[],
      params: Record<string, unknown>
    ): Promise<WorkerResult> {
      const msg: OperationRequest = {
        id: nextId(),
        type: 'operation',
        operation,
        shapesBrep,
        parameters: params,
      };
      return send(msg);
    },

    dispose(): void {
      disposed = true;
      for (const entry of pending.values()) {
        entry.reject(new Error('WorkerClient disposed'));
      }
      pending.clear();
      worker.removeEventListener('message', onMessage);

      const msg: DisposeRequest = { id: nextId(), type: 'dispose' };
      worker.postMessage(msg);
    },
  };
}
