/**
 * Extension node: caller-defined operations evaluated through a by-name
 * registry. Covers materialization inside built-in trees, content-addressed
 * caching and param invalidation, the borrowed-children / owned-result
 * contract (including a result that aliases a child), canonical data hashing,
 * serialization round-trips, optimize/edit, and builder validation.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from '../setup.js';
import {
  extension,
  box,
  fuse,
  cut,
  translate,
  param,
  add,
  numLit,
  emptySolid,
  optimize,
  replaceNode,
  forEachNode,
  nodeCount,
  outputKindOf,
  toJSON,
  fromJSON,
  Evaluator,
  CSG_VERSION,
  type ExtensionEvaluator,
  type ExtensionInput,
  type IRNode,
  type JsonValue,
  type OutputKind,
  type ScalarInput,
} from '@/csg/index.js';
import {
  box as solidBox,
  translate as moveShape,
  fuseAll as fuseAllShapes,
  isShape3D,
  isSolid,
  isLive,
  isOk,
  isErr,
  ok,
  err,
  unwrap,
  unwrapErr,
  validationError,
  measureVolume,
  BrepErrorCode,
  type AnyShape,
  type Dimension,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function vol(s: AnyShape<Dimension>): number {
  if (!isShape3D(s)) throw new Error('expected a 3D shape');
  return unwrap(measureVolume(s));
}

function num(input: ExtensionInput, key: string): number {
  const v = input.params[key];
  if (v === undefined) throw new Error(`missing param ${key}`);
  return v;
}

function counted(fn: ExtensionEvaluator): { fn: ExtensionEvaluator; calls: () => number } {
  let n = 0;
  return {
    fn: (input) => {
      n++;
      return fn(input);
    },
    calls: () => n,
  };
}

const cubeEval: ExtensionEvaluator = (input) => {
  const s = num(input, 'size');
  return ok(solidBox(s, s, s));
};

// Copies of the first child along X; count 1 returns the child unchanged.
const rowEval: ExtensionEvaluator = (input) => {
  const [child] = input.children;
  if (child === undefined || !isShape3D(child)) {
    return err(validationError('TEST_ROW_CHILD', 'row needs one 3D child'));
  }
  const count = num(input, 'count');
  if (count === 1) return ok(child);
  const spacing = num(input, 'spacing');
  const copies = Array.from({ length: count }, (_, i) => moveShape(child, [i * spacing, 0, 0]));
  try {
    return fuseAllShapes(copies);
  } finally {
    for (const c of copies) c[Symbol.dispose]();
  }
};

const cube = (size: ScalarInput): IRNode => extension('cube', 'Solid', { params: { size } });

describe('Extension evaluation', () => {
  it('materializes a leaf extension', () => {
    using ev = new Evaluator({ extensions: { cube: cubeEval } });
    const r = unwrap(ev.evaluate(cube(10)));
    expect(isSolid(r)).toBe(true);
    expect(vol(r)).toBeCloseTo(1000, 3);
  });

  it('composes inside fuse/cut/translate and evaluates once across trees sharing it', () => {
    const c = counted(cubeEval);
    using ev = new Evaluator({ extensions: { cube: c.fn } });
    const fused = fuse(translate(cube(10), [20, 0, 0]), box(10, 10, 10));
    expect(vol(unwrap(ev.evaluate(fused)))).toBeCloseTo(2000, 1);
    // An independently built but identical subtree is the same content address.
    const cutTree = cut(box(30, 10, 10), translate(cube(10), [20, 0, 0]));
    expect(vol(unwrap(ev.evaluate(cutTree)))).toBeCloseTo(2000, 1);
    expect(c.calls()).toBe(1);
  });

  it('passes materialized children, cached under their own content address', () => {
    const child = box(5, 5, 5);
    let received: AnyShape<Dimension> | undefined;
    let childVolume = 0;
    using ev = new Evaluator({
      extensions: {
        row: (input) => {
          received = input.children[0];
          if (received) childVolume = vol(received);
          return rowEval(input);
        },
      },
    });
    const node = extension('row', 'Solid', {
      children: [child],
      params: { count: 3, spacing: 10 },
    });
    expect(vol(unwrap(ev.evaluate(node)))).toBeCloseTo(375, 1);
    expect(childVolume).toBeCloseTo(125, 3);
    ev.resetStats();
    expect(unwrap(ev.evaluate(child))).toBe(received);
    expect(ev.cacheStats()).toMatchObject({ hits: 1, misses: 0 });
  });

  it('resolves params from env and re-evaluates only the dependent subtree', () => {
    const c = counted(cubeEval);
    const seen: number[] = [];
    const unrelated = box(10, 10, 10);
    const hits = new Set<IRNode>();
    using ev = new Evaluator({
      extensions: {
        cube: (input) => {
          seen.push(num(input, 'size'));
          return c.fn(input);
        },
      },
      onStep: (info) => {
        if (info.cacheHit) hits.add(info.node);
      },
    });
    const ext = cube(param('s'));
    expect([...ext.freeParams]).toEqual(['s']);
    const tree = fuse(translate(ext, [50, 0, 0]), unrelated);

    expect(vol(unwrap(ev.evaluate(tree, { s: 10 })))).toBeCloseTo(2000, 1);
    expect(vol(unwrap(ev.evaluate(tree, { s: 20 })))).toBeCloseTo(9000, 1);
    expect(seen).toEqual([10, 20]);
    expect(hits.has(unrelated)).toBe(true);
    expect(hits.has(ext)).toBe(false);

    unwrap(ev.evaluate(tree, { s: 10 }));
    expect(c.calls()).toBe(2);
  });

  it('surfaces an unbound or non-scalar param as an Err before calling the evaluator', () => {
    const c = counted(cubeEval);
    using ev = new Evaluator({ extensions: { cube: c.fn } });
    expect(isErr(ev.evaluate(cube(param('s'))))).toBe(true);
    expect(isErr(ev.evaluate(cube(param('s')), { s: [1, 2, 3] }))).toBe(true);
    expect(c.calls()).toBe(0);
  });

  it('returns CSG_EXTENSION_UNKNOWN for an unregistered name, including inherited keys', () => {
    using ev = new Evaluator({ extensions: { cube: cubeEval } });
    const r = ev.evaluate(extension('drill', 'Solid'));
    expect(isErr(r)).toBe(true);
    expect(unwrapErr(r).code).toBe(BrepErrorCode.CSG_EXTENSION_UNKNOWN);
    expect(unwrapErr(r).message).toContain('drill');
    const inherited = ev.evaluate(extension('constructor', 'Solid'));
    expect(unwrapErr(inherited).code).toBe(BrepErrorCode.CSG_EXTENSION_UNKNOWN);
  });

  it('propagates an Err from a child without calling the parent evaluator', () => {
    const c = counted(rowEval);
    using ev = new Evaluator({ extensions: { row: c.fn } });
    const node = extension('row', 'Solid', {
      children: [extension('missing', 'Solid')],
      params: { count: 1 },
    });
    expect(unwrapErr(ev.evaluate(node)).code).toBe(BrepErrorCode.CSG_EXTENSION_UNKNOWN);
    expect(c.calls()).toBe(0);
  });

  it('propagates an evaluator Err and caches nothing for the failed node', () => {
    using ev = new Evaluator({
      extensions: { nope: () => err(validationError('TEST_NOPE', 'refused')) },
    });
    const r = ev.evaluate(extension('nope', 'Solid'));
    expect(unwrapErr(r).code).toBe('TEST_NOPE');
    expect(ev.cacheStats().entries).toBe(0);
  });

  it('lets a thrown evaluator error escape evaluate(), like a built-in throw', () => {
    using ev = new Evaluator({
      extensions: {
        boom: () => {
          throw new Error('boom');
        },
      },
    });
    expect(() => ev.evaluate(extension('boom', 'Solid'))).toThrow('boom');
  });

  it('rejects a non-function registry entry at construction', () => {
    const bogus: unknown = 5;
    expect(() => new Evaluator({ extensions: { x: bogus as ExtensionEvaluator } })).toThrow(
      TypeError
    );
  });

  it('meshes an extension directly and under a rigid placement', () => {
    using ev = new Evaluator({ extensions: { cube: cubeEval } });
    const direct = unwrap(ev.evaluateMesh(cube(10)));
    expect(direct.triangles.length).toBeGreaterThan(0);
    const placed = unwrap(ev.evaluateMesh(translate(cube(10), [100, 0, 0])));
    let minX = Infinity;
    for (let i = 0; i < placed.vertices.length; i += 3) {
      minX = Math.min(minX, placed.vertices[i] ?? Infinity);
    }
    expect(minX).toBeCloseTo(100, 3);
  });
});

describe('Extension result ownership', () => {
  it('keeps a result that aliases its child alive until its last cache entry is evicted', () => {
    using ev = new Evaluator({ maxCacheEntries: 2, extensions: { row: rowEval } });
    const node = extension('row', 'Solid', { children: [box(4, 4, 4)], params: { count: 1 } });
    const shape = unwrap(ev.evaluate(node)); // cache: [child, ext], one shared handle
    unwrap(ev.evaluate(box(1, 1, 1))); // evicts the child's entry only
    expect(isLive(shape)).toBe(true);
    expect(unwrap(ev.evaluate(node))).toBe(shape);
    expect(vol(shape)).toBeCloseTo(64, 3);
    unwrap(ev.evaluate(box(2, 2, 2)));
    unwrap(ev.evaluate(box(3, 3, 3))); // evicts the extension's entry, the last reference
    expect(isLive(shape)).toBe(false);
  });

  it('frees an aliased result when the Evaluator is disposed', () => {
    const ev = new Evaluator({ extensions: { row: rowEval } });
    const shape = unwrap(
      ev.evaluate(extension('row', 'Solid', { children: [box(4, 4, 4)], params: { count: 1 } }))
    );
    ev[Symbol.dispose]();
    expect(isLive(shape)).toBe(false);
  });
});

describe('Extension structural hash', () => {
  it('is identical for identical builder calls and sensitive to every field', () => {
    const make = (name = 'op', data: JsonValue = { axis: 'z' }) =>
      extension(name, 'Solid', {
        children: [box(1, 2, 3)],
        params: { n: 2, w: param('w') },
        data,
      });
    expect(make().structuralHash).toBe(make().structuralHash);
    expect(make('op2').structuralHash).not.toBe(make().structuralHash);
    expect(make('op', { axis: 'x' }).structuralHash).not.toBe(make().structuralHash);
    expect(extension('op', 'Face').structuralHash).not.toBe(
      extension('op', 'Solid').structuralHash
    );
    expect(extension('op', 'Solid', { params: { n: 1 } }).structuralHash).not.toBe(
      extension('op', 'Solid', { params: { n: 2 } }).structuralHash
    );
    expect(extension('op', 'Solid', { children: [box(1, 1, 1)] }).structuralHash).not.toBe(
      extension('op', 'Solid', { children: [box(1, 1, 2)] }).structuralHash
    );
    expect(extension('op', 'Solid', { params: { x: 1 } }).structuralHash).not.toBe(
      extension('op', 'Solid', { data: { x: 1 } }).structuralHash
    );
  });

  it('ignores object key order and -0 but not array order or value types', () => {
    const h = (data: JsonValue) => extension('op', 'Solid', { data }).structuralHash;
    expect(h({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(h({ b: { d: [1, 2], c: 2 }, a: 1 }));
    expect(h({ '10': 1, '9': 2 })).toBe(h({ '9': 2, '10': 1 }));
    expect(h({ z: -0 })).toBe(h({ z: 0 }));
    expect(h(null)).toBe(extension('op', 'Solid').structuralHash);
    expect(h([1, 2])).not.toBe(h([2, 1]));
    expect(h({ a: 1 })).not.toBe(h({ a: '1' }));
    expect(h(['ab', 'c'])).not.toBe(h(['a', 'bc']));
    expect(h({ a: [1] })).not.toBe(h({ a: { '0': 1 } }));
    expect(h(false)).not.toBe(h(0));
    expect(h('\uD800')).not.toBe(h('�'));
    expect(extension('op', 'Solid', { params: { x: 1, y: 2 } }).structuralHash).toBe(
      extension('op', 'Solid', { params: { y: 2, x: 1 } }).structuralHash
    );
  });

  it('stores a frozen copy, so later caller mutation cannot desync the hash', () => {
    const data = { list: [1, 2], nested: { k: 'v' } };
    const node = extension('op', 'Solid', { data });
    const before = node.structuralHash;
    data.list.push(3);
    data.nested.k = 'changed';
    expect(node.data).toEqual({ list: [1, 2], nested: { k: 'v' } });
    expect(Object.isFrozen(node.data)).toBe(true);
    expect(extension('op', 'Solid', { data: node.data }).structuralHash).toBe(before);
  });

  it('unions freeParams over params and children', () => {
    const node = extension('op', 'Solid', {
      children: [box(param('w'), 1, 1)],
      params: { n: param('n') },
    });
    expect([...node.freeParams].sort()).toEqual(['n', 'w']);
  });
});

describe('Extension serialization', () => {
  it('round-trips through JSON text with an equal hash and a shared subtree', () => {
    const shared = extension('row', 'Solid', {
      children: [box(5, 5, 5)],
      params: { count: param('n'), spacing: 10 },
      data: { axis: 'x', tags: ['a', 'b'], nested: { z: 1, a: null, ok: true } },
    });
    const tree = fuse(translate(shared, [0, 50, 0]), translate(shared, [0, -50, 0]));
    const envelope = toJSON(tree);
    expect(envelope.csgVersion).toBe(CSG_VERSION);
    expect(envelope.defs).toHaveLength(1);

    const restored = unwrap(fromJSON(JSON.parse(JSON.stringify(envelope))));
    expect(restored.structuralHash).toBe(tree.structuralHash);
    if (restored.kind !== 'Fuse' || restored.a.kind !== 'Translate') throw new Error('shape');
    if (restored.b.kind !== 'Translate') throw new Error('shape');
    expect(restored.a.target).toBe(restored.b.target);
    const ext = restored.a.target;
    if (ext.kind !== 'Extension') throw new Error('kind');
    expect(ext.data).toEqual(shared.data);
  });

  it('evaluates a deserialized tree from the original cache entries', () => {
    const c = counted(cubeEval);
    using ev = new Evaluator({ extensions: { cube: c.fn } });
    const tree = translate(cube(7), [1, 2, 3]);
    unwrap(ev.evaluate(tree));
    unwrap(ev.evaluate(unwrap(fromJSON(toJSON(tree)))));
    expect(c.calls()).toBe(1);
  });

  it('keeps a __proto__ key as plain data through a round trip', () => {
    const data = JSON.parse('{"__proto__": {"x": 1}}') as JsonValue;
    const node = extension('op', 'Solid', { data });
    expect(Object.keys(node.data as object)).toEqual(['__proto__']);
    expect(node.structuralHash).not.toBe(extension('op', 'Solid', { data: {} }).structuralHash);
    const restored = unwrap(fromJSON(JSON.parse(JSON.stringify(toJSON(node)))));
    expect(restored.structuralHash).toBe(node.structuralHash);
  });

  it('accepts a minimal node and defaults children, params, and data', () => {
    const r = fromJSON({
      csgVersion: CSG_VERSION,
      root: { kind: 'Extension', name: 'x', output: 'Solid' },
    });
    expect(unwrap(r).structuralHash).toBe(extension('x', 'Solid').structuralHash);
  });

  it('rejects malformed extension documents with an Err instead of throwing', () => {
    const doc = (root: Record<string, unknown>) =>
      fromJSON({
        csgVersion: CSG_VERSION,
        root: { kind: 'Extension', name: 'x', output: 'Solid', ...root },
      });
    expect(isErr(doc({ name: '' }))).toBe(true);
    expect(isErr(doc({ name: 7 }))).toBe(true);
    expect(isErr(doc({ output: 'Banana' }))).toBe(true);
    expect(isErr(doc({ children: 'nope' }))).toBe(true);
    expect(isErr(doc({ params: [] }))).toBe(true);
    expect(isErr(doc({ params: { n: { kind: 'Nope' } } }))).toBe(true);
    expect(isErr(doc({ data: { n: Number.NaN } }))).toBe(true);
    expect(isErr(doc({ data: { d: new Date(0) } }))).toBe(true);
    expect(isOk(doc({}))).toBe(true);
  });
});

describe('Extension through optimize, edit, and traversal', () => {
  it('optimize folds children and params but keeps the node and its Empty children', () => {
    const node = extension('row', 'Solid', {
      children: [translate(box(5, 5, 5), [0, 0, 0]), emptySolid()],
      params: { count: add(numLit(1), numLit(2)) },
      data: { k: 1 },
    });
    const opt = optimize(node);
    if (opt.kind !== 'Extension') throw new Error(`expected Extension, got ${opt.kind}`);
    expect(opt.children.map((c) => c.kind)).toEqual(['Box', 'Empty']);
    expect(opt.params['count']).toMatchObject({ kind: 'NumLit', value: 3 });
    expect(opt.name).toBe('row');
    expect(opt.output).toBe('Solid');
    expect(opt.data).toEqual({ k: 1 });
  });

  it('replaceNode rebuilds through the builder so the hash follows the new child', () => {
    const target = box(5, 5, 5);
    const node = extension('row', 'Solid', { children: [target], params: { n: 2 }, data: [1] });
    const edited = replaceNode(node, (n) => n === target, box(6, 6, 6));
    expect(edited.kind).toBe('Extension');
    expect(edited.structuralHash).not.toBe(node.structuralHash);
    expect(edited.structuralHash).toBe(
      extension('row', 'Solid', { children: [box(6, 6, 6)], params: { n: 2 }, data: [1] })
        .structuralHash
    );
    expect(replaceNode(node, () => false, box(1, 1, 1)).structuralHash).toBe(node.structuralHash);
  });

  it('traverses children and reports the declared output kind', () => {
    const node = extension('op', 'Compound', { children: [box(1, 1, 1), box(2, 2, 2)] });
    expect(nodeCount(node)).toBe(3);
    const kinds: string[] = [];
    forEachNode(node, (n) => kinds.push(n.kind));
    expect(kinds).toEqual(['Extension', 'Box', 'Box']);
    expect(outputKindOf(node)).toBe('Compound');
    expect(outputKindOf(translate(extension('op', 'Face'), [1, 0, 0]))).toBe('Face');
  });
});

describe('Extension builder validation', () => {
  const withData = (data: unknown) => () => extension('op', 'Solid', { data: data as JsonValue });

  it('rejects an empty name and an unknown output kind', () => {
    expect(() => extension('', 'Solid')).toThrow(TypeError);
    const bogus: string = 'Banana';
    expect(() => extension('op', bogus as OutputKind)).toThrow(TypeError);
  });

  it('rejects data JSON cannot round-trip, naming the path', () => {
    class Custom {
      readonly v = 1;
    }
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(withData({ a: { b: () => 1 } })).toThrow(/data\.a\.b: function/);
    expect(withData({ a: undefined })).toThrow(/data\.a: undefined/);
    expect(withData([1, Number.NaN])).toThrow(/data\[1\]: NaN/);
    expect(withData({ x: Infinity })).toThrow(/Infinity/);
    expect(withData({ big: 10n })).toThrow(/bigint/);
    expect(withData({ s: Symbol('s') })).toThrow(/symbol/);
    expect(withData({ d: new Date(0) })).toThrow(/Date instance/);
    expect(withData(new Map())).toThrow(/Map instance/);
    expect(withData({ c: new Custom() })).toThrow(/Custom instance/);
    expect(withData(circular)).toThrow(/circular/);
  });

  it('accepts shared (non-circular) references and null-prototype objects', () => {
    const leaf = { v: 1 };
    const bare = Object.assign(Object.create(null) as Record<string, unknown>, { a: 1 });
    expect(withData({ x: leaf, y: leaf })).not.toThrow();
    expect(extension('op', 'Solid', { data: bare as JsonValue }).structuralHash).toBe(
      extension('op', 'Solid', { data: { a: 1 } }).structuralHash
    );
  });

  it('rejects a param that is neither a number nor an Expr', () => {
    const params: unknown = { n: 'five' };
    expect(() => extension('op', 'Solid', { params: params as Record<string, number> })).toThrow(
      /params\.n/
    );
  });
});
