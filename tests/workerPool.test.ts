import { describe, expect, it, vi } from 'vitest';
import { createWorkerPool } from '@/index.js';

// ---------------------------------------------------------------------------
// Mock Worker (mirrors tests/workerClient.test.ts) — drives the protocol
// without a real Web Worker.
// ---------------------------------------------------------------------------

interface MockWorker {
  worker: Worker;
  getHandler: () => ((event: MessageEvent) => void) | null;
}

function createMockWorker(): MockWorker {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock Worker
  let messageHandler: any = null;
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();

  const worker = {
    postMessage: vi.fn(),
    addEventListener(event: string, handler: (...args: unknown[]) => void) {
      const list = listeners.get(event) ?? [];
      list.push(handler);
      listeners.set(event, list);
      if (event === 'message') messageHandler = handler;
    },
    removeEventListener(event: string, handler: (...args: unknown[]) => void) {
      const list = listeners.get(event) ?? [];
      listeners.set(
        event,
        list.filter((h) => h !== handler)
      );
      if (event === 'message' && messageHandler === handler) messageHandler = null;
    },
  } as unknown as Worker;

  return { worker, getHandler: () => messageHandler };
}

interface SentMessage {
  id: string;
  type: string;
  operation?: string;
}

function sentMessages(worker: Worker): SentMessage[] {
  return vi.mocked(worker).postMessage.mock.calls.map((c) => c[0] as SentMessage);
}

function postCount(worker: Worker): number {
  return vi.mocked(worker).postMessage.mock.calls.length;
}

function reply(
  mock: MockWorker,
  msg: SentMessage,
  response: { success: boolean; resultBrep?: string; error?: string }
): void {
  mock.getHandler()?.({ data: { id: msg.id, ...response } } as MessageEvent);
}

describe('createWorkerPool', () => {
  it('throws when constructed with zero workers', () => {
    expect(() => createWorkerPool({ workers: [] })).toThrow('at least one worker');
  });

  it('reports its size and starts idle', () => {
    const pool = createWorkerPool({
      workers: [createMockWorker().worker, createMockWorker().worker],
    });
    expect(pool.size).toBe(2);
    expect(pool.inFlight()).toEqual([0, 0]);
  });

  it('dispatches two concurrent ops to two different workers', () => {
    const a = createMockWorker();
    const b = createMockWorker();
    const pool = createWorkerPool({ workers: [a.worker, b.worker] });

    void pool.execute('fuse', ['x'], {}).catch(() => {});
    void pool.execute('cut', ['y'], {}).catch(() => {});

    expect(postCount(a.worker)).toBe(1);
    expect(postCount(b.worker)).toBe(1);
    expect(pool.inFlight()).toEqual([1, 1]);
  });

  it('spreads three ops 2/1 by least-loaded (ties go to the first worker)', () => {
    const a = createMockWorker();
    const b = createMockWorker();
    const pool = createWorkerPool({ workers: [a.worker, b.worker] });

    for (const op of ['a', 'b', 'c']) void pool.execute(op, [], {}).catch(() => {});

    expect(pool.inFlight()).toEqual([2, 1]);
    expect(postCount(a.worker)).toBe(2);
    expect(postCount(b.worker)).toBe(1);
  });

  it('routes a new op to the worker that just freed up', async () => {
    const a = createMockWorker();
    const b = createMockWorker();
    const pool = createWorkerPool({ workers: [a.worker, b.worker] });

    void pool.execute('op1', [], {}).catch(() => {}); // -> a, in-flight [1,0]
    const op2 = pool.execute('op2', [], {}); //            -> b, in-flight [1,1]

    // Finish b's op; in-flight returns to [1,0], so b is now the idle worker.
    reply(b, sentMessages(b.worker)[0] as SentMessage, { success: true, resultBrep: 'r2' });
    await expect(op2).resolves.toEqual({ resultBrep: 'r2' });
    expect(pool.inFlight()).toEqual([1, 0]);

    void pool.execute('op3', [], {}).catch(() => {}); // least-loaded -> b again
    expect(postCount(b.worker)).toBe(2);
    expect(postCount(a.worker)).toBe(1);
  });

  it('executeBatch resolves results in input order regardless of completion order', async () => {
    const a = createMockWorker();
    const b = createMockWorker();
    const pool = createWorkerPool({ workers: [a.worker, b.worker] });

    const batch = pool.executeBatch([
      { operation: 'a', shapesBrep: [], params: {} },
      { operation: 'b', shapesBrep: [], params: {} },
      { operation: 'c', shapesBrep: [], params: {} },
    ]);

    // Reply to every dispatched op, echoing its operation name as the result so
    // we can assert order. a got ops [a, c]; b got [b].
    for (const mock of [a, b]) {
      for (const msg of sentMessages(mock.worker)) {
        reply(mock, msg, { success: true, resultBrep: msg.operation });
      }
    }

    await expect(batch).resolves.toEqual([
      { resultBrep: 'a' },
      { resultBrep: 'b' },
      { resultBrep: 'c' },
    ]);
    expect(pool.inFlight()).toEqual([0, 0]);
  });

  it('init loads WASM on every worker', async () => {
    const a = createMockWorker();
    const b = createMockWorker();
    const pool = createWorkerPool({ workers: [a.worker, b.worker], wasmUrl: '/k.wasm' });

    const done = pool.init();
    for (const mock of [a, b]) {
      const msg = sentMessages(mock.worker)[0] as SentMessage;
      expect(msg.type).toBe('init');
      reply(mock, msg, { success: true });
    }
    await expect(done).resolves.toBeUndefined();
  });

  it('dispose rejects in-flight and subsequent ops', async () => {
    const a = createMockWorker();
    const b = createMockWorker();
    const pool = createWorkerPool({ workers: [a.worker, b.worker] });

    const inFlight = pool.execute('fuse', [], {});
    pool.dispose();

    await expect(inFlight).rejects.toThrow('disposed');
    await expect(pool.execute('fuse', [], {})).rejects.toThrow('disposed');
  });

  it('dispose is idempotent: a second call sends no further messages', () => {
    const a = createMockWorker();
    const b = createMockWorker();
    const pool = createWorkerPool({ workers: [a.worker, b.worker] });

    pool.dispose();
    const afterFirst = [postCount(a.worker), postCount(b.worker)];
    pool.dispose(); // guarded — must not re-dispatch dispose to closed workers

    expect([postCount(a.worker), postCount(b.worker)]).toEqual(afterFirst);
  });

  it('init failure disposes the whole pool and rethrows the original error', async () => {
    const a = createMockWorker();
    const b = createMockWorker();
    const pool = createWorkerPool({ workers: [a.worker, b.worker] });

    const done = pool.init();
    reply(a, sentMessages(a.worker)[0] as SentMessage, { success: true }); // a initializes
    reply(b, sentMessages(b.worker)[0] as SentMessage, {
      success: false,
      error: 'WASM load failed',
    });

    await expect(done).rejects.toThrow('WASM load failed');

    // Atomic init: the pool is now terminally disposed — no further dispatch, and
    // even the worker that succeeded was told to dispose so nothing leaks.
    await expect(pool.execute('fuse', [], {})).rejects.toThrow('disposed');
    expect(sentMessages(a.worker).some((m) => m.type === 'dispose')).toBe(true);
    expect(sentMessages(b.worker).some((m) => m.type === 'dispose')).toBe(true);
  });
});
