/**
 * Worker handler for processing CAD operations inside a Web Worker.
 *
 * Provides a registry-based approach for defining operation handlers.
 */

import type { WorkerRequest, SuccessResponse, ErrorResponse } from './protocol.js';
import { isInitRequest, isOperationRequest, isDisposeRequest } from './protocol.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OperationHandler = (
  shapesBrep: ReadonlyArray<string>,
  params: Readonly<Record<string, unknown>>
) => { resultBrep?: string; resultData?: unknown };

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
        const response: ErrorResponse = {
          id: msg.id,
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
        scope.postMessage(response);
      }
      return;
    }

    if (isOperationRequest(msg)) {
      const handler = registry.operations.get(msg.operation);
      if (!handler) {
        const response: ErrorResponse = {
          id: msg.id,
          success: false,
          error: `Unknown operation: ${msg.operation}`,
        };
        scope.postMessage(response);
        return;
      }

      try {
        const result = handler(msg.shapesBrep, msg.parameters);
        const response: SuccessResponse = {
          id: msg.id,
          success: true,
          ...(result.resultBrep !== undefined ? { resultBrep: result.resultBrep } : {}),
          ...(result.resultData !== undefined ? { resultData: result.resultData } : {}),
        };
        scope.postMessage(response);
      } catch (e) {
        const response: ErrorResponse = {
          id: msg.id,
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
        scope.postMessage(response);
      }
      return;
    }

    if (isDisposeRequest(msg)) {
      const response: SuccessResponse = { id: msg.id, success: true };
      scope.postMessage(response);
      scope.close?.();
    }
  };
}
