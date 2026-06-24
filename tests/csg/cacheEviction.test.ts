// LRU eviction for the CSG evaluator cache (opt-in via maxCacheEntries).
// Focus is correctness under the borrowed-shape contract: shared handles
// (created by identity short-circuits like Fuse(Empty, b) → b) must survive
// until their LAST cache key is evicted, and the unbounded default must be
// behaviourally unchanged.

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from '../setup.js';
import { Evaluator, withEvaluator, box, sphere, fuse, emptySolid, param } from '@/csg/index.js';
import { unwrap, measureVolume, getDisposalStats } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('CSG cache eviction — default (unbounded)', () => {
  it('never evicts when maxCacheEntries is unset', () => {
    using ev = new Evaluator();
    for (let i = 1; i <= 12; i++) unwrap(ev.evaluate(box(i, 5, 5)));
    const s = ev.cacheStats();
    expect(s.evictions).toBe(0);
    expect(s.entries).toBe(12);
  });
});

describe('CSG cache eviction — bounded', () => {
  it('rejects a non-positive-integer bound', () => {
    expect(() => new Evaluator({ maxCacheEntries: 0 })).toThrow(RangeError);
    expect(() => new Evaluator({ maxCacheEntries: -3 })).toThrow(RangeError);
    expect(() => new Evaluator({ maxCacheEntries: 2.5 })).toThrow(RangeError);
  });

  it('caps the cache at maxCacheEntries and counts evictions', () => {
    using ev = new Evaluator({ maxCacheEntries: 4 });
    for (let i = 1; i <= 12; i++) unwrap(ev.evaluate(box(i, 5, 5)));
    expect(ev.cacheStats().entries).toBeLessThanOrEqual(4);
    expect(ev.cacheStats().evictions).toBe(8); // 12 single-node trees, 4 kept
  });

  it('keeps recently-used entries and evicts the stale one (LRU)', () => {
    using ev = new Evaluator({ maxCacheEntries: 2 });
    const a = box(2, 2, 2);
    const b = box(3, 3, 3);
    const c = box(4, 4, 4);
    unwrap(ev.evaluate(a)); // [a]
    unwrap(ev.evaluate(b)); // [a, b]
    unwrap(ev.evaluate(a)); // touch a → [b, a]
    unwrap(ev.evaluate(c)); // +c → evict LRU (b) → [a, c]

    ev.resetStats();
    unwrap(ev.evaluate(a)); // survived → hit
    expect(ev.cacheStats()).toMatchObject({ hits: 1, misses: 0 });

    ev.resetStats();
    unwrap(ev.evaluate(b)); // evicted → miss + re-materialize
    expect(ev.cacheStats().misses).toBeGreaterThanOrEqual(1);
  });

  it('re-materializes correct geometry after an entry is evicted', () => {
    using ev = new Evaluator({ maxCacheEntries: 2 });
    const a = box(5, 5, 5);
    unwrap(ev.evaluate(a));
    unwrap(ev.evaluate(sphere(3))); // push a toward the tail
    unwrap(ev.evaluate(box(8, 8, 8))); // evict a
    expect(ev.cacheStats().evictions).toBeGreaterThanOrEqual(1);
    const r = unwrap(ev.evaluate(a)); // miss → rebuild
    expect(unwrap(measureVolume(r))).toBeCloseTo(125, 3);
  });

  it('honors the bound through withEvaluator', () => {
    const vol = withEvaluator({ maxCacheEntries: 2 }, (ev) => {
      for (let i = 1; i <= 6; i++) unwrap(ev.evaluate(box(i, 4, 4)));
      expect(ev.cacheStats().entries).toBeLessThanOrEqual(2);
      return unwrap(measureVolume(unwrap(ev.evaluate(box(5, 4, 4)))));
    });
    expect(vol).toBeCloseTo(80, 3); // 5*4*4
  });
});

