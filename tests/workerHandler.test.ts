import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createWorkerHandler, createOperationRegistry, registerHandler } from '@/worker/index.js';
import type {
  InitRequest,
  OperationRequest,
  DisposeRequest,
  SuccessResponse,
  ErrorResponse,
} from '@/worker/index.js';

// ---------------------------------------------------------------------------
// Helpers — capture the onmessage handler installed by createWorkerHandler
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Worker global mock
const g = globalThis as any;

function fireMessage(data: unknown): Promise<void> {
  // The handler is async, so we need to await it
  return g.onmessage({ data } as MessageEvent);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createWorkerHandler', () => {
  const postMessage = vi.fn();
  const close = vi.fn();
  let origPostMessage: unknown;
  let origClose: unknown;
  let origOnMessage: unknown;

  beforeEach(() => {
    origPostMessage = g.postMessage;
    origClose = g.close;
    origOnMessage = g.onmessage;
    g.postMessage = postMessage;
    g.close = close;
  });

  afterEach(() => {
    postMessage.mockReset();
    close.mockReset();
    g.postMessage = origPostMessage;
    g.close = origClose;
    g.onmessage = origOnMessage;
  });

  // -------------------------------------------------------------------------
  // Init request
  // -------------------------------------------------------------------------

  describe('init request', () => {
    it('posts SuccessResponse when initFn succeeds', async () => {
      const initFn = vi.fn().mockResolvedValue(undefined);
      const registry = createOperationRegistry();
      createWorkerHandler(registry, initFn);

      const msg: InitRequest = { id: 'init-1', type: 'init', wasmUrl: '/test.wasm' };
      await fireMessage(msg);

      expect(initFn).toHaveBeenCalledWith('/test.wasm');
      expect(postMessage).toHaveBeenCalledTimes(1);
      const response = postMessage.mock.calls[0][0] as SuccessResponse;
      expect(response).toEqual({ id: 'init-1', success: true });
    });

    it('posts ErrorResponse when initFn throws an Error', async () => {
      const initFn = vi.fn().mockRejectedValue(new Error('WASM load failed'));
      const registry = createOperationRegistry();
      createWorkerHandler(registry, initFn);

      const msg: InitRequest = { id: 'init-2', type: 'init' };
      await fireMessage(msg);

      expect(postMessage).toHaveBeenCalledTimes(1);
      const response = postMessage.mock.calls[0][0] as ErrorResponse;
      expect(response).toEqual({
        id: 'init-2',
        success: false,
        error: 'WASM load failed',
      });
    });

    it('posts ErrorResponse with stringified non-Error throw', async () => {
      const initFn = vi.fn().mockRejectedValue('string error');
      const registry = createOperationRegistry();
      createWorkerHandler(registry, initFn);

      const msg: InitRequest = { id: 'init-3', type: 'init' };
      await fireMessage(msg);

      const response = postMessage.mock.calls[0][0] as ErrorResponse;
      expect(response.error).toBe('string error');
      expect(response.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Operation request
  // -------------------------------------------------------------------------

  describe('operation request', () => {
    it('posts ErrorResponse for unknown operation', async () => {
      const registry = createOperationRegistry();
      createWorkerHandler(registry, vi.fn());

      const msg: OperationRequest = {
        id: 'op-1',
        type: 'operation',
        operation: 'nonexistent',
        shapesBrep: [],
        parameters: {},
      };
      await fireMessage(msg);

      expect(postMessage).toHaveBeenCalledTimes(1);
      const response = postMessage.mock.calls[0][0] as ErrorResponse;
      expect(response).toEqual({
        id: 'op-1',
        success: false,
        error: 'Unknown operation: nonexistent',
      });
    });

    it('posts SuccessResponse with resultBrep when handler succeeds', async () => {
      let registry = createOperationRegistry();
      registry = registerHandler(registry, 'fuse', (_shapes, _params) => ({
        resultBrep: 'fused-brep',
      }));
      createWorkerHandler(registry, vi.fn());

      const msg: OperationRequest = {
        id: 'op-2',
        type: 'operation',
        operation: 'fuse',
        shapesBrep: ['a', 'b'],
        parameters: { tolerance: 0.01 },
      };
      await fireMessage(msg);

      expect(postMessage).toHaveBeenCalledTimes(1);
      const response = postMessage.mock.calls[0][0] as SuccessResponse;
      expect(response).toEqual({
        id: 'op-2',
        success: true,
        resultBrep: 'fused-brep',
      });
    });

    it('posts SuccessResponse with resultData when handler returns data only', async () => {
      let registry = createOperationRegistry();
      registry = registerHandler(registry, 'measure', () => ({
        resultData: { volume: 42 },
      }));
      createWorkerHandler(registry, vi.fn());

      const msg: OperationRequest = {
        id: 'op-3',
        type: 'operation',
        operation: 'measure',
        shapesBrep: ['shape1'],
        parameters: {},
      };
      await fireMessage(msg);

      const response = postMessage.mock.calls[0][0] as SuccessResponse;
      expect(response).toEqual({
        id: 'op-3',
        success: true,
        resultData: { volume: 42 },
      });
    });

    it('posts SuccessResponse with both resultBrep and resultData', async () => {
      let registry = createOperationRegistry();
      registry = registerHandler(registry, 'transform', () => ({
        resultBrep: 'transformed',
        resultData: { bbox: [0, 0, 0, 1, 1, 1] },
      }));
      createWorkerHandler(registry, vi.fn());

      const msg: OperationRequest = {
        id: 'op-4',
        type: 'operation',
        operation: 'transform',
        shapesBrep: ['s1'],
        parameters: {},
      };
      await fireMessage(msg);

      const response = postMessage.mock.calls[0][0] as SuccessResponse;
      expect(response).toEqual({
        id: 'op-4',
        success: true,
        resultBrep: 'transformed',
        resultData: { bbox: [0, 0, 0, 1, 1, 1] },
      });
    });

    it('omits resultBrep and resultData when handler returns neither', async () => {
      let registry = createOperationRegistry();
      registry = registerHandler(registry, 'noop', () => ({}));
      createWorkerHandler(registry, vi.fn());

      const msg: OperationRequest = {
        id: 'op-5',
        type: 'operation',
        operation: 'noop',
        shapesBrep: [],
        parameters: {},
      };
      await fireMessage(msg);

      const response = postMessage.mock.calls[0][0] as SuccessResponse;
      expect(response).toEqual({ id: 'op-5', success: true });
      expect(response).not.toHaveProperty('resultBrep');
      expect(response).not.toHaveProperty('resultData');
    });

    it('posts ErrorResponse when handler throws an Error', async () => {
      let registry = createOperationRegistry();
      registry = registerHandler(registry, 'failing', () => {
        throw new Error('handler boom');
      });
      createWorkerHandler(registry, vi.fn());

      const msg: OperationRequest = {
        id: 'op-6',
        type: 'operation',
        operation: 'failing',
        shapesBrep: [],
        parameters: {},
      };
      await fireMessage(msg);

      const response = postMessage.mock.calls[0][0] as ErrorResponse;
      expect(response).toEqual({
        id: 'op-6',
        success: false,
        error: 'handler boom',
      });
    });

    it('posts ErrorResponse with stringified non-Error throw from handler', async () => {
      let registry = createOperationRegistry();
      registry = registerHandler(registry, 'throws-string', () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- testing non-Error throw path
        throw '42';
      });
      createWorkerHandler(registry, vi.fn());

      const msg: OperationRequest = {
        id: 'op-7',
        type: 'operation',
        operation: 'throws-string',
        shapesBrep: [],
        parameters: {},
      };
      await fireMessage(msg);

      const response = postMessage.mock.calls[0][0] as ErrorResponse;
      expect(response.error).toBe('42');
      expect(response.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Dispose request
  // -------------------------------------------------------------------------

  describe('dispose request', () => {
    it('posts SuccessResponse and calls scope.close()', async () => {
      const registry = createOperationRegistry();
      createWorkerHandler(registry, vi.fn());

      const msg: DisposeRequest = { id: 'dispose-1', type: 'dispose' };
      await fireMessage(msg);

      expect(postMessage).toHaveBeenCalledTimes(1);
      const response = postMessage.mock.calls[0][0] as SuccessResponse;
      expect(response).toEqual({ id: 'dispose-1', success: true });
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('works when scope.close is undefined', async () => {
      g.close = undefined;
      const registry = createOperationRegistry();
      createWorkerHandler(registry, vi.fn());

      const msg: DisposeRequest = { id: 'dispose-2', type: 'dispose' };
      // Should not throw
      await fireMessage(msg);

      expect(postMessage).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Registry helpers
  // -------------------------------------------------------------------------

  describe('registry', () => {
    it('createOperationRegistry starts empty', () => {
      const registry = createOperationRegistry();
      expect(registry.operations.size).toBe(0);
    });

    it('registerHandler returns a new registry with the handler', () => {
      const r1 = createOperationRegistry();
      const handler = () => ({});
      const r2 = registerHandler(r1, 'test', handler);

      expect(r1.operations.size).toBe(0);
      expect(r2.operations.size).toBe(1);
      expect(r2.operations.get('test')).toBe(handler);
    });
  });
});
