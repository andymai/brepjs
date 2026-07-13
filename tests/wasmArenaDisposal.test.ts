/**
 * occt-wasm arena disposal — proves `using`/Symbol.dispose actually reclaims
 * arena slots on the occt-wasm kernel.
 *
 * occt-wasm shapes are arena-allocated: a handle's own `.delete()` is a no-op,
 * so a slot is only reclaimed via `kernel.dispose()` (→ `k.release(id)`).
 * `createHandle` routes disposal through the kernel, so a `using`-scoped shape
 * frees its slot. `getShapeCount()` is the ground-truth oracle — the JS-side
 * `getDisposalStats().liveHandles` is blind to orphaned pre-downcast slots.
 *
 * Gated to occt-wasm: no other kernel exposes the arena counter (brepkit is a
 * no-free arena; occt/manifold have different memory models).
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  cylinder,
  sphere,
  translate,
  clone,
  getFaces,
  getEdges,
  measureVolume,
  isOk,
  unwrap,
} from '@/index.js';
import { getKernel } from '@/kernel/index.js';

const isOcctWasm = (process.env['TEST_KERNEL'] ?? 'occt') === 'occt-wasm';

beforeAll(async () => {
  await initKernel();
}, 30000);

/** occt-wasm's live-shape arena counter, the ground-truth leak oracle. */
function arenaCount(): number {
  const adapter = getKernel() as unknown as {
    retainedKernelOwner?: { getRawKernel?: () => { getShapeCount?: () => number } };
  };
  const raw = adapter.retainedKernelOwner?.getRawKernel?.();
  const n = typeof raw?.getShapeCount === 'function' ? raw.getShapeCount() : undefined;
  if (typeof n !== 'number') throw new Error('arena counter unavailable');
  return n;
}

/** Run `op` once to warm caches, then N times; return net arena growth per iteration. */
function perIterationLeak(op: () => void, iterations = 20): number {
  op();
  const before = arenaCount();
  for (let i = 0; i < iterations; i++) op();
  return (arenaCount() - before) / iterations;
}

describe.skipIf(!isOcctWasm)('occt-wasm arena disposal', () => {
  describe('using-scoped ops reclaim their arena slots', () => {
    it('primitives leak nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          void b;
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          using c = cylinder(5, 10);
          void c;
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          using s = sphere(5);
          void s;
        })
      ).toBe(0);
    });

    it('transform leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          using m = translate(b, [1, 0, 0]);
          void m;
        })
      ).toBe(0);
    });

    it('sub-shape extraction (getFaces/getEdges) leaks nothing when disposed', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          for (const f of getFaces(b)) f[Symbol.dispose]();
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          for (const e of getEdges(b)) e[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('clone leaks nothing when disposed', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          const r = clone(b);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });
  });

  describe('disposal is real, not a no-op', () => {
    it('creating then disposing a box returns the arena to baseline', () => {
      const before = arenaCount();
      const b = box(10, 10, 10);
      expect(arenaCount()).toBeGreaterThan(before);
      b[Symbol.dispose]();
      expect(arenaCount()).toBe(before);
    });
  });

  describe('clone is independent of its source (PR-1 + PR-2 integration)', () => {
    it('disposing a clone does not free the original', () => {
      using original = box(10, 10, 10);
      const cloned = unwrap(clone(original));
      cloned[Symbol.dispose]();
      // Source must survive the clone's disposal — before the copyShape fix the
      // clone aliased the source's arena slot, so this freed the original.
      expect(unwrap(measureVolume(original))).toBeCloseTo(1000, 0);
    });
  });
});
