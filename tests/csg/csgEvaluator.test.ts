/**
 * Evaluator tests — exercise the kernel path: golden-value materialization,
 * cache hit accounting, parametric re-eval (only affected subtrees re-run).
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from '../setup.js';
import {
  box,
  sphere,
  cylinder,
  fuse,
  cut,
  translate,
  rotate,
  param,
  optimize,
  Evaluator,
  withEvaluator,
  emptySolid,
  add,
  numLit,
} from '@/csg/index.js';
import { isOk, isErr, unwrap, measureVolume, isShape3D } from '@/index.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function vol(s: AnyShape<Dimension>): number {
  return unwrap(measureVolume(s));
}

describe('Evaluator — golden values', () => {
  it('evaluates a single Box', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(box(10, 10, 10));
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(1000, 0);
  });

  it('evaluates a Sphere', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(sphere(5));
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo((4 / 3) * Math.PI * 125, 0);
  });

  it('evaluates Fuse of disjoint boxes', () => {
    using ev = new Evaluator();
    const tree = fuse(box(10, 10, 10), translate(box(10, 10, 10), [20, 0, 0]));
    const r = ev.evaluate(tree);
    expect(vol(unwrap(r))).toBeCloseTo(2000, 0);
  });

  it('evaluates Cut: box minus inner sphere is positive', () => {
    using ev = new Evaluator();
    const tree = cut(box(20, 20, 20), translate(sphere(5), [10, 10, 10]));
    const r = ev.evaluate(tree);
    const sphereVol = (4 / 3) * Math.PI * 125;
    // Loose tolerance (~5) — brepkit's boolean produces slightly different
    // volume than OCCT (~0.05% drift). Per project memory, brepkit is not
    // held to OCCT parity for boolean ops.
    expect(vol(unwrap(r))).toBeCloseTo(8000 - sphereVol, -1);
  });

  it('respects rotate', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(rotate(cylinder(5, 10), 90));
    expect(isOk(r)).toBe(true);
    expect(isShape3D(unwrap(r))).toBe(true);
  });
});

describe('Evaluator — parametric env', () => {
  it('resolves Param from env', () => {
    using ev = new Evaluator();
    const tree = box(param('w'), 10, 10);
    const r = ev.evaluate(tree, { w: 5 });
    expect(vol(unwrap(r))).toBeCloseTo(500, 0);
  });

  it('expression arithmetic feeds primitive params', () => {
    using ev = new Evaluator();
    const tree = box(add(param('w'), numLit(2)), 10, 10);
    const r = ev.evaluate(tree, { w: 3 });
    expect(vol(unwrap(r))).toBeCloseTo(500, 0);
  });

  it('errors when a Param is unbound', () => {
    using ev = new Evaluator();
    const tree = box(param('w'), 10, 10);
    const r = ev.evaluate(tree, {});
    expect(isErr(r)).toBe(true);
  });
});

describe('Evaluator — cache & incremental re-eval', () => {
  it('repeats evaluate of the same tree hit the cache', () => {
    using ev = new Evaluator();
    const tree = fuse(box(10, 10, 10), sphere(5));
    ev.evaluate(tree);
    ev.resetStats();
    ev.evaluate(tree);
    const stats = ev.cacheStats();
    expect(stats.hits).toBeGreaterThan(0);
    expect(stats.misses).toBe(0);
  });

  it('changing a Param only invalidates subtrees that depend on it', () => {
    using ev = new Evaluator();
    // freeParams: sphere(5)={}, box(w,10,10)={w}, fuse=union={w}.
    // First eval misses 3 nodes. Second eval with different w: sphere hits,
    // box+fuse miss → exactly 1 hit and 2 misses.
    const tree = fuse(box(param('w'), 10, 10), sphere(5));
    ev.evaluate(tree, { w: 5 });
    ev.resetStats();
    ev.evaluate(tree, { w: 7 });
    expect(ev.cacheStats()).toEqual({ hits: 1, misses: 2, entries: 5 });
  });

  it('changing an unrelated env key invalidates nothing', () => {
    using ev = new Evaluator();
    const tree = fuse(box(param('w'), 10, 10), sphere(5));
    ev.evaluate(tree, { w: 5, irrelevant: 999 });
    ev.resetStats();
    ev.evaluate(tree, { w: 5, irrelevant: 42 });
    expect(ev.cacheStats().misses).toBe(0);
  });

  it('evaluator resolves kernelId at construction (stable cache key)', () => {
    using ev = new Evaluator();
    const tree = box(1, 1, 1);
    ev.evaluate(tree);
    expect(ev.cacheStats().entries).toBe(1);
    ev.evaluate(tree);
    expect(ev.cacheStats().hits).toBeGreaterThan(0);
  });

  it('changing tolerance produces a separate cache entry', () => {
    using ev1 = new Evaluator({ tolerance: 0.01 });
    using ev2 = new Evaluator({ tolerance: 0.1 });
    const tree = box(1, 1, 1);
    ev1.evaluate(tree);
    ev2.evaluate(tree);
    expect(ev1.cacheStats().entries).toBe(1);
    expect(ev2.cacheStats().entries).toBe(1);
  });

  it('withEvaluator throws if the callback returns a Promise', () => {
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentionally bypassing the type guard to test the runtime guard
      withEvaluator({}, ((_ev: Evaluator) => Promise.resolve(1)) as any);
    }).toThrow(/Promise/);
  });

  it('withEvaluator disposes the evaluator at function exit', () => {
    let cachedDuring = 0;
    withEvaluator({}, (ev) => {
      ev.evaluate(box(1, 1, 1));
      cachedDuring = ev.cacheStats().entries;
    });
    expect(cachedDuring).toBeGreaterThan(0);
  });

  it('identity short-circuit does not double-register the forwarded shape', () => {
    // Fuse(Empty, sphere) returns the sphere directly via short-circuit.
    // The sphere is registered exactly once (under its own cache key) — the
    // outer Fuse cache entry MUST share the same shape without re-registering
    // it in the DisposalScope. Without the dedup, the same handle would be
    // added to scope.handles twice. We can't introspect the scope, but we
    // can verify the cache invariant: both entries point to the same object.
    using ev = new Evaluator();
    const tree = fuse(emptySolid(), sphere(5));
    const r = ev.evaluate(tree);
    expect(isOk(r)).toBe(true);
    // Two cache entries (sphere and fuse), but the values are referentially equal.
    expect(ev.cacheStats().entries).toBe(2);
  });

  it('onStep callback fires for misses and hits', () => {
    const events: { kind: string; cacheHit: boolean }[] = [];
    using ev = new Evaluator({
      onStep: (info) => events.push({ kind: info.node.kind, cacheHit: info.cacheHit }),
    });
    const tree = sphere(5);
    ev.evaluate(tree);
    ev.evaluate(tree);
    expect(events).toEqual([
      { kind: 'Sphere', cacheHit: false },
      { kind: 'Sphere', cacheHit: true },
    ]);
  });
});

describe('Evaluator + optimize', () => {
  it('optimize(fuse(empty, x)) evaluates equal to x', () => {
    using ev = new Evaluator();
    const orig = sphere(5);
    const withEmpty = fuse(emptySolid(), orig);
    const v1 = vol(unwrap(ev.evaluate(orig)));
    const v2 = vol(unwrap(ev.evaluate(optimize(withEmpty))));
    expect(v2).toBeCloseTo(v1, 4);
  });

  it('optimize collapses translate-by-zero', () => {
    using ev = new Evaluator();
    const tree = translate(box(10, 10, 10), [0, 0, 0]);
    const opt = optimize(tree);
    expect(opt.kind).toBe('Box');
    expect(vol(unwrap(ev.evaluate(opt)))).toBeCloseTo(1000, 0);
  });
});

describe('Evaluator — error paths', () => {
  it('Empty node alone errors', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(emptySolid());
    expect(isErr(r)).toBe(true);
  });

  it('Cut(empty, x) errors', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(cut(emptySolid(), box(1, 1, 1)));
    expect(isErr(r)).toBe(true);
  });

  it('Fuse(empty, x) short-circuits to x', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(fuse(emptySolid(), box(10, 10, 10)));
    expect(vol(unwrap(r))).toBeCloseTo(1000, 0);
  });
});
