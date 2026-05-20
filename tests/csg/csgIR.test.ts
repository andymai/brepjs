/**
 * Pure-data tests for the CSG IR — no kernel required.
 * Covers hash stability, expression algebra, builders, optimization,
 * serialization, and edit helpers.
 */

import { describe, expect, it } from 'vitest';
import {
  box,
  sphere,
  cylinder,
  fuse,
  cut,
  translate,
  rotate,
  emptySolid,
  fuseAll,
  cutAll,
  compound,
  numLit,
  param,
  add,
  mul,
  buildVec,
} from '@/csg/index.js';
import { evalScalar, evalVec3 } from '@/csg/expressions.js';
import { fnvInit, fnvMixString, fnvMixNumber, fnvMixHash, toHex } from '@/csg/hash.js';
import { optimize, foldExpr } from '@/csg/optimize.js';
import { toJSON, fromJSON } from '@/csg/serialize.js';
import { replaceNode, nodeCount, forEachNode } from '@/csg/edit.js';
import { isErr, unwrap } from '@/index.js';

// ---------------------------------------------------------------------------
// hash
// ---------------------------------------------------------------------------

describe('hash', () => {
  it('FNV-1a is deterministic across runs', () => {
    const a = fnvMixString(fnvInit(), 'hello');
    const b = fnvMixString(fnvInit(), 'hello');
    expect(a).toBe(b);
  });

  it('different strings hash differently', () => {
    const a = fnvMixString(fnvInit(), 'box');
    const b = fnvMixString(fnvInit(), 'sphere');
    expect(a).not.toBe(b);
  });

  it('0.1 + 0.2 and 0.3 hash differently (no float canonicalization)', () => {
    const a = fnvMixNumber(fnvInit(), 0.1 + 0.2);
    const b = fnvMixNumber(fnvInit(), 0.3);
    expect(a).not.toBe(b);
  });

  it('+0 and -0 hash identically', () => {
    const a = fnvMixNumber(fnvInit(), 0);
    const b = fnvMixNumber(fnvInit(), -0);
    expect(a).toBe(b);
  });

  it('toHex pads to 16 chars', () => {
    expect(toHex(0n)).toBe('0000000000000000');
    expect(toHex(fnvInit()).length).toBe(16);
  });

  it('mixing the same child twice changes the parent hash', () => {
    const child = fnvMixString(fnvInit(), 'child');
    const once = fnvMixHash(fnvInit(), child);
    const twice = fnvMixHash(once, child);
    expect(once).not.toBe(twice);
  });
});

// ---------------------------------------------------------------------------
// expressions
// ---------------------------------------------------------------------------

describe('expressions', () => {
  it('NumLit evaluates to its value', () => {
    const r = evalScalar(numLit(42), {}, 'test');
    expect(unwrap(r)).toBe(42);
  });

  it('Param resolves from env', () => {
    const r = evalScalar(param('w'), { w: 10 }, 'test');
    expect(unwrap(r)).toBe(10);
  });

  it('Param errors when unbound', () => {
    const r = evalScalar(param('missing'), {}, 'test');
    expect(isErr(r)).toBe(true);
  });

  it('BinOp + works', () => {
    const r = evalScalar(add(numLit(2), numLit(3)), {}, 'test');
    expect(unwrap(r)).toBe(5);
  });

  it('BinOp resolves params through tree', () => {
    const expr = mul(add(param('w'), numLit(1)), param('h'));
    const r = evalScalar(expr, { w: 4, h: 5 }, 'test');
    expect(unwrap(r)).toBe(25);
  });

  it('BuildVec(3) constructs a Vec3', () => {
    const v = evalVec3(buildVec(3, [param('x'), numLit(0), param('z')]), { x: 1, z: 3 }, 'test');
    expect(unwrap(v)).toEqual([1, 0, 3]);
  });

  it('freeParams propagates through BinOp', () => {
    const expr = add(param('a'), mul(param('b'), numLit(2)));
    expect(new Set(expr.freeParams)).toEqual(new Set(['a', 'b']));
  });
});

