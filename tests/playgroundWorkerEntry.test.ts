import { afterEach, describe, expect, it, vi } from 'vitest';

const WORKER_ENTRY = '../apps/playground/src/workers/cad.worker';

function stubWorkerScope(): ReturnType<typeof vi.fn> {
  const addListener = vi.fn();
  vi.stubGlobal('self', {});
  vi.stubGlobal('addEventListener', addListener);
  vi.stubGlobal('__WASM_ASSET_HASHES__', {});
  return addListener;
}

// WebKit evaluates a module worker entry again when a lazy chunk imports it
// back, so each evaluation here stands for one copy of the entry in one worker.
async function evaluateEntry(): Promise<void> {
  vi.resetModules();
  await import(WORKER_ENTRY);
}

describe('playground worker entry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds one message listener when the entry is evaluated twice in a worker', async () => {
    const addListener = stubWorkerScope();
    await evaluateEntry();
    await evaluateEntry();
    expect(addListener).toHaveBeenCalledTimes(1);
    expect(addListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('adds a listener in each new worker', async () => {
    const first = stubWorkerScope();
    await evaluateEntry();
    const second = stubWorkerScope();
    await evaluateEntry();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
