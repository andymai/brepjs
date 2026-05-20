// Perf invariants for the CSG IR cache. Uses Evaluator.cacheStats() to
// assert exact hit/miss counts so regressions (e.g. a botched env-projection
// hash or a missed identity short-circuit) are caught without flaky timings.

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from '../setup.js';
import { Evaluator, box, sphere, fuse, translate, compound, param } from '@/csg/index.js';
import { unwrap } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('CSG perf invariants — warm cache', () => {
  it('repeating the same tree N times produces N hits, 0 misses on cached subtrees', () => {
    using ev = new Evaluator();
    const tree = fuse(box(10, 10, 10), translate(sphere(3), [5, 5, 5]));
    unwrap(ev.evaluate(tree));
    const cold = ev.cacheStats();
    expect(cold.misses).toBeGreaterThan(0);
    expect(cold.hits).toBe(0);

    ev.resetStats();
    for (let i = 0; i < 50; i++) unwrap(ev.evaluate(tree));
    const warm = ev.cacheStats();
    expect(warm.misses).toBe(0);
    expect(warm.hits).toBe(50);
  });
});

describe('CSG perf invariants — incremental param re-eval', () => {
  it('changing one Param re-runs only subtrees that depend on it', () => {
    using ev = new Evaluator();
    // 4 independent children, only one references Param('w').
    const tree = compound([
      box(param('w'), 10, 10),
      translate(sphere(2), [10, 0, 0]),
      translate(sphere(2), [20, 0, 0]),
      translate(sphere(2), [30, 0, 0]),
    ]);

    unwrap(ev.evaluate(tree, { w: 5 }));
    ev.resetStats();
    unwrap(ev.evaluate(tree, { w: 7 }));

    // Misses: box{w=7} and compound{w=7} — both depend on w so their keys
    // change. Hits: the three translates (env-independent) short-circuit
    // descent into their cached spheres.
    expect(ev.cacheStats()).toMatchObject({ hits: 3, misses: 2 });
  });

  it('changing an unrelated env key invalidates nothing', () => {
    using ev = new Evaluator();
    const tree = compound([box(param('w'), 10, 10), translate(sphere(2), [10, 0, 0])]);
    unwrap(ev.evaluate(tree, { w: 5, unrelated: 999 }));
    ev.resetStats();
    unwrap(ev.evaluate(tree, { w: 5, unrelated: 42 }));
    expect(ev.cacheStats().misses).toBe(0);
  });
});

describe('CSG perf invariants — DAG sharing', () => {
  it('shared subtree at multiple placements: one materialization, N reuses', () => {
    using ev = new Evaluator();
    const widget = fuse(box(6, 6, 6), sphere(3));
    const N = 5;
    const tree = compound(Array.from({ length: N }, (_, i) => translate(widget, [i * 20, 0, 0])));

    unwrap(ev.evaluate(tree));
    const stats = ev.cacheStats();

    // Distinct cache entries: box + sphere + widget(fuse) + N translates + compound = N + 4.
    expect(stats.entries).toBe(N + 4);
    expect(stats.misses).toBe(N + 4);
    // The widget materializes once on the first translate's descent; the
    // other N-1 translates hit the cache when they ask for their target —
    // that's the DAG-sharing win.
    expect(stats.hits).toBe(N - 1);
  });

  it('re-evaluating the assembly: every node is a hit', () => {
    using ev = new Evaluator();
    const widget = fuse(box(6, 6, 6), sphere(3));
    const N = 5;
    const tree = compound(Array.from({ length: N }, (_, i) => translate(widget, [i * 20, 0, 0])));
    unwrap(ev.evaluate(tree));
    const firstEntries = ev.cacheStats().entries;

    ev.resetStats();
    unwrap(ev.evaluate(tree));
    expect(ev.cacheStats()).toMatchObject({ hits: 1, misses: 0, entries: firstEntries });
    // Only one hit because the root cache lookup short-circuits the descent.
  });
});
