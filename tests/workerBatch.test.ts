import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createWorkerClient,
  createWorkerHandler,
  createOperationRegistry,
  registerHandler,
  isBatchRequest,
} from '@/worker/index.js';
import type { BatchRequest, SuccessResponse } from '@/worker/index.js';

// ---------------------------------------------------------------------------
// Mock Worker (mirrors tests/workerClient.test.ts)
// ---------------------------------------------------------------------------

function createMockWorker(): {
  worker: Worker;
  getHandler: () => ((event: MessageEvent) => void) | null;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock Worker
  let messageHandler: any = null;
  const worker = {
    postMessage: vi.fn(),
    addEventListener(event: string, handler: (...args: unknown[]) => void) {
      if (event === 'message') messageHandler = handler;
    },
    removeEventListener() {},
  } as unknown as Worker;
  return { worker, getHandler: () => messageHandler };
}

describe('isBatchRequest', () => {
  it('narrows batch requests only', () => {
    expect(isBatchRequest({ id: '1', type: 'batch', operations: [] } as BatchRequest)).toBe(true);
    expect(isBatchRequest({ id: '2', type: 'operation' })).toBe(false);
  });
});

describe('WorkerClient.executeBatch', () => {
  it('sends ONE message of type batch and resolves with per-op results in order', async () => {
    const { worker, getHandler } = createMockWorker();
    const client = createWorkerClient({ worker });

    const p = client.executeBatch([
      { operation: 'a', shapesBrep: ['x'], params: {} },
      { operation: 'b', shapesBrep: [], params: { k: 1 } },
    ]);

    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest mock
    const postMessage = vi.mocked(worker).postMessage;
    expect(postMessage).toHaveBeenCalledTimes(1); // one message for the whole batch
    const sent = postMessage.mock.calls.at(0)?.at(0) as {
      id: string;
      type: string;
      operations: unknown[];
    };
    expect(sent.type).toBe('batch');
    expect(sent.operations.length).toBe(2);

    getHandler()?.({
      data: {
        id: sent.id,
        success: true,
        resultData: [
          { success: true, resultBrep: 'A' },
          { success: false, error: 'boom' },
        ],
      },
    } as MessageEvent);

    // A failing op is an item in the array, not a rejection of the whole batch.
    await expect(p).resolves.toEqual([
      { success: true, resultBrep: 'A' },
      { success: false, error: 'boom' },
    ]);
  });

  it('resolves to [] for an empty batch', async () => {
    const { worker, getHandler } = createMockWorker();
    const client = createWorkerClient({ worker });
    const p = client.executeBatch([]);
    const sent = vi.mocked(worker).postMessage.mock.calls.at(0)?.at(0) as { id: string };
    getHandler()?.({ data: { id: sent.id, success: true, resultData: [] } } as MessageEvent);
    await expect(p).resolves.toEqual([]);
  });

  it('rejects a malformed batch response instead of silently dropping ops', async () => {
    const { worker, getHandler } = createMockWorker();
    const client = createWorkerClient({ worker });
    // Two ops requested, but the worker replies with a single-op shape (no array).
    const p = client.executeBatch([
      { operation: 'a', shapesBrep: [], params: {} },
      { operation: 'b', shapesBrep: [], params: {} },
    ]);
    const sent = vi.mocked(worker).postMessage.mock.calls.at(0)?.at(0) as { id: string };
    getHandler()?.({ data: { id: sent.id, success: true, resultBrep: 'oops' } } as MessageEvent);
    await expect(p).rejects.toThrow('Invalid batch response');
  });

  it('validates against the batch length at call time, not a later mutation', async () => {
    const { worker, getHandler } = createMockWorker();
    const client = createWorkerClient({ worker });
    const ops = [
      { operation: 'a', shapesBrep: [], params: {} },
      { operation: 'b', shapesBrep: [], params: {} },
    ];
    const p = client.executeBatch(ops);
    ops.push({ operation: 'c', shapesBrep: [], params: {} }); // mutate after the call

    const sent = vi.mocked(worker).postMessage.mock.calls.at(0)?.at(0) as { id: string };
    // The worker replies with the 2 results it actually received.
    getHandler()?.({
      data: { id: sent.id, success: true, resultData: [{ success: true }, { success: true }] },
    } as MessageEvent);

    await expect(p).resolves.toHaveLength(2); // not rejected despite ops.length now 3
  });
});

describe('handler batch dispatch', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Worker global mock
  const g = globalThis as any;
  const postMessage = vi.fn();
  let origPostMessage: unknown;
  let origOnMessage: unknown;

  beforeEach(() => {
    origPostMessage = g.postMessage;
    origOnMessage = g.onmessage;
    g.postMessage = postMessage;
  });
  afterEach(() => {
    postMessage.mockReset();
    g.postMessage = origPostMessage;
    g.onmessage = origOnMessage;
  });

  it('runs each op in order and isolates failures into per-op results', async () => {
    const registry = registerHandler(
      registerHandler(createOperationRegistry(), 'ok', () => ({ resultBrep: 'R' })),
      'boom',
      () => {
        throw new Error('kaboom');
      }
    );
    createWorkerHandler(registry, async () => {});

    const msg: BatchRequest = {
      id: 'b1',
      type: 'batch',
      operations: [
        { operation: 'ok', shapesBrep: [], params: {} },
        { operation: 'missing', shapesBrep: [], params: {} },
        { operation: 'boom', shapesBrep: [], params: {} },
      ],
    };
    await g.onmessage({ data: msg } as MessageEvent);

    expect(postMessage).toHaveBeenCalledTimes(1); // one response for the batch
    const resp = postMessage.mock.calls.at(0)?.at(0) as SuccessResponse;
    expect(resp.id).toBe('b1');
    expect(resp.success).toBe(true);
    expect(resp.resultData).toEqual([
      { success: true, resultBrep: 'R' },
      { success: false, error: 'Unknown operation: missing' },
      { success: false, error: 'kaboom' },
    ]);
  });
});
