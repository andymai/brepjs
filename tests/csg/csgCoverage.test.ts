/**
 * Coverage tests — exercise the long tail of builders, evaluators, optimizer,
 * serializer, and edit paths to bring csg/* over project coverage thresholds.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from '../setup.js';
import {
  box,
  sphere,
  cylinder,
  cone,
  torus,
  polygon,
  circle,
  line,
  vertex,
  compound,
  fuse,
  cut,
  intersect,
  fuseAll,
  cutAll,
  translate,
  rotate,
  scale,
  mirror,
  emptySolid,
  emptyFace,
  emptyWire,
  param,
  numLit,
  buildVec,
  component,
  unaryOp,
  binOp,
  vec2Lit,
  vec3Lit,
  asScalarExpr,
  asVec3Expr,
  asVec2Expr,
  outputKindOf,
  Evaluator,
} from '@/csg/index.js';
import { optimize, foldExpr } from '@/csg/optimize.js';
import { toJSON, fromJSON } from '@/csg/serialize.js';
import { replaceNode, forEachNode, nodeCount } from '@/csg/edit.js';
import { evalScalar, evalVec3, evalExpr, projectEnv } from '@/csg/expressions.js';
import { isOk, isErr, unwrap, measureVolume, measureArea } from '@/index.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function vol(s: AnyShape<Dimension>): number {
  return unwrap(measureVolume(s));
}

// ---------------------------------------------------------------------------
// Primitives — exercise all evaluator branches
// ---------------------------------------------------------------------------

describe('primitives — evaluator coverage', () => {
  it('evaluates Cone', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(cone(5, 3, 10));
    expect(isOk(r)).toBe(true);
  });

  it('evaluates Torus', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(torus(10, 2));
    expect(isOk(r)).toBe(true);
  });

  it('evaluates Polygon (triangle)', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(
      polygon([
        [0, 0, 0],
        [10, 0, 0],
        [5, 10, 0],
      ])
    );
    expect(isOk(r)).toBe(true);
    expect(unwrap(measureArea(unwrap(r)))).toBeGreaterThan(0);
  });

  it('evaluates Circle', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(circle(5));
    expect(isOk(r)).toBe(true);
  });

  it('evaluates Line', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(line([0, 0, 0], [10, 0, 0]));
    expect(isOk(r)).toBe(true);
  });

  it('evaluates Vertex', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(vertex([0, 0, 0]));
    expect(isOk(r)).toBe(true);
  });

  it('errors on unbound Param in any primitive', () => {
    using ev = new Evaluator();
    expect(isErr(ev.evaluate(sphere(param('r'))))).toBe(true);
    expect(isErr(ev.evaluate(cylinder(param('r'), 10)))).toBe(true);
    expect(isErr(ev.evaluate(cone(param('r'), 1, 10)))).toBe(true);
    expect(isErr(ev.evaluate(torus(param('r'), 1)))).toBe(true);
    expect(isErr(ev.evaluate(circle(param('r'))))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Transforms — evaluator coverage
// ---------------------------------------------------------------------------

describe('transforms — evaluator coverage', () => {
  it('evaluates Scale with center option', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(scale(box(10, 10, 10), 2, { center: [5, 5, 5] }));
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(8000, 0);
  });

  it('evaluates Mirror', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(mirror(box(10, 10, 10), { normal: [1, 0, 0], at: [5, 0, 0] }));
    expect(isOk(r)).toBe(true);
  });

  it('evaluates Mirror with defaults', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(mirror(translate(box(10, 10, 10), [5, 0, 0])));
    expect(isOk(r)).toBe(true);
  });

  it('evaluates Rotate with axis option', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(rotate(box(10, 10, 10), 90, { axis: [1, 0, 0], at: [0, 0, 0] }));
    expect(isOk(r)).toBe(true);
  });

  it('Empty target errors for every transform', () => {
    using ev = new Evaluator();
    expect(isErr(ev.evaluate(translate(emptySolid(), [1, 0, 0])))).toBe(true);
    expect(isErr(ev.evaluate(rotate(emptySolid(), 90)))).toBe(true);
    expect(isErr(ev.evaluate(scale(emptySolid(), 2)))).toBe(true);
    expect(isErr(ev.evaluate(mirror(emptySolid())))).toBe(true);
  });

  it('Param-driven Translate vector', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(translate(box(10, 10, 10), [param('dx'), 0, 0]), { dx: 5 });
    expect(isOk(r)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Booleans — evaluator coverage
// ---------------------------------------------------------------------------

describe('booleans — evaluator coverage', () => {
  it('evaluates Intersect', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(intersect(box(10, 10, 10), translate(box(10, 10, 10), [5, 0, 0])));
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeGreaterThan(0);
  });

  it('evaluates FuseAll', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(
      fuseAll([
        box(10, 10, 10),
        translate(box(10, 10, 10), [20, 0, 0]),
        translate(box(10, 10, 10), [40, 0, 0]),
      ])
    );
    expect(isOk(r)).toBe(true);
    expect(vol(unwrap(r))).toBeCloseTo(3000, 0);
  });

  it('evaluates CutAll', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(
      cutAll(box(30, 10, 10), [
        translate(box(5, 5, 5), [5, 0, 0]),
        translate(box(5, 5, 5), [20, 0, 0]),
      ])
    );
    expect(isOk(r)).toBe(true);
  });

  it('FuseAll with one non-empty short-circuits', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(fuseAll([emptySolid(), box(10, 10, 10), emptySolid()]));
    expect(vol(unwrap(r))).toBeCloseTo(1000, 0);
  });

  it('FuseAll all-empty errors', () => {
    using ev = new Evaluator();
    expect(isErr(ev.evaluate(fuseAll([emptySolid(), emptySolid()])))).toBe(true);
  });

  it('CutAll empty base errors', () => {
    using ev = new Evaluator();
    expect(isErr(ev.evaluate(cutAll(emptySolid(), [box(1, 1, 1)])))).toBe(true);
  });

  it('CutAll all-empty tools returns base', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(cutAll(box(10, 10, 10), [emptySolid()]));
    expect(vol(unwrap(r))).toBeCloseTo(1000, 0);
  });

  it('Intersect with empty operand errors', () => {
    using ev = new Evaluator();
    expect(isErr(ev.evaluate(intersect(box(1, 1, 1), emptySolid())))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Compound evaluator
// ---------------------------------------------------------------------------

describe('compound — evaluator coverage', () => {
  it('evaluates a Compound of two solids', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(compound([box(10, 10, 10), translate(sphere(2), [20, 0, 0])]));
    expect(isOk(r)).toBe(true);
  });

  it('Compound with all-empty children errors', () => {
    using ev = new Evaluator();
    expect(isErr(ev.evaluate(compound([emptySolid(), emptySolid()])))).toBe(true);
  });

  it('Compound filters out Empty children', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(compound([emptySolid(), box(10, 10, 10)]));
    expect(isOk(r)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// outputKindOf
// ---------------------------------------------------------------------------

describe('outputKindOf', () => {
  it('reports Solid for primitives', () => {
    expect(outputKindOf(box(1, 1, 1))).toBe('Solid');
    expect(outputKindOf(sphere(1))).toBe('Solid');
    expect(outputKindOf(cylinder(1, 1))).toBe('Solid');
    expect(outputKindOf(cone(1, 1, 1))).toBe('Solid');
    expect(outputKindOf(torus(1, 1))).toBe('Solid');
  });

  it('reports Face / Edge / Vertex for shape primitives', () => {
    expect(
      outputKindOf(
        polygon([
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ])
      )
    ).toBe('Face');
    expect(outputKindOf(circle(1))).toBe('Edge');
    expect(outputKindOf(line([0, 0, 0], [1, 0, 0]))).toBe('Edge');
    expect(outputKindOf(vertex([0, 0, 0]))).toBe('Vertex');
  });

  it('Empty reports its declared output', () => {
    expect(outputKindOf(emptySolid())).toBe('Solid');
    expect(outputKindOf(emptyFace())).toBe('Face');
    expect(outputKindOf(emptyWire())).toBe('Wire');
  });

  it('boolean preserves operand a kind; transform preserves target kind', () => {
    expect(outputKindOf(fuse(box(1, 1, 1), sphere(1)))).toBe('Solid');
    expect(outputKindOf(cut(box(1, 1, 1), sphere(1)))).toBe('Solid');
    expect(outputKindOf(intersect(box(1, 1, 1), sphere(1)))).toBe('Solid');
    expect(outputKindOf(fuseAll([box(1, 1, 1)]))).toBe('Solid');
    expect(outputKindOf(fuseAll([]))).toBe('Solid');
    expect(outputKindOf(cutAll(box(1, 1, 1), [sphere(1)]))).toBe('Solid');
    expect(outputKindOf(translate(box(1, 1, 1), [0, 0, 0]))).toBe('Solid');
    expect(outputKindOf(rotate(box(1, 1, 1), 0))).toBe('Solid');
    expect(outputKindOf(scale(box(1, 1, 1), 1))).toBe('Solid');
    expect(outputKindOf(mirror(box(1, 1, 1)))).toBe('Solid');
    expect(outputKindOf(compound([]))).toBe('Compound');
  });
});

// ---------------------------------------------------------------------------
// Expressions — coverage for uncovered branches
// ---------------------------------------------------------------------------

describe('expressions — coverage', () => {
  it('every BinOp operator', () => {
    expect(unwrap(evalScalar(binOp('-', numLit(5), numLit(2)), {}, 't'))).toBe(3);
    expect(unwrap(evalScalar(binOp('*', numLit(3), numLit(4)), {}, 't'))).toBe(12);
    expect(unwrap(evalScalar(binOp('/', numLit(10), numLit(2)), {}, 't'))).toBe(5);
  });

  it('every UnaryOp', () => {
    expect(unwrap(evalScalar(unaryOp('neg', numLit(5)), {}, 't'))).toBe(-5);
    expect(unwrap(evalScalar(unaryOp('abs', numLit(-7)), {}, 't'))).toBe(7);
    expect(unwrap(evalScalar(unaryOp('sqrt', numLit(16)), {}, 't'))).toBe(4);
    expect(unwrap(evalScalar(unaryOp('sin', numLit(0)), {}, 't'))).toBe(0);
    expect(unwrap(evalScalar(unaryOp('cos', numLit(0)), {}, 't'))).toBe(1);
  });

  it('Component on Vec3Lit', () => {
    const v = vec3Lit([1, 2, 3]);
    expect(unwrap(evalScalar(component(v, 0), {}, 't'))).toBe(1);
    expect(unwrap(evalScalar(component(v, 2), {}, 't'))).toBe(3);
  });

  it('Component on a Param-bound Vec3', () => {
    const expr = component(param('v'), 1);
    expect(unwrap(evalScalar(expr, { v: [10, 20, 30] }, 't'))).toBe(20);
  });

  it('Component errors on scalar input', () => {
    const expr = component(numLit(5), 0);
    expect(isErr(evalScalar(expr, {}, 't'))).toBe(true);
  });

  it('BuildVec mismatched dim errors', () => {
    const bad = buildVec(3, [numLit(1), numLit(2)]);
    expect(isErr(evalExpr(bad, {}))).toBe(true);
  });

  it('BinOp error propagates from operand', () => {
    expect(isErr(evalScalar(binOp('+', param('missing'), numLit(1)), {}, 't'))).toBe(true);
  });

  it('BinOp(/) by zero returns an error (not Infinity/NaN)', () => {
    expect(isErr(evalScalar(binOp('/', numLit(1), numLit(0)), {}, 't'))).toBe(true);
  });

  it('asScalarExpr passes through Expr', () => {
    const e = param('x');
    expect(asScalarExpr(e)).toBe(e);
  });

  it('asVec3Expr lifts mixed array to BuildVec', () => {
    const e = asVec3Expr([param('x'), 0, 0]);
    expect(e.kind).toBe('BuildVec');
  });

  it('asVec3Expr passes through bare Expr', () => {
    const e = vec3Lit([1, 2, 3]);
    expect(asVec3Expr(e)).toBe(e);
  });

  it('asVec2Expr lifts mixed array', () => {
    const e = asVec2Expr([param('x'), 0]);
    expect(e.kind).toBe('BuildVec');
  });

  it('asVec2Expr passes literal as Vec2Lit', () => {
    const e = asVec2Expr([1, 2]);
    expect(e.kind).toBe('Vec2Lit');
  });

  it('asVec2Expr passes bare Expr through', () => {
    const e = vec2Lit([1, 2]);
    expect(asVec2Expr(e)).toBe(e);
  });

  it('Vec3Lit and Vec2Lit eval', () => {
    expect(unwrap(evalVec3(vec3Lit([1, 2, 3]), {}, 't'))).toEqual([1, 2, 3]);
    expect(unwrap(evalExpr(vec2Lit([4, 5]), {}))).toEqual([4, 5]);
  });

  it('evalVec3 errors when expr produces a scalar', () => {
    expect(isErr(evalVec3(numLit(5), {}, 't'))).toBe(true);
  });

  it('projectEnv restricts to declared keys', () => {
    const env = { a: 1, b: 2, c: 3 };
    const proj = projectEnv(env, new Set(['a', 'c']));
    expect(Object.keys(proj).sort()).toEqual(['a', 'c']);
  });

  it('projectEnv empty deps returns empty', () => {
    const proj = projectEnv({ a: 1 }, new Set());
    expect(Object.keys(proj).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Optimizer — coverage
// ---------------------------------------------------------------------------

describe('optimize — coverage', () => {
  it('folds BuildVec of NumLits into Vec3Lit', () => {
    const folded = foldExpr(buildVec(3, [numLit(1), numLit(2), numLit(3)]));
    expect(folded.kind).toBe('Vec3Lit');
  });

  it('folds BuildVec(2) of NumLits into Vec2Lit', () => {
    const folded = foldExpr(buildVec(2, [numLit(1), numLit(2)]));
    expect(folded.kind).toBe('Vec2Lit');
  });

  it('folds Component on Vec3Lit', () => {
    const folded = foldExpr(component(vec3Lit([1, 2, 3]), 1));
    expect(folded.kind).toBe('NumLit');
    if (folded.kind === 'NumLit') expect(folded.value).toBe(2);
  });

  it('folds Component on Vec2Lit', () => {
    const folded = foldExpr(component(vec2Lit([10, 20]), 1));
    expect(folded.kind).toBe('NumLit');
    if (folded.kind === 'NumLit') expect(folded.value).toBe(20);
  });

  it('folds every BinOp', () => {
    expect((foldExpr(binOp('-', numLit(5), numLit(3))) as { value: number }).value).toBe(2);
    expect((foldExpr(binOp('*', numLit(2), numLit(3))) as { value: number }).value).toBe(6);
    expect((foldExpr(binOp('/', numLit(10), numLit(2))) as { value: number }).value).toBe(5);
  });

  it('folds every UnaryOp', () => {
    expect((foldExpr(unaryOp('neg', numLit(3))) as { value: number }).value).toBe(-3);
    expect((foldExpr(unaryOp('abs', numLit(-3))) as { value: number }).value).toBe(3);
    expect((foldExpr(unaryOp('sqrt', numLit(9))) as { value: number }).value).toBe(3);
    expect((foldExpr(unaryOp('sin', numLit(0))) as { value: number }).value).toBe(0);
    expect((foldExpr(unaryOp('cos', numLit(0))) as { value: number }).value).toBe(1);
  });

  it('leaves Param alone', () => {
    expect(foldExpr(param('x')).kind).toBe('Param');
  });

  it('Cut(empty, x) folds to empty', () => {
    const opt = optimize(cut(emptySolid(), box(1, 1, 1)));
    expect(opt.kind).toBe('Empty');
  });

  it('optimizes inside transforms', () => {
    const tree = scale(box(numLit(10), numLit(10), numLit(10)), 2);
    const opt = optimize(tree);
    expect(opt.kind).toBe('Scale');
  });

  it('optimizes rotate/mirror children', () => {
    const tree = mirror(rotate(box(1, 1, 1), 45));
    const opt = optimize(tree);
    expect(opt.kind).toBe('Mirror');
  });

  it('optimizes compound children', () => {
    const tree = compound([box(1, 1, 1), fuse(emptySolid(), sphere(2))]);
    const opt = optimize(tree);
    expect(opt.kind).toBe('Compound');
  });

  it('optimizes primitives by folding their exprs', () => {
    const tree = box(binOp('+', numLit(2), numLit(3)), numLit(4), numLit(5));
    const opt = optimize(tree);
    if (opt.kind !== 'Box') throw new Error('expected Box');
    expect(opt.x.kind).toBe('NumLit');
    if (opt.x.kind === 'NumLit') expect(opt.x.value).toBe(5);
  });

  it('FuseAll empty folds to emptySolid', () => {
    const opt = optimize(fuseAll([]));
    expect(opt.kind).toBe('Empty');
  });

  it('CutAll non-empty tools survives', () => {
    const opt = optimize(cutAll(box(10, 10, 10), [sphere(2)]));
    expect(opt.kind).toBe('CutAll');
  });

  it('Translate fusion does NOT trigger when an operand vector is non-literal', () => {
    const tree = translate(translate(box(1, 1, 1), [param('a'), 0, 0]), [2, 0, 0]);
    const opt = optimize(tree);
    if (opt.kind !== 'Translate') throw new Error('expected outer Translate');
    if (opt.target.kind !== 'Translate') throw new Error('inner Translate should remain');
  });

  it('Compound filters out optimized-to-Empty children', () => {
    const opt = optimize(compound([box(1, 1, 1), fuse(emptySolid(), emptySolid())]));
    if (opt.kind !== 'Compound') throw new Error('expected Compound');
    expect(opt.children.length).toBe(1);
    expect(opt.children[0]?.kind).toBe('Box');
  });

  it('foldExpr propagates partial folds through BinOp', () => {
    // (2 * 3) + x should fold to 6 + x, not stay as the original tree.
    const expr = binOp('+', binOp('*', numLit(2), numLit(3)), param('x'));
    const folded = foldExpr(expr);
    if (folded.kind !== 'BinOp') throw new Error('expected BinOp');
    expect(folded.a.kind).toBe('NumLit');
    if (folded.a.kind === 'NumLit') expect(folded.a.value).toBe(6);
  });

  it('foldExpr propagates partial folds through UnaryOp', () => {
    // neg(2 * 3) should fold to -6 (full collapse), and abs(x + 2*3) → abs(x + 6).
    expect(
      (foldExpr(unaryOp('neg', binOp('*', numLit(2), numLit(3)))) as { value: number }).value
    ).toBe(-6);
    const partial = foldExpr(
      unaryOp('abs', binOp('+', param('x'), binOp('*', numLit(2), numLit(3))))
    );
    if (partial.kind !== 'UnaryOp') throw new Error('expected UnaryOp');
    if (partial.arg.kind !== 'BinOp') throw new Error('expected BinOp inside');
    expect(partial.arg.b.kind).toBe('NumLit');
  });

  it('foldExpr propagates partial folds through Component', () => {
    // component(buildVec(3, [x, 2*3, 0]), 0) should fold the inner 2*3 to 6.
    const expr = component(
      buildVec(3, [param('x'), binOp('*', numLit(2), numLit(3)), numLit(0)]),
      0
    );
    const folded = foldExpr(expr);
    if (folded.kind !== 'Component') throw new Error('expected Component');
    if (folded.vec.kind !== 'BuildVec') throw new Error('expected BuildVec');
    expect(folded.vec.components[1]?.kind).toBe('NumLit');
  });

  it('all the other primitive optimizers route correctly', () => {
    expect(optimize(sphere(2)).kind).toBe('Sphere');
    expect(optimize(cylinder(2, 3)).kind).toBe('Cylinder');
    expect(optimize(cone(2, 1, 3)).kind).toBe('Cone');
    expect(optimize(torus(5, 1)).kind).toBe('Torus');
    expect(
      optimize(
        polygon([
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ])
      ).kind
    ).toBe('Polygon');
    expect(optimize(circle(2)).kind).toBe('Circle');
    expect(optimize(line([0, 0, 0], [1, 0, 0])).kind).toBe('Line');
    expect(optimize(vertex([0, 0, 0])).kind).toBe('Vertex');
    expect(optimize(emptySolid()).kind).toBe('Empty');
  });
});

// ---------------------------------------------------------------------------
// Serializer — coverage
// ---------------------------------------------------------------------------

describe('serialize — coverage', () => {
  it('round-trips every primitive', () => {
    const trees = [
      box(1, 2, 3),
      sphere(2),
      cylinder(2, 3),
      cone(2, 1, 3),
      torus(5, 1),
      polygon([
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ]),
      circle(2),
      line([0, 0, 0], [1, 0, 0]),
      vertex([0, 0, 0]),
      emptySolid(),
      emptyFace(),
      emptyWire(),
    ];
    for (const t of trees) {
      const round = unwrap(fromJSON(toJSON(t)));
      expect(round.structuralHash).toBe(t.structuralHash);
    }
  });

  it('round-trips every boolean', () => {
    const a = box(10, 10, 10);
    const b = sphere(5);
    const trees = [fuse(a, b), cut(a, b), intersect(a, b), fuseAll([a, b]), cutAll(a, [b])];
    for (const t of trees) {
      const round = unwrap(fromJSON(toJSON(t)));
      expect(round.structuralHash).toBe(t.structuralHash);
    }
  });

  it('round-trips every transform', () => {
    const base = box(1, 1, 1);
    const trees = [
      translate(base, [1, 0, 0]),
      rotate(base, 45, { axis: [0, 0, 1], at: [1, 0, 0] }),
      scale(base, 2, { center: [0, 0, 0] }),
      mirror(base, { normal: [1, 0, 0], at: [0, 0, 0] }),
    ];
    for (const t of trees) {
      const round = unwrap(fromJSON(toJSON(t)));
      expect(round.structuralHash).toBe(t.structuralHash);
    }
  });

  it('round-trips every expression kind', () => {
    const tree = box(
      binOp('+', numLit(1), numLit(2)),
      unaryOp('abs', param('w')),
      component(buildVec(3, [param('x'), numLit(0), numLit(0)]), 0)
    );
    const round = unwrap(fromJSON(toJSON(tree)));
    expect(round.structuralHash).toBe(tree.structuralHash);
  });

  it('rejects malformed BinOp.op', () => {
    const r = fromJSON({
      csgVersion: 1,
      root: {
        kind: 'Box',
        x: {
          kind: 'BinOp',
          op: '?',
          a: { kind: 'NumLit', value: 1 },
          b: { kind: 'NumLit', value: 2 },
        },
        y: { kind: 'NumLit', value: 1 },
        z: { kind: 'NumLit', value: 1 },
      },
    });
    expect(isErr(r)).toBe(true);
  });

  it('rejects malformed UnaryOp.op', () => {
    const r = fromJSON({
      csgVersion: 1,
      root: {
        kind: 'Box',
        x: { kind: 'UnaryOp', op: 'log', arg: { kind: 'NumLit', value: 1 } },
        y: { kind: 'NumLit', value: 1 },
        z: { kind: 'NumLit', value: 1 },
      },
    });
    expect(isErr(r)).toBe(true);
  });

  it('rejects malformed Component.index', () => {
    const r = fromJSON({
      csgVersion: 1,
      root: {
        kind: 'Box',
        x: { kind: 'Component', vec: { kind: 'Vec3Lit', value: [1, 2, 3] }, index: 5 },
        y: { kind: 'NumLit', value: 1 },
        z: { kind: 'NumLit', value: 1 },
      },
    });
    expect(isErr(r)).toBe(true);
  });

  it('rejects malformed BuildVec.dim', () => {
    const r = fromJSON({
      csgVersion: 1,
      root: {
        kind: 'Box',
        x: { kind: 'BuildVec', dim: 4, components: [] },
        y: { kind: 'NumLit', value: 1 },
        z: { kind: 'NumLit', value: 1 },
      },
    });
    expect(isErr(r)).toBe(true);
  });

  it('rejects BuildVec with wrong number of components for its dim', () => {
    const r = fromJSON({
      csgVersion: 1,
      root: {
        kind: 'Translate',
        target: { kind: 'Sphere', radius: { kind: 'NumLit', value: 1 } },
        vector: {
          kind: 'BuildVec',
          dim: 3,
          components: [
            { kind: 'NumLit', value: 1 },
            { kind: 'NumLit', value: 2 },
          ],
        },
      },
    });
    expect(isErr(r)).toBe(true);
  });

  it('rejects malformed Empty.output', () => {
    const r = fromJSON({ csgVersion: 1, root: { kind: 'Empty', output: 'Banana' } });
    expect(isErr(r)).toBe(true);
  });

  it('rejects malformed tolerance', () => {
    const r = fromJSON({
      csgVersion: 1,
      root: {
        kind: 'Fuse',
        a: {
          kind: 'Box',
          x: { kind: 'NumLit', value: 1 },
          y: { kind: 'NumLit', value: 1 },
          z: { kind: 'NumLit', value: 1 },
        },
        b: { kind: 'Sphere', radius: { kind: 'NumLit', value: 1 } },
        tolerance: 'not a number',
      },
    });
    expect(isErr(r)).toBe(true);
  });

  it('rejects malformed Vec3 inside Vec3Lit', () => {
    const r = fromJSON({
      csgVersion: 1,
      root: {
        kind: 'Translate',
        target: { kind: 'Sphere', radius: { kind: 'NumLit', value: 1 } },
        vector: { kind: 'Vec3Lit', value: [1, 2] },
      },
    });
    expect(isErr(r)).toBe(true);
  });

  it('rejects malformed Vec2 inside Vec2Lit', () => {
    const r = fromJSON({
      csgVersion: 1,
      root: { kind: 'Polygon', points: [{ kind: 'Vec2Lit', value: [1] }] },
    });
    expect(isErr(r)).toBe(true);
  });

  it('rejects non-object input', () => {
    expect(isErr(fromJSON(null))).toBe(true);
    expect(isErr(fromJSON('not an object'))).toBe(true);
  });

  it('rejects bad Param.name', () => {
    const r = fromJSON({
      csgVersion: 1,
      root: { kind: 'Sphere', radius: { kind: 'Param', name: 42 } },
    });
    expect(isErr(r)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edit — coverage
// ---------------------------------------------------------------------------

describe('edit — coverage', () => {
  it('walk descends through every node kind', () => {
    const tree = compound([
      fuseAll([box(1, 1, 1), sphere(1)]),
      cutAll(box(2, 2, 2), [sphere(1)]),
      translate(rotate(scale(mirror(cylinder(1, 1)), 2), 45), [1, 0, 0]),
    ]);
    let count = 0;
    forEachNode(tree, () => count++);
    expect(count).toBeGreaterThan(10);
  });

  it('replaceNode hits FuseAll, CutAll, Compound', () => {
    const tree = compound([fuseAll([box(1, 1, 1), sphere(1)]), cutAll(box(2, 2, 2), [sphere(1)])]);
    const edited = replaceNode(tree, (n) => n.kind === 'Sphere', cylinder(1, 1));
    let cyls = 0;
    forEachNode(edited, (n) => {
      if (n.kind === 'Cylinder') cyls++;
    });
    expect(cyls).toBe(2);
  });

  it('replaceNode handles transforms', () => {
    const tree = rotate(scale(mirror(box(1, 1, 1)), 2), 45);
    const edited = replaceNode(tree, (n) => n.kind === 'Box', sphere(1));
    let spheres = 0;
    forEachNode(edited, (n) => {
      if (n.kind === 'Sphere') spheres++;
    });
    expect(spheres).toBe(1);
  });

  it('replaceNode no-match returns equivalent structure', () => {
    const tree = box(1, 1, 1);
    const edited = replaceNode(tree, (n) => n.kind === 'Sphere', cylinder(1, 1));
    expect(edited.kind).toBe('Box');
  });

  it('nodeCount counts deeply nested trees', () => {
    const tree = fuse(translate(sphere(1), [1, 0, 0]), rotate(box(1, 1, 1), 45));
    expect(nodeCount(tree)).toBe(5);
  });
});