describe('CSG cache eviction — shared-handle safety', () => {
  it('keeps a shared handle alive while one of its keys is evicted', () => {
    // Fuse(b, Empty) short-circuits to b's handle, so the box key and the
    // fuse key back the SAME handle (refcount 2). With a bound of 1, the
    // older box key is evicted but the handle must survive (refcount → 1),
    // not be freed — otherwise the returned result is a disposed handle.
    using ev = new Evaluator({ maxCacheEntries: 1 });
    const b = box(4, 4, 4);
    const r1 = unwrap(ev.evaluate(fuse(b, emptySolid())));
    expect(ev.cacheStats().evictions).toBe(1); // box key evicted, fuse key kept
    expect(unwrap(measureVolume(r1))).toBeCloseTo(64, 3); // handle still live

    const r2 = unwrap(ev.evaluate(fuse(b, emptySolid()))); // fuse key hit
    expect(unwrap(measureVolume(r2))).toBeCloseTo(64, 3);
  });
});

describe('CSG cache eviction — disposal accounting', () => {
  it('frees an evicted handle and leaves no leak after dispose', () => {
    const base = getDisposalStats().liveHandles;
    {
      using ev = new Evaluator({ maxCacheEntries: 1 });
      unwrap(ev.evaluate(box(3, 3, 3))); // [box1]
      const afterFirst = getDisposalStats().liveHandles;
      expect(afterFirst).toBeGreaterThan(base);

      unwrap(ev.evaluate(box(7, 7, 7))); // box2 in, box1 evicted + disposed
      expect(ev.cacheStats().evictions).toBe(1);
      // Net live handles must not grow across the eviction.
      expect(getDisposalStats().liveHandles).toBeLessThanOrEqual(afterFirst);
    }
    // Evaluator disposed → its remaining handle is freed too.
    expect(getDisposalStats().liveHandles).toBe(base);
  });
});

describe('CSG cache eviction — error path & reentrancy', () => {
  it('rolls back a failed call: bound preserved, prior result kept', () => {
    using ev = new Evaluator({ maxCacheEntries: 1 });
    const r = unwrap(ev.evaluate(box(5, 5, 5))); // cache:[box5], r borrowed
    // Each tree caches its first operand, then fails on the unbound param `w`.
    // Every failure must roll back its insert — the cache must not grow past
    // the bound, and the earlier good result must stay live.
    for (let i = 0; i < 8; i++) {
      expect(ev.evaluate(fuse(box(6 + i, 6, 6), box(param('w'), 6, 6)), {}).ok).toBe(false);
    }
    expect(ev.cacheStats().entries).toBeLessThanOrEqual(1);
    expect(ev.cacheStats().evictions).toBe(0); // rollbacks are not evictions
    expect(unwrap(measureVolume(r))).toBeCloseTo(125, 3);
  });

  it('rejects a reentrant evaluate() from onStep when bounded', () => {
    const ev = new Evaluator({
      maxCacheEntries: 2,
      onStep: () => {
        ev.evaluate(box(9, 9, 9)); // reentrant → must throw
      },
    });
    try {
      expect(() => ev.evaluate(box(7, 7, 7))).toThrow(/not reentrant/i);
      // The aborted call rolled back its insert — the cache is left clean.
      expect(ev.cacheStats().entries).toBe(0);
    } finally {
      ev[Symbol.dispose]();
    }
  });

  it('a throwing onStep is transactional: bound preserved, prior result kept', () => {
    let armed = false;
    const ev = new Evaluator({
      maxCacheEntries: 1,
      onStep: (info) => {
        if (armed && !info.cacheHit) throw new Error('boom');
      },
    });
    try {
      const r = unwrap(ev.evaluate(box(5, 5, 5))); // cache:[box5]
      armed = true;
      // Caches box6, then onStep throws → the call must roll box6 back,
      // keeping the bound and the earlier result intact.
      expect(() => ev.evaluate(box(6, 6, 6))).toThrow(/boom/);
      expect(ev.cacheStats().entries).toBeLessThanOrEqual(1);
      expect(unwrap(measureVolume(r))).toBeCloseTo(125, 3);
    } finally {
      ev[Symbol.dispose]();
    }
  });
});
