// Demonstrates the perf gains from CSG IR's content-addressed cache:
//   - warm vs cold evaluation of the same tree
//   - param-driven re-eval (only subtrees that depend on the changed param re-run)
//   - DAG sharing (same structural hash → one kernel call regardless of references)
//
// Eager paths wrap every iteration in a DisposalScope so the WASM heap doesn't
// accumulate handles across iterations (which would slow later iterations and
// overstate CSG's win). The CSG path's cleanup is already covered by the
// Evaluator's own DisposalScope.

import { describe, it, beforeAll } from 'vitest';
import {
  box,
  sphere,
  cylinder,
  translate as eagerTranslate,
  fuse as eagerFuse,
  compound as eagerCompound,
  csg,
  unwrap,
  DisposalScope,
} from '../src/index.js';
import { initBenchKernels, benchBoth } from './setup.js';
import { collectResults, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBenchKernels();
}, 30000);

// ---------------------------------------------------------------------------
// 1. Cold vs warm cache — repeat eval of the same tree
// ---------------------------------------------------------------------------

describe('CSG perf — cold vs warm cache', () => {
  const results: BenchResult[] = [];

  const buildCsgTree = () =>
    csg.fuse(
      csg.fuse(csg.box(10, 10, 10), csg.translate(csg.sphere(3), [5, 5, 5])),
      csg.translate(csg.cylinder(2, 12), [0, 0, 0])
    );

  it('eager (no cache): full kernel work every call', async () => {
    collectResults(
      results,
      await benchBoth('eager: build + fuse', () => {
        using scope = new DisposalScope();
        const a = scope.register(box(10, 10, 10));
        const sph = scope.register(sphere(3));
        const b = scope.register(eagerTranslate(sph, [5, 5, 5]));
        const cyl = scope.register(cylinder(2, 12));
        const c = scope.register(eagerTranslate(cyl, [0, 0, 0]));
        const ab = scope.register(unwrap(eagerFuse(a, b)));
        scope.register(unwrap(eagerFuse(ab, c)));
      })
    );
  });

  it('csg cold cache: same kernel work', async () => {
    collectResults(
      results,
      await benchBoth('csg: fresh evaluator (cold)', () => {
        using ev = new csg.Evaluator();
        unwrap(ev.evaluate(buildCsgTree()));
      })
    );
  });

  it('csg warm cache: 100 repeats of the same tree', async () => {
    collectResults(
      results,
      await benchBoth('csg: 100x warm-cache eval', () => {
        using ev = new csg.Evaluator();
        const tree = buildCsgTree();
        unwrap(ev.evaluate(tree));
        for (let i = 0; i < 100; i++) unwrap(ev.evaluate(tree));
      })
    );
  });

  it('prints cold-vs-warm results', () => {
    printResults(results);
  });
});

// ---------------------------------------------------------------------------
// 2. Param-driven incremental re-eval — change one param of N
// ---------------------------------------------------------------------------

describe('CSG perf — incremental param re-eval', () => {
  const results: BenchResult[] = [];

  // Compound of 8 subtrees; only the first depends on Param('w'). A param change
  // should re-evaluate just that one subtree; the other 7 must hit the cache.
  const buildParametricTree = () =>
    csg.compound([
      csg.box(csg.param('w'), 10, 10),
      csg.translate(csg.sphere(2), [10, 0, 0]),
      csg.translate(csg.sphere(2), [20, 0, 0]),
      csg.translate(csg.sphere(2), [30, 0, 0]),
      csg.translate(csg.sphere(2), [40, 0, 0]),
      csg.translate(csg.sphere(2), [50, 0, 0]),
      csg.translate(csg.sphere(2), [60, 0, 0]),
      csg.translate(csg.sphere(2), [70, 0, 0]),
    ]);

  function buildEagerEquivalent(scope: DisposalScope, w: number): void {
    const children = [
      scope.register(box(w, 10, 10)),
      ...Array.from({ length: 7 }, (_, i) => {
        const s = scope.register(sphere(2));
        return scope.register(eagerTranslate(s, [(i + 1) * 10, 0, 0]));
      }),
    ];
    scope.register(eagerCompound(children));
  }

  it('eager: changing w forces full rebuild of all 8 children', async () => {
    collectResults(
      results,
      await benchBoth('eager: rebuild 8-child compound on param change', () => {
        using scope = new DisposalScope();
        buildEagerEquivalent(scope, 5);
        buildEagerEquivalent(scope, 7);
      })
    );
  });

  it('csg: changing Param("w") re-evaluates only the 1 dependent child', async () => {
    collectResults(
      results,
      await benchBoth('csg: incremental re-eval (1 of 8)', () => {
        using ev = new csg.Evaluator();
        const tree = buildParametricTree();
        unwrap(ev.evaluate(tree, { w: 5 }));
        unwrap(ev.evaluate(tree, { w: 7 }));
      })
    );
  });

  it('prints incremental re-eval results', () => {
    printResults(results);
  });
});

// ---------------------------------------------------------------------------
// 3. DAG sharing — a parametric assembly with a shared sub-component
// ---------------------------------------------------------------------------
// Placing N copies of the same widget at different positions. Each placement
// has a distinct cache key (different translate vector), but the widget
// materialization is shared across all N — one kernel build, N reuses.

describe('CSG perf — DAG sharing via structural hash', () => {
  const results: BenchResult[] = [];

  const N = 12;

  it(`eager: ${N} placements → ${N} widget builds`, async () => {
    collectResults(
      results,
      await benchBoth(`eager: ${N}x widget @ different positions`, () => {
        using scope = new DisposalScope();
        const placements = Array.from({ length: N }, (_, i) => {
          const b = scope.register(box(6, 6, 6));
          const s = scope.register(sphere(3));
          const widget = scope.register(unwrap(eagerFuse(b, s)));
          return scope.register(eagerTranslate(widget, [i * 20, 0, 0]));
        });
        scope.register(eagerCompound(placements));
      })
    );
  });

  it(`csg: ${N} placements → 1 widget build + ${N} cheap translates`, async () => {
    collectResults(
      results,
      await benchBoth(`csg: ${N}x widget @ different positions`, () => {
        using ev = new csg.Evaluator();
        const widget = csg.fuse(csg.box(6, 6, 6), csg.sphere(3));
        const placements = Array.from({ length: N }, (_, i) =>
          csg.translate(widget, [i * 20, 0, 0])
        );
        unwrap(ev.evaluate(csg.compound(placements)));
      })
    );
  });

  it('prints DAG-sharing results', () => {
    printResults(results);
  });
});