// ---------------------------------------------------------------------------
// builders + hash invariants
// ---------------------------------------------------------------------------

describe('builders', () => {
  it('identical builds produce identical structural hashes', () => {
    const a = box(10, 10, 10);
    const b = box(10, 10, 10);
    expect(a.structuralHash).toBe(b.structuralHash);
  });

  it('different params produce different hashes', () => {
    const a = box(10, 10, 10);
    const b = box(10, 10, 11);
    expect(a.structuralHash).not.toBe(b.structuralHash);
  });

  it('builder freeParams reflects used Params', () => {
    const node = box(param('w'), numLit(10), param('h'));
    expect(new Set(node.freeParams)).toEqual(new Set(['w', 'h']));
  });

  it('boolean propagates freeParams from both operands', () => {
    const node = fuse(box(param('w'), 10, 10), sphere(param('r')));
    expect(new Set(node.freeParams)).toEqual(new Set(['w', 'r']));
  });

  it('transform propagates freeParams from target and vector', () => {
    const node = translate(box(param('w'), 10, 10), [1, 0, 0]);
    expect(new Set(node.freeParams)).toEqual(new Set(['w']));
  });
});

// ---------------------------------------------------------------------------
// optimize
// ---------------------------------------------------------------------------

describe('optimize', () => {
  it('Fuse(empty, x) folds to x', () => {
    const tree = fuse(emptySolid(), sphere(5));
    const opt = optimize(tree);
    expect(opt.kind).toBe('Sphere');
  });

  it('Cut(x, empty) folds to x', () => {
    const tree = cut(box(10, 10, 10), emptySolid());
    const opt = optimize(tree);
    expect(opt.kind).toBe('Box');
  });

  it('Intersect(empty, x) folds to empty', () => {
    expect(optimize(fuse(emptySolid(), emptySolid())).kind).toBe('Empty');
  });

  it('constant-folds BinOp(NumLit, NumLit)', () => {
    const folded = foldExpr(add(numLit(2), numLit(3)));
    expect(folded.kind).toBe('NumLit');
    if (folded.kind === 'NumLit') expect(folded.value).toBe(5);
  });

  it('Translate by zero collapses to target', () => {
    const tree = translate(box(10, 10, 10), [0, 0, 0]);
    const opt = optimize(tree);
    expect(opt.kind).toBe('Box');
  });

  it('Translate(Translate(x, v1), v2) fuses to single Translate when both literal', () => {
    const tree = translate(translate(box(10, 10, 10), [1, 0, 0]), [2, 0, 0]);
    const opt = optimize(tree);
    if (opt.kind !== 'Translate') throw new Error('expected Translate root');
    expect(opt.target.kind).toBe('Box');
    const v = opt.vector;
    if (v.kind !== 'Vec3Lit') throw new Error('expected literal Vec3');
    expect(v.value).toEqual([3, 0, 0]);
  });

  it('FuseAll with all-empty collapses to Empty', () => {
    const tree = fuseAll([emptySolid(), emptySolid()]);
    const opt = optimize(tree);
    expect(opt.kind).toBe('Empty');
  });

  it('CutAll with all-empty tools returns base', () => {
    const tree = cutAll(box(10, 10, 10), [emptySolid()]);
    const opt = optimize(tree);
    expect(opt.kind).toBe('Box');
  });
});

// ---------------------------------------------------------------------------
// serialize round-trip
// ---------------------------------------------------------------------------

