/**
 * Worker handler for processing CAD operations inside a Web Worker.
 *
 * Provides a registry-based approach for defining operation handlers.
 */

import type { WorkerRequest, SuccessResponse, ErrorResponse, BatchItemResult } from './protocol.js';
import { isInitRequest, isOperationRequest, isDisposeRequest, isBatchRequest } from './protocol.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Handler function for a single named worker operation. */
export type OperationHandler = (
  shapesBrep: ReadonlyArray<string>,
  params: Readonly<Record<string, unknown>>
) => { resultBrep?: string; resultData?: unknown };

/** Immutable registry mapping operation names to their handler functions. */
export interface OperationRegistry {
  readonly operations: ReadonlyMap<string, OperationHandler>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Create an empty operation registry. */
export function createOperationRegistry(): OperationRegistry {
  return { operations: new Map() };
}

/** Register a named operation handler. Returns a new registry. */
export function registerHandler(
  registry: OperationRegistry,
  name: string,
  handler: OperationHandler
): OperationRegistry {
  const operations = new Map(registry.operations);
  operations.set(name, handler);
  return { operations };
}

// ---------------------------------------------------------------------------
// Worker handler setup
// ---------------------------------------------------------------------------

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Run one registered operation, capturing unknown-op and thrown errors as a result. */
function runOp(
  registry: OperationRegistry,
  operation: string,
  shapesBrep: ReadonlyArray<string>,
  params: Readonly<Record<string, unknown>>
): BatchItemResult {
  const handler = registry.operations.get(operation);
  if (!handler) return { success: false, error: `Unknown operation: ${operation}` };
  try {
    const r = handler(shapesBrep, params);
    return {
      success: true,
      ...(r.resultBrep !== undefined ? { resultBrep: r.resultBrep } : {}),
      ...(r.resultData !== undefined ? { resultData: r.resultData } : {}),
    };
  } catch (e) {
    return { success: false, error: errorMessage(e) };
  }
}

/** Build a single-operation response from a per-op result. */
function itemToResponse(id: string, item: BatchItemResult): SuccessResponse | ErrorResponse {
  if (!item.success) return { id, success: false, error: item.error ?? 'operation failed' };
  return {
    id,
    success: true,
    ...(item.resultBrep !== undefined ? { resultBrep: item.resultBrep } : {}),
    ...(item.resultData !== undefined ? { resultData: item.resultData } : {}),
  };
}

/**
 * Set up message handling in a Web Worker context.
 *
 * @param registry - The operation registry.
 * @param initFn - Async function called on InitRequest (e.g., to load WASM).
 */
export function createWorkerHandler(
  registry: OperationRegistry,
  initFn: (wasmUrl?: string) => Promise<void>
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Worker global scope
  const scope = globalThis as any;

  scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const msg = event.data;

    if (isInitRequest(msg)) {
      try {
        await initFn(msg.wasmUrl);
        const response: SuccessResponse = { id: msg.id, success: true };
        scope.postMessage(response);
      } catch (e) {
        const response: ErrorResponse = { id: msg.id, success: false, error: errorMessage(e) };
        scope.postMessage(response);
      }
      return;
    }

    if (isOperationRequest(msg)) {
      const item = runOp(registry, msg.operation, msg.shapesBrep, msg.parameters);
      scope.postMessage(itemToResponse(msg.id, item));
      return;
    }

    if (isBatchRequest(msg)) {
      // Per-op results so one failure doesn't discard the rest; sent in resultData.
      const results = msg.operations.map((op) =>
        runOp(registry, op.operation, op.shapesBrep, op.params)
      );
      const response: SuccessResponse = { id: msg.id, success: true, resultData: results };
      scope.postMessage(response);
      return;
    }

    if (isDisposeRequest(msg)) {
      const response: SuccessResponse = { id: msg.id, success: true };
      scope.postMessage(response);
      scope.close?.();
    }
  };
}
