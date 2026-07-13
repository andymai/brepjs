/**
 * Regression tests for gh #1753 — the not-3D / not-Solid error branches of the
 * boolean/evolution/modifier ops leaked the rejected cast result on occt-wasm
 * (a handle's own delete() is a no-op there). The fix routes those branches
 * through disposeResultShape(), which releases the arena slot.
 *
 * The not-3D branches can't be triggered deterministically from geometry (valid
 * booleans/fillets always produce 3D), so these tests exercise the disposal
 * mechanism directly: arena reclamation on occt-wasm, and cross-kernel safety.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from './setup.js';
import { box } from '@/index.js';
import { getKernel } from '@/kernel/index.js';
import { disposeResultShape } from '@/core/shapeTypes.js';
import { getDisposalStats } from '@/core/disposal.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

/** Reach occt-wasm's live-shape counter, or undefined on other kernels. */
function occtWasmShapeCount(): number | undefined {
  const adapter = getKernel() as unknown as {
    k?: { getShapeCount?: () => number };
    retainedKernelOwner?: { getRawKernel?: () => { getShapeCount?: () => number } };
  };
  const raw = adapter.retainedKernelOwner?.getRawKernel?.() ?? adapter.k;
  return typeof raw?.getShapeCount === 'function' ? raw.getShapeCount() : undefined;
}

describe('disposeResultShape (#1753)', () => {
  it('marks the handle disposed and updates stats, on every kernel', () => {
    const s = box(5, 5, 5);
    const before = getDisposalStats().liveHandles;
    disposeResultShape(s);
    expect(s.disposed).toBe(true);
    expect(getDisposalStats().liveHandles).toBe(before - 1);
  });

  it.skipIf(currentKernel !== 'occt-wasm')('reclaims the arena slot on occt-wasm', () => {
    const before = occtWasmShapeCount();
    if (before === undefined) return;

    const s = box(5, 5, 5);
    expect((occtWasmShapeCount() ?? 0) > before).toBe(true); // slot allocated

    disposeResultShape(s);
    expect(occtWasmShapeCount()).toBe(before); // slot reclaimed
  });

  it.skipIf(currentKernel !== 'occt-wasm')(
    'repeated allocate + disposeResultShape does not grow the arena',
    () => {
      if (occtWasmShapeCount() === undefined) return;
      const start = occtWasmShapeCount() ?? 0;
      for (let i = 0; i < 25; i++) disposeResultShape(box(3, 3, 3));
      expect((occtWasmShapeCount() ?? 0) - start).toBeLessThanOrEqual(1);
    }
  );
});
