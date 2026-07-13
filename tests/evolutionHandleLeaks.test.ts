/**
 * Regression tests for gh #1749 — WASM shape-handle leaks in the boolean /
 * evolution / transform helpers and the face-lineage functions.
 *
 * Two kinds of assertion:
 *  - Kernel-agnostic: assignRoles / setShapeOrigin must not *retain* tracked
 *    face handles (they read hashes transiently), so getDisposalStats().liveHandles
 *    returns to baseline; and the operations stay geometrically correct (exact
 *    volumes) after their temporaries are released.
 *  - occt-wasm arena: repeated operations must not grow the arena once results
 *    are released, proving the orphaned pre-downcast handles (castResultShape),
 *    transient faces, and queried tool sub-solids (resolveBooleanTool) are all
 *    reclaimed.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from './setup.js';
import {
  box,
  translate,
  cut,
  fillet,
  compound,
  getFaces,
  fuseWithEvolution,
  cutWithEvolution,
  intersectWithEvolution,
  filletWithEvolution,
  chamferWithEvolution,
  shellWithEvolution,
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
  // box(10) is 1000; the second box overlaps it by a 5×10×10 = 500 slab.
  const a = () => box(10, 10, 10);
  const b = () => translate(box(10, 10, 10), [5, 0, 0]);

  it('fuse with evolution keeps the exact union volume', () => {
    const r = fuseWithEvolution(a(), b());
    expect(isOk(r)).toBe(true);
    expect(unwrap(measureVolume(unwrap(r).shape))).toBeCloseTo(1500, 3);
  });

  it('cut with evolution keeps the exact difference volume', () => {
    const r = cutWithEvolution(a(), b());
    expect(isOk(r)).toBe(true);
    expect(unwrap(measureVolume(unwrap(r).shape))).toBeCloseTo(500, 3);
  });

  it('intersect with evolution keeps the exact common volume', () => {
    const r = intersectWithEvolution(a(), b());
    expect(isOk(r)).toBe(true);
    expect(unwrap(measureVolume(unwrap(r).shape))).toBeCloseTo(500, 3);
  });

  it('boolean over metadata-tagged inputs still succeeds (exercises collectInputFaceHashes)', () => {
    // Tagging the inputs forces collectInputFaceHashes off its no-metadata
    // fast path, so its transient faces are actually iterated and released.
    const x = a();
    const y = b();
    setShapeOrigin(x, 1);
    setShapeOrigin(y, 2);

    const r = fuseWithEvolution(x, y);
    expect(isOk(r)).toBe(true);
    expect(unwrap(measureVolume(unwrap(r).shape))).toBeCloseTo(1500, 3);
  });

  it('cut with a multi-solid compound tool still works (exercises resolveBooleanTool fuseAll)', () => {
    const base = box(20, 20, 20); // 8000
    const tool = compound([
      translate(box(4, 4, 4), [2, 2, 2]),
      translate(box(4, 4, 4), [14, 14, 14]),
    ]);
    const r = cut(base, tool, { unsafe: true });
    expect(isOk(r)).toBe(true);
    // Two disjoint 4³ = 64 cavities fully inside the base.
    expect(unwrap(measureVolume(unwrap(r)))).toBeCloseTo(8000 - 128, 3);
  });

  it('fillet/chamfer/shell with evolution still produce valid solids', () => {
    const fil = filletWithEvolution(box(10, 10, 10), undefined, 1);
    expect(isOk(fil)).toBe(true);
    expect(unwrap(measureVolume(unwrap(fil).shape))).toBeGreaterThan(0);

    const cham = chamferWithEvolution(box(10, 10, 10), undefined, 1);
    expect(isOk(cham)).toBe(true);
    expect(unwrap(measureVolume(unwrap(cham).shape))).toBeGreaterThan(0);

    const solid = box(10, 10, 10);
    const top = getFaces(solid)[0];
    expect(top).toBeDefined();
    if (top) {
      const shelled = shellWithEvolution(solid, [top], 1);
      expect(isOk(shelled)).toBe(true);
      const vol = unwrap(measureVolume(unwrap(shelled).shape));
      expect(vol).toBeGreaterThan(0);
      expect(vol).toBeLessThan(1000); // hollowed, so less than the solid box
    }
  });
});

describe('operation temporaries are reclaimed from the occt-wasm arena (#1749)', () => {
  it.skipIf(currentKernel !== 'occt-wasm')(
    'repeated cut/fillet/translate do not grow the arena once results are released',
    () => {
      if (occtWasmShapeCount() === undefined) return; // counter unavailable

      const base = box(20, 20, 20);
      const tool = translate(box(10, 10, 10), [5, 5, 5]);
      const multiTool = compound([
        translate(box(3, 3, 3), [2, 2, 2]),
        translate(box(3, 3, 3), [15, 15, 15]),
      ]);

      const cycle = (): void => {
        const results = [
          cut(base, tool), // castToShape3D + resolveBooleanTool (single solid)
          cut(base, multiTool, { unsafe: true }), // resolveBooleanTool fuseAll branch
          fillet(base, undefined, 0.5), // modifierFns.finalizeShape3D
        ];
        for (const r of results) {
          expect(isOk(r)).toBe(true);
          if (isOk(r)) getKernel().dispose(r.value.wrapped);
        }
        const moved = translate(base, [1, 0, 0]); // transformFns
        getKernel().dispose(moved.wrapped);
      };

      // Warm up one-time caches so the measured window is steady-state.
      cycle();

      const start = occtWasmShapeCount() ?? 0;
      const iterations = 20;
      for (let i = 0; i < iterations; i++) cycle();
      const growth = (occtWasmShapeCount() ?? 0) - start;

      // Before the fix each cycle orphaned ~5 handles (two boolean results, the
      // fused sub-solid tool, a fillet result, a transform result) — ~100 over
      // the loop. With the fix, released results leave the arena flat (0).
      expect(growth).toBeLessThanOrEqual(5);
    }
  );
});
