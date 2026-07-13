/**
 * Regression tests for gh #1749 — WASM shape-handle leaks in the
 * WithEvolution / boolean helpers and the face-lineage functions.
 *
 * Two kinds of assertion:
 *  - Kernel-agnostic: assignRoles / setShapeOrigin must not *retain* tracked
 *    face handles (they read hashes transiently), so getDisposalStats().liveHandles
 *    returns to baseline. Before the fix these leaked one handle per face.
 *  - occt-wasm arena: repeated booleans must not grow the arena once results are
 *    released, proving the orphaned pre-downcast handles (castShape) and queried
 *    tool sub-solids (resolveBooleanTool) are reclaimed.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from './setup.js';
import {
  box,
  translate,
  cut,
  fuseWithEvolution,
  cutWithEvolution,
  intersectWithEvolution,
  filletWithEvolution,
  chamferWithEvolution,
  assignRoles,
  setShapeOrigin,
  getFaceOrigins,
  isOk,
  unwrap,
  measureVolume,
} from '@/index.js';
import { getKernel } from '@/kernel/index.js';
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

describe('face-lineage functions do not retain face handles (#1749)', () => {
  it('assignRoles releases every transient face it inspects', () => {
    // Force the box handle to exist before measuring.
    const shape = box(10, 10, 10);
    const before = getDisposalStats().liveHandles;
    const roles = assignRoles(shape, 'box');
    const after = getDisposalStats().liveHandles;

    // Roles were still assigned...
    expect(roles.size).toBeGreaterThan(0);
    // ...but no face handle stayed alive (previously +N via the cached getFaces).
    expect(after - before).toBe(0);
  });

  it('setShapeOrigin tags faces without retaining handles', () => {
    const shape = box(10, 10, 10);
    const before = getDisposalStats().liveHandles;
    setShapeOrigin(shape, 42);
    const after = getDisposalStats().liveHandles;

    const origins = getFaceOrigins(shape);
    // Face count varies by kernel (mesh kernels collapse hashes); assert the
    // tagging happened and, crucially, that no handle was retained.
    expect(origins?.size).toBeGreaterThan(0);
    for (const tag of origins?.values() ?? []) expect(tag).toBe(42);
    expect(after - before).toBe(0);
  });
});

describe('WithEvolution helpers stay correct after releasing temporaries (#1749)', () => {
  it('fuse/cut/intersect with evolution still produce valid solids', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [5, 0, 0]);

    const fused = fuseWithEvolution(a, b);
    expect(isOk(fused)).toBe(true);
    expect(unwrap(measureVolume(unwrap(fused).shape))).toBeGreaterThan(0);

    const c = box(10, 10, 10);
    const d = translate(box(10, 10, 10), [5, 0, 0]);
    const cutRes = cutWithEvolution(c, d);
    expect(isOk(cutRes)).toBe(true);
    expect(unwrap(measureVolume(unwrap(cutRes).shape))).toBeGreaterThan(0);

    const e = box(10, 10, 10);
    const f = translate(box(10, 10, 10), [5, 0, 0]);
    const intRes = intersectWithEvolution(e, f);
    expect(isOk(intRes)).toBe(true);
    expect(unwrap(measureVolume(unwrap(intRes).shape))).toBeGreaterThan(0);
  });

  it('boolean over metadata-tagged inputs still succeeds (exercises collectInputFaceHashes)', () => {
    // Tagging the inputs forces collectInputFaceHashes off its no-metadata
    // fast path, so its transient faces are actually iterated and released.
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [5, 0, 0]);
    setShapeOrigin(a, 1);
    setShapeOrigin(b, 2);

    const fused = fuseWithEvolution(a, b);
    expect(isOk(fused)).toBe(true);
    expect(unwrap(measureVolume(unwrap(fused).shape))).toBeGreaterThan(0);
  });

  it('fillet/chamfer with evolution still produce valid solids', () => {
    const fil = filletWithEvolution(box(10, 10, 10), undefined, 1);
    expect(isOk(fil)).toBe(true);
    expect(unwrap(measureVolume(unwrap(fil).shape))).toBeGreaterThan(0);

    const cham = chamferWithEvolution(box(10, 10, 10), undefined, 1);
    expect(isOk(cham)).toBe(true);
    expect(unwrap(measureVolume(unwrap(cham).shape))).toBeGreaterThan(0);
  });
});

describe('boolean temporaries are reclaimed from the occt-wasm arena (#1749)', () => {
  it.skipIf(currentKernel !== 'occt-wasm')(
    'repeated cut() does not grow the arena once results are released',
    () => {
      if (occtWasmShapeCount() === undefined) return; // counter unavailable

      const base = box(20, 20, 20);
      const tool = translate(box(10, 10, 10), [5, 5, 5]);

      // Warm up one-time caches so the measured window is steady-state.
      const warm = cut(base, tool);
      expect(isOk(warm)).toBe(true);
      if (isOk(warm)) getKernel().dispose(warm.value.wrapped);

      const start = occtWasmShapeCount() ?? 0;
      const iterations = 25;
      for (let i = 0; i < iterations; i++) {
        const r = cut(base, tool);
        expect(isOk(r)).toBe(true);
        if (isOk(r)) getKernel().dispose(r.value.wrapped);
      }
      const growth = (occtWasmShapeCount() ?? 0) - start;

      // Each iteration used to orphan the pre-downcast result handle plus the
      // queried tool sub-solid (~2 handles/iter, ~50 over the loop). With the
      // fix, released results leave the arena flat aside from minor churn.
      expect(growth).toBeLessThanOrEqual(iterations);
      expect(growth / iterations).toBeLessThan(1);
    }
  );
});
