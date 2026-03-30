/**
 * Integration tests for OcctWasmWorkerAdapter.
 *
 * Spawns a real OcctKernel in a Node worker thread via Comlink and
 * exercises the AsyncKernelAdapter interface end-to-end.
 *
 * Requires TEST_KERNEL=occt-wasm environment.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AsyncKernelAdapter } from '@/kernel/interfaces/asyncAdapter.js';

const KERNEL = process.env['TEST_KERNEL'] ?? 'occt';
const skip = KERNEL !== 'occt-wasm';

describe.skipIf(skip)('OcctWasmWorkerAdapter', () => {
  let adapter: AsyncKernelAdapter;
  let terminate: () => void;

  beforeAll(async () => {
    const { spawnNodeOcctWorker } = await import('./helpers/nodeWorkerShim.js');
    const { createWorkerAdapter } = await import('@/kernel/occtWasm/occtWasmWorkerAdapter.js');
    const worker = await spawnNodeOcctWorker();
    const result = createWorkerAdapter(worker.kernel, () => {
      worker.terminate();
    });
    adapter = result.adapter;
    terminate = () => {
      result.worker.terminate();
    };
  }, 60000);

  afterAll(() => {
    terminate();
  });

  it('exposes kernelId', () => {
    expect(adapter.kernelId).toBe('occt-wasm-worker');
  });

  it('makes a box and queries its volume', async () => {
    const box = await adapter.makeBox(10, 20, 30);
    expect(box).toBeDefined();
    const vol = await adapter.volume(box);
    expect(vol).toBeCloseTo(6000, 0);
  });

  it('performs a boolean fuse', async () => {
    const a = await adapter.makeBox(10, 10, 10);
    const b = await adapter.makeSphere(8);
    const fused = await adapter.fuse(a, b);
    expect(fused).toBeDefined();
    const vol = await adapter.volume(fused);
    expect(vol).toBeGreaterThan(1000);
  });

  it('exports and imports BREP', async () => {
    const box = await adapter.makeBox(5, 5, 5);
    const brep = await adapter.toBREP(box);
    expect(typeof brep).toBe('string');
    expect(brep.length).toBeGreaterThan(0);
    const reimported = await adapter.fromBREP(brep);
    expect(reimported).toBeDefined();
  });

  it('releases shapes without error', async () => {
    const box = await adapter.makeBox(1, 1, 1);
    await adapter.dispose(box);
  });

  it('queries shape type', async () => {
    const box = await adapter.makeBox(1, 1, 1);
    const type = await adapter.shapeType(box);
    expect(type).toBe('solid');
  });

  it('throws descriptive error for unsupported methods', async () => {
    // KernelEvolutionOps methods are not available via OcctWorker
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing unsupported path
      (adapter as any).fuseWithHistory({}, {}, [], 100)
    ).rejects.toThrow(/not supported.*worker/i);
  });
});
