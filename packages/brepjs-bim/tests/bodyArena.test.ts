import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { box, DisposalScope, getFaces, measureVolume, unwrap } from 'brepjs';
import { getKernel } from '@/kernel/index.js';
import { isOcctWasmHandle } from '@/kernel/occtWasm/helpers.js';
import { OcctWasmAdapter } from '@/kernel/occtWasm/occtWasmAdapter.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { createOverlapFixture } from './helpers/nativeBodyFixture.js';
import { nativeShapeCount } from './helpers/nativeArena.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

afterEach(() => vi.restoreAllMocks());

// Legacy OCCT has no arena counter. Its geometry/disposal probes run in
// nativeBodyBaseline.test.ts; only this raw-occt-wasm oracle is backend-specific.
describe.runIf(currentKernel === 'occt-wasm')('Product Body native arena oracle', () => {
  it('requires a real counter and reclaims fixtures and borrowed topology with their owner', () => {
    const beforeFixture = nativeShapeCount();
    {
      using scope = new DisposalScope();
      const { a, b, p } = createOverlapFixture(scope);
      const liveInputs = nativeShapeCount();
      expect(liveInputs).toBe(beforeFixture + 3);
      // getFaces borrows cached handles. Disposing the parent releases the cache.
      expect(getFaces(b)).toHaveLength(6);
      expect(nativeShapeCount()).toBeGreaterThan(liveInputs);
      expect(unwrap(measureVolume(a))).toBeCloseTo(1, 8);
      expect(unwrap(measureVolume(b))).toBeCloseTo(1, 8);
      expect(unwrap(measureVolume(p))).toBeCloseTo(2, 8);
    }
    expect(nativeShapeCount()).toBe(beforeFixture);
  });

  it('fails the gate when raw counter access is missing', () => {
    const adapter = getKernel();
    if (!(adapter instanceof OcctWasmAdapter) || !adapter.retainedKernelOwner) {
      throw new Error('Required occt-wasm owner is unavailable');
    }
    const rawAccess = vi.spyOn(adapter.retainedKernelOwner, 'getRawKernel');
    rawAccess.mockReturnValue({});
    expect(nativeShapeCount).toThrow('getShapeCount() counter is unavailable');
    rawAccess.mockRestore();
    expect(nativeShapeCount()).toBeGreaterThanOrEqual(0);
  });

  it('detects native retention even when the core handle swallows a release failure', () => {
    const beforeFixture = nativeShapeCount();
    const solid = box(1, 1, 1);
    const raw: unknown = solid.wrapped;
    if (!isOcctWasmHandle(raw)) throw new Error('Expected an occt-wasm arena handle');
    const adapter = getKernel();
    const realDispose = adapter.dispose.bind(adapter);
    const release = vi.spyOn(adapter, 'dispose').mockImplementation(() => {
      throw new Error('injected before native release');
    });
    try {
      // Current core behavior swallows the kernel exception and marks the
      // handle disposed. Only the native counter reveals the outstanding slot.
      solid[Symbol.dispose]();
      expect(release).toHaveBeenCalledTimes(1);
      expect(solid.disposed).toBe(true);
      expect(nativeShapeCount()).toBe(beforeFixture + 1);
    } finally {
      release.mockRestore();
      // The probe owns the captured raw slot and knows its injection never
      // released it. Release explicitly without pretending the owner succeeded.
      realDispose(raw);
    }
    expect(nativeShapeCount()).toBe(beforeFixture);
  });
});
