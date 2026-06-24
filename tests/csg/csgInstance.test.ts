// CSG IR Instance node — express an instanced array in a parametric tree.

import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from '../setup.js';
import {
  instance,
  box,
  Evaluator,
  toJSON,
  fromJSON,
  nodeCount,
  forEachNode,
  optimize,
  outputKindOf,
} from '@/csg/index.js';
import { unwrap, measureVolume, type Matrix4x4 } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const at = (x: number): Matrix4x4 => [
  [1, 0, 0, x],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];

describe('CSG Instance node', () => {
  it('builds an Instance node', () => {
    const n = instance(box(10, 10, 10), [at(0), at(20)]);
    expect(n.kind).toBe('Instance');
    expect(n.placements).toHaveLength(2);
    expect(n.fuse).toBe(false);
  });

  it('evaluates to a Compound (volume = N * source)', () => {
    using ev = new Evaluator();
    const r = unwrap(ev.evaluate(instance(box(10, 10, 10), [at(0), at(20), at(40)])));
    expect(unwrap(measureVolume(r))).toBeCloseTo(3000, 3);
  });

  it('fuse: evaluates to a single fused solid', () => {
    using ev = new Evaluator();
    const r = unwrap(ev.evaluate(instance(box(10, 10, 10), [at(0), at(10)], true)));
    expect(unwrap(measureVolume(r))).toBeCloseTo(2000, 1); // touching boxes fuse
  });

  it('materializes the source once across placements (DAG sharing)', () => {
    using ev = new Evaluator();
    unwrap(ev.evaluate(instance(box(6, 6, 6), [at(0), at(20), at(40)])));
    // Misses: the box source + the Instance node = 2; placements are applied in
    // materialize, not re-evaluated as cache nodes.
    expect(ev.cacheStats().misses).toBe(2);
  });

  it('round-trips through toJSON / fromJSON', () => {
    const tree = instance(box(5, 5, 5), [at(0), at(7)], true);
    const restored = unwrap(fromJSON(toJSON(tree)));
    expect(restored.structuralHash).toBe(tree.structuralHash);
  });

  it('forEachNode / nodeCount traverse the source', () => {
    const tree = instance(box(5, 5, 5), [at(0)]);
    expect(nodeCount(tree)).toBe(2); // Instance + Box
    const kinds: string[] = [];
    forEachNode(tree, (n) => kinds.push(n.kind));
    expect(kinds).toEqual(['Instance', 'Box']);
  });

  it('optimize preserves the Instance', () => {
    const opt = optimize(instance(box(5, 5, 5), [at(0), at(10)], true));
    expect(opt.kind).toBe('Instance');
  });

  it('outputKindOf: fused -> Solid, otherwise Compound', () => {
    expect(outputKindOf(instance(box(5, 5, 5), [at(0)], true))).toBe('Solid');
    expect(outputKindOf(instance(box(5, 5, 5), [at(0)]))).toBe('Compound');
  });

  it('copies placements so caller mutation does not change the node', () => {
    const m = at(7);
    const n = instance(box(5, 5, 5), [m]);
    m[0][3] = 999;
    expect(n.placements[0]?.[0]?.[3]).toBe(7);
  });

  it('fromJSON rejects non-finite matrix values', () => {
    const env = toJSON(instance(box(5, 5, 5), [at(0)]));
    (env.root as { placements: number[][][] }).placements = [
      [
        [Number.NaN, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ],
    ];
    expect(fromJSON(env).ok).toBe(false);
  });
});