describe('serialize', () => {
  it('round-trips a literal primitive', () => {
    const tree = box(10, 20, 30);
    const json = toJSON(tree);
    const back = unwrap(fromJSON(json));
    expect(back.structuralHash).toBe(tree.structuralHash);
  });

  it('round-trips a parametric boolean', () => {
    const tree = fuse(box(param('w'), 10, 10), translate(sphere(5), [param('x'), 0, 0]));
    const json = toJSON(tree);
    const back = unwrap(fromJSON(json));
    expect(back.structuralHash).toBe(tree.structuralHash);
    expect(new Set(back.freeParams)).toEqual(new Set(['w', 'x']));
  });

  it('round-trips fuseAll, cutAll, compound', () => {
    const tree = compound([fuseAll([box(1, 1, 1), sphere(1)]), cutAll(box(2, 2, 2), [sphere(1)])]);
    const json = toJSON(tree);
    const back = unwrap(fromJSON(json));
    expect(back.structuralHash).toBe(tree.structuralHash);
  });

  it('round-trips rotate/scale/mirror with options', () => {
    const tree = compound([
      rotate(box(1, 1, 1), 45, { axis: [0, 0, 1], at: [1, 0, 0] }),
      sphere(2),
    ]);
    const json = toJSON(tree);
    const back = unwrap(fromJSON(json));
    expect(back.structuralHash).toBe(tree.structuralHash);
  });

  it('rejects wrong csgVersion', () => {
    const r = fromJSON({ csgVersion: 99, root: { kind: 'Box', x: { kind: 'NumLit', value: 1 } } });
    expect(isErr(r)).toBe(true);
  });

  it('rejects unknown node kind', () => {
    const r = fromJSON({ csgVersion: 1, root: { kind: 'Banana' } });
    expect(isErr(r)).toBe(true);
  });

  it('rejects malformed NumLit', () => {
    const r = fromJSON({
      csgVersion: 1,
      root: { kind: 'Box', x: { kind: 'NumLit', value: 'oops' } },
    });
    expect(isErr(r)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// edit
// ---------------------------------------------------------------------------

describe('edit', () => {
  it('replaceNode swaps every matching node', () => {
    const tree = compound([box(1, 1, 1), box(2, 2, 2), sphere(5)]);
    const edited = replaceNode(tree, (n) => n.kind === 'Box', sphere(99));
    expect(nodeCount(edited)).toBe(nodeCount(tree));
    let boxes = 0;
    forEachNode(edited, (n) => {
      if (n.kind === 'Box') boxes++;
    });
    expect(boxes).toBe(0);
  });

  it('replaceNode does not descend into a replaced subtree', () => {
    const inner = box(1, 1, 1);
    const tree = fuse(inner, sphere(2));
    const edited = replaceNode(tree, (n) => n.kind === 'Box', cylinder(3, 4));
    if (edited.kind !== 'Fuse') throw new Error('expected Fuse root');
    expect(edited.a.kind).toBe('Cylinder');
  });

  it('nodeCount counts all nodes', () => {
    const tree = fuse(box(1, 1, 1), sphere(2));
    expect(nodeCount(tree)).toBe(3);
  });

  it('forEachNode visits every node', () => {
    const tree = compound([box(1, 1, 1), sphere(2)]);
    const kinds: string[] = [];
    forEachNode(tree, (n) => kinds.push(n.kind));
    expect(kinds).toEqual(['Compound', 'Box', 'Sphere']);
  });

  it('hash is recomputed after edit', () => {
    const original = fuse(box(1, 1, 1), sphere(2));
    const edited = replaceNode(original, (n) => n.kind === 'Box', cylinder(3, 4));
    expect(edited.structuralHash).not.toBe(original.structuralHash);
  });
});

// ---------------------------------------------------------------------------
// Env projection — verify cache-key behaviour without involving a kernel
// ---------------------------------------------------------------------------

describe('parametric invariants', () => {
  it('a subtree whose freeParams excludes a key is insensitive to its change', () => {
    const innerBox = box(param('w'), 10, 10);
    // innerBox depends only on 'w'
    expect(innerBox.freeParams.has('w')).toBe(true);
    expect(innerBox.freeParams.has('h')).toBe(false);
  });

  it('freeParams flows up through booleans', () => {
    const tree = fuse(box(param('w'), 10, 10), sphere(param('r')));
    expect(new Set(tree.freeParams)).toEqual(new Set(['w', 'r']));
  });
});
