/**
 * Pure-data tests for DAG-preserving CSG serialization (csgVersion 8) —
 * no kernel required. Shared subtrees serialize once into the envelope's
 * `defs` table and round-trip with object identity intact.
 */

import { describe, expect, it } from 'vitest';
import { box, sphere, fuse, translate, compound, instance } from '@/csg/index.js';
import { toJSON, fromJSON, CSG_VERSION } from '@/csg/serialize.js';
import { nodeCount } from '@/csg/edit.js';
import { isErr, unwrap } from '@/index.js';
import type { FuseNode, TranslateNode, IRNode } from '@/csg/types.js';

describe('DAG-preserving toJSON', () => {
  it('a tree without sharing has no defs table', () => {
    const tree = fuse(box(10, 10, 10), translate(sphere(5), [20, 0, 0]));
    const env = toJSON(tree);
    expect(env.csgVersion).toBe(CSG_VERSION);
    expect(env.defs).toBeUndefined();
    expect(unwrap(fromJSON(env)).structuralHash).toBe(tree.structuralHash);
  });

  it('emits a shared subtree once', () => {
    const s = sphere(5);
    const tree = fuse(translate(s, [10, 0, 0]), translate(s, [-10, 0, 0]));
    const env = toJSON(tree);
    expect(env.defs).toHaveLength(1);
    expect(JSON.stringify(env).match(/"Sphere"/g)).toHaveLength(1);
  });

  it('round-trips shared identity', () => {
    const s = sphere(5);
    const tree = fuse(translate(s, [10, 0, 0]), translate(s, [-10, 0, 0]));
    const back = unwrap(fromJSON(toJSON(tree))) as FuseNode;
    expect(back.structuralHash).toBe(tree.structuralHash);
    const a = back.a as TranslateNode;
    const b = back.b as TranslateNode;
    expect(a.target).toBe(b.target);
  });

  it('keeps an exponential DAG linear in both directions', () => {
    let node: IRNode = box(1, 1, 1);
    for (let i = 0; i < 30; i++) node = fuse(node, node);
    const env = toJSON(node);
    expect(JSON.stringify(env).length).toBeLessThan(10_000);
    const back = unwrap(fromJSON(env));
    expect(back.structuralHash).toBe(node.structuralHash);
    expect(nodeCount(back)).toBe(31);
  });

  it('shares across containers and instances', () => {
    const part = translate(box(2, 2, 2), [0, 0, 1]);
    const tree = compound([
      part,
      instance(part, [
        [
          [1, 0, 0, 5],
          [0, 1, 0, 0],
          [0, 0, 1, 0],
          [0, 0, 0, 1],
        ],
      ]),
    ]);
    const env = toJSON(tree);
    expect(env.defs).toHaveLength(1);
    const back = unwrap(fromJSON(env));
    expect(back.structuralHash).toBe(tree.structuralHash);
  });
});

describe('fromJSON $ref validation', () => {
  const boxJson = {
    kind: 'Box',
    x: { kind: 'NumLit', value: 1 },
    y: { kind: 'NumLit', value: 1 },
    z: { kind: 'NumLit', value: 1 },
  };

  it('accepts pre-DAG envelopes', () => {
    const r = fromJSON({ csgVersion: 7, root: boxJson });
    expect(r.ok).toBe(true);
  });

  it('rejects a non-array defs table', () => {
    expect(isErr(fromJSON({ csgVersion: 8, defs: 'nope', root: boxJson }))).toBe(true);
  });

  it('rejects an out-of-range $ref', () => {
    expect(isErr(fromJSON({ csgVersion: 8, defs: [boxJson], root: { $ref: 1 } }))).toBe(true);
  });

  it('rejects a forward/self $ref inside defs', () => {
    const r = fromJSON({ csgVersion: 8, defs: [{ $ref: 0 }], root: { $ref: 0 } });
    expect(isErr(r)).toBe(true);
  });

  it('rejects a non-integer $ref', () => {
    expect(isErr(fromJSON({ csgVersion: 8, defs: [boxJson], root: { $ref: 0.5 } }))).toBe(true);
    expect(isErr(fromJSON({ csgVersion: 8, defs: [boxJson], root: { $ref: '0' } }))).toBe(true);
    expect(isErr(fromJSON({ csgVersion: 8, defs: [boxJson], root: { $ref: -1 } }))).toBe(true);
  });
});
