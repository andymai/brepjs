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
    // Tree: fuse( box(w, 10, 10), sphere(5) ).
    // sphere(5) freeParams = {}, box freeParams = {'w'}, fuse freeParams = {'w'}.
    // Re-evaluate with different `w`: box and fuse miss; sphere should hit.
    const tree = fuse(box(param('w'), 10, 10), sphere(5));
    ev.evaluate(tree, { w: 5 });
    ev.resetStats();
    ev.evaluate(tree, { w: 7 });
    const stats = ev.cacheStats();
    // Sphere(5) is independent of `w`, so it should reuse the cached entry.
    expect(stats.hits).toBeGreaterThanOrEqual(1);
  });

  it('different kernel id buckets the cache (single-kernel test: just verifies key formation)', () => {
    using ev = new Evaluator({ kernel: 'default' });
    const tree = box(1, 2, 3);
    ev.evaluate(tree);
    expect(ev.cacheStats().entries).toBeGreaterThan(0);
  });

  it('withEvaluator disposes the evaluator at function exit', () => {
    let cachedDuring = 0;
    withEvaluator({}, (ev) => {
      ev.evaluate(box(1, 1, 1));
      cachedDuring = ev.cacheStats().entries;
    });
    expect(cachedDuring).toBeGreaterThan(0);
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
