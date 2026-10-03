import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  csg,
  DisposalScope,
  getBounds,
  getKernel,
  measureVolume,
  unwrap,
  type Bounds3D,
} from 'brepjs';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { familiesToBim } from '../src/familiesAdapter.js';
import { measureProductBodyMaterial } from '../src/types/productBody.js';
import { createOverlapFixture } from './helpers/nativeBodyFixture.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import {
  BODY_PROJECT,
  bodyTree,
  borrowedSources,
  civilBody,
  disconnectedBody,
} from './helpers/familiesBodyFixture.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);
afterEach(() => vi.restoreAllMocks());

function expectBoundsClose(actual: Bounds3D, expected: Bounds3D): void {
  // Bounds are in millimetres; compare each component to six decimal places.
  for (const component of ['xMin', 'xMax', 'yMin', 'yMax', 'zMin', 'zMax'] as const) {
    expect(actual[component]).toBeCloseTo(expected[component], 6);
  }
}

describe('Families civil Product Body authority', () => {
  it('B12 retains genuinely coincident authored items until model cleanup', () => {
    const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    {
      using evaluator = new csg.Evaluator();
      const root = bodyTree(civilBody(csg.box(2, 1, 1)));
      const source = borrowedSources(evaluator, root);
      const liveInputs = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      const { model, idByKeyPath } = unwrap(
        familiesToBim(root, { project: BODY_PROJECT, bodyEvaluator: evaluator })
      );
      const id = idByKeyPath.get('level/product');
      if (id === undefined) throw new Error('Missing product');
      const product = model.getElement(id);
      if (product?.category !== 'RAILING') throw new Error('Missing railing');
      const retained = product.geometry.solids;
      const releases = retained.map((solid) => vi.spyOn(solid, Symbol.dispose));
      try {
        expect(product.geometry.kind).toBe('AUTHORITATIVE');
        expect(retained).toHaveLength(1);
        const sourceSolid = source.solids[0];
        if (sourceSolid === undefined) throw new Error('Missing source');
        expect(retained[0]).not.toBe(sourceSolid);
        expectBoundsClose(getBounds(retained[0]), getBounds(sourceSolid));
        expect(getKernel().volume(retained[0].wrapped)).toBeCloseTo(2, 8);
        releases.forEach((release) => expect(release).not.toHaveBeenCalled());
      } finally {
        model[Symbol.dispose]();
      }
      releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
      source.releases.forEach((release) => expect(release).not.toHaveBeenCalled());
      source.solids.forEach((solid) => expect(getKernel().volume(solid.wrapped)).toBeCloseTo(2, 8));
      if (liveInputs !== null) expect(nativeShapeCount()).toBe(liveInputs);
    }
    if (before !== null) expect(nativeShapeCount()).toBe(before);
  });

  it('B11 preserves both overlapping items despite the old equal scalar values', () => {
    const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    {
      using scope = new DisposalScope();
      const { a, b, p } = createOverlapFixture(scope);
      for (const [solid, xMin, xMax] of [
        [a, 0, 1],
        [b, 0.5, 1.5],
        [p, 0, 2],
      ] as const) {
        const bounds = getBounds(solid);
        expect(bounds.xMin).toBeCloseTo(xMin, 6);
        expect(bounds.xMax).toBeCloseTo(xMax, 6);
        expect(bounds.yMin).toBeCloseTo(0, 6);
        expect(bounds.yMax).toBeCloseTo(1, 6);
        expect(bounds.zMin).toBeCloseTo(0, 6);
        expect(bounds.zMax).toBeCloseTo(1, 6);
      }
      expect(unwrap(measureVolume(a)) + unwrap(measureVolume(b))).toBeCloseTo(2, 8);
      expect(unwrap(measureProductBodyMaterial([a, b]))).toBeCloseTo(1.5, 8);
      expect(unwrap(measureProductBodyMaterial([a, b, p]))).toBeCloseTo(2, 8);
      using evaluator = new csg.Evaluator();
      const root = bodyTree(
        civilBody(csg.compound([csg.box(1, 1, 1), csg.translate(csg.box(1, 1, 1), [0.5, 0, 0])]))
      );
      const source = borrowedSources(evaluator, root);
      const liveInputs = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      const { model, idByKeyPath } = unwrap(
        familiesToBim(root, { project: BODY_PROJECT, bodyEvaluator: evaluator })
      );
      try {
        const id = idByKeyPath.get('level/product');
        if (id === undefined) throw new Error('Missing product');
        const product = model.getElement(id);
        if (product?.category !== 'RAILING') throw new Error('Missing railing');
        expect(product.geometry.kind).toBe('AUTHORITATIVE');
        expect(product.geometry.solids).toHaveLength(2);
        product.geometry.solids.forEach((solid, index) => {
          expectBoundsClose(getBounds(solid), getBounds(index === 0 ? a : b));
          expect(solid).not.toBe(source.solids[index]);
        });
        expect(unwrap(measureProductBodyMaterial(product.geometry.solids))).toBeCloseTo(1.5, 8);
      } finally {
        model[Symbol.dispose]();
      }
      source.releases.forEach((release) => expect(release).not.toHaveBeenCalled());
      source.solids.forEach((solid) => expect(getKernel().volume(solid.wrapped)).toBeCloseTo(1, 8));
      if (liveInputs !== null) expect(nativeShapeCount()).toBe(liveInputs);
    }
    if (before !== null) expect(nativeShapeCount()).toBe(before);
  });

  it.each([
    {
      name: 'equal-volume shifted wall',
      node: csg.compound([csg.translate(csg.box(2, 1, 1), [0.2, 0, 0])]),
      count: 1,
      volume: 2,
    },
    { name: 'tiny unequal wall', node: csg.box(0.008, 0.008, 0.008), count: 1, volume: 0.008 ** 3 },
    { name: 'disconnected railing', node: disconnectedBody(), count: 2, volume: 0.8 },
  ])('retains $name', ({ node, name, count, volume }) => {
    using evaluator = new csg.Evaluator();
    const root = bodyTree(
      civilBody(node, { category: name.includes('wall') ? 'wall' : 'railing' })
    );
    const { model, idByKeyPath } = unwrap(
      familiesToBim(root, { project: BODY_PROJECT, bodyEvaluator: evaluator })
    );
    using owned = model;
    const id = idByKeyPath.get('level/product');
    if (id === undefined) throw new Error('Missing product');
    const product = owned.getElement(id);
    if (product?.category !== 'WALL' && product?.category !== 'RAILING')
      throw new Error('Missing product');
    expect(product.geometry.kind).toBe('AUTHORITATIVE');
    expect(product.geometry.solids).toHaveLength(count);
    expect(unwrap(measureProductBodyMaterial(product.geometry.solids))).toBeCloseTo(volume, 10);
  });

  it('requires an evaluator for activated civil products', () => {
    const result = familiesToBim(bodyTree(civilBody(csg.box(2, 1, 1))), { project: BODY_PROJECT });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'FAMILIES_PRODUCT_BODY_EVALUATOR_REQUIRED',
        metadata: { keyPath: 'level/product', category: 'RAILING' },
      },
    });
  });

  it.each([1, 2])(
    'keeps %i retained items live after the evaluator and topology cache close',
    (count) => {
      const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      {
        const projected = (() => {
          using evaluator = new csg.Evaluator();
          const root = bodyTree(civilBody(count === 1 ? csg.box(2, 1, 1) : disconnectedBody()));
          return unwrap(familiesToBim(root, { project: BODY_PROJECT, bodyEvaluator: evaluator }));
        })();
        using model = projected.model;
        const id = projected.idByKeyPath.get('level/product');
        if (id === undefined) throw new Error('Missing retained product');
        const product = model.getElement(id);
        if (product?.category !== 'RAILING') throw new Error('Missing railing');
        expect(product.geometry.kind).toBe('AUTHORITATIVE');
        expect(product.geometry.solids).toHaveLength(count);
        product.geometry.solids.forEach((solid) =>
          expect(getKernel().volume(solid.wrapped)).toBeCloseTo(count === 1 ? 2 : 0.4, 8)
        );
        if (before !== null) expect(nativeShapeCount()).toBe(before + count);
      }
      if (before !== null) expect(nativeShapeCount()).toBe(before);
    }
  );

  it.each([
    { node: csg.box(csg.param('missing'), 1, 1), code: 'FAMILIES_PRODUCT_BODY_EVALUATION_FAILED' },
    { node: csg.circle(1), code: 'FAMILIES_PRODUCT_BODY_EMPTY' },
  ])('fails closed with $code', ({ node, code }) => {
    using evaluator = new csg.Evaluator();
    const result = familiesToBim(bodyTree(civilBody(node)), {
      project: BODY_PROJECT,
      bodyEvaluator: evaluator,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code, metadata: { keyPath: 'level/product', category: 'RAILING' } },
    });
  });
});
