import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { csg, getSolids, isSolid, unwrap, type Solid } from 'brepjs';
import {
  civilSemantics,
  el,
  family,
  resolve,
  type Element,
  type ResolvedElement,
} from 'brepjs-families';
import { initKernel } from '../../../tests/setup.js';
import { familiesToBim, setFamiliesAdapterTestHooksForTesting } from '../src/familiesAdapter.js';
import { setFamiliesProductBodyTestHooksForTesting } from '../src/familiesProductBody.js';
import { bodySolids } from '../src/types/productBody.js';
import type { BimModel } from '../src/model/bimModel.js';
import type { LocalId } from '../src/identity/localId.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);

afterEach(() => {
  setFamiliesAdapterTestHooksForTesting(null);
  setFamiliesProductBodyTestHooksForTesting(null);
});

const PROJECT = { name: 'Product Body controls', projectId: 'product-body-controls' };

const Storey = family<{ readonly items: readonly Element[] }>(
  'ProductBodyStorey',
  ({ items }) => el('Group', {}, items),
  { archetype: 'storey' }
);

function wallSemantics() {
  return civilSemantics({
    kind: 'product',
    category: 'wall',
    role: 'wall',
    material: 'Concrete',
    dimensionsMm: { length: 1_000, width: 100, height: 500 },
  });
}

function railingSemantics() {
  return civilSemantics({
    kind: 'product',
    category: 'railing',
    role: 'guardrail',
    material: 'Steel',
    dimensionsMm: { length: 1_000, width: 100, height: 500 },
  });
}

const CoincidentRailing = family(
  'CoincidentRailing',
  () => el('Geometry', { node: csg.box(1_000, 100, 500) }),
  { semantics: railingSemantics() }
);

const ShiftedWall = family(
  'ShiftedWall',
  () =>
    el('Geometry', {
      node: csg.compound([csg.translate(csg.box(1_000, 100, 500), [200, 0, 0])]),
    }),
  { semantics: wallSemantics() }
);

const MultiSolidRailing = family(
  'MultiSolidRailing',
  () =>
    el('Geometry', {
      node: csg.compound([
        csg.box(1_000, 100, 50),
        csg.translate(csg.box(1_000, 100, 50), [0, 0, 450]),
      ]),
    }),
  { semantics: railingSemantics() }
);

const EvaluationFailureWall = family(
  'EvaluationFailureWall',
  () => el('Geometry', { node: csg.box(csg.param('missing'), 100, 500) }),
  { semantics: wallSemantics() }
);

const EmptyBodyWall = family('EmptyBodyWall', () => el('Geometry', { node: csg.circle(100) }), {
  semantics: wallSemantics(),
});

describe('Families civil Product Body authority', () => {
  it('keeps a coincident rectangular civil railing PARAMETRIC and releases adapter copies', () => {
    const root = oneProduct(CoincidentRailing({ key: 'railing' }));
    using evaluator = new csg.Evaluator();
    const sourceDisposals = observeSources(evaluator, findElement(root, 'level/railing'));
    let localizedDisposals = 0;
    setFamiliesProductBodyTestHooksForTesting({
      afterLocalized: (_itemIndex, solid) => solid.onDispose(() => localizedDisposals++),
    });

    const projected = unwrap(familiesToBim(root, { project: PROJECT, bodyEvaluator: evaluator }));
    using model = projected.model;
    const railing = requiredElement(model, projected.idByKeyPath.get('level/railing'), 'RAILING');
    expect(railing.geometry.kind).toBe('PARAMETRIC');
    expect(localizedDisposals).toBe(1);
    expect(sourceDisposals).toEqual([0]);
  });

  it('selects EXACT when equal-volume wall Bodies occupy different space', () => {
    const root = oneProduct(ShiftedWall({ key: 'wall' }));
    using evaluator = new csg.Evaluator();
    const projected = unwrap(familiesToBim(root, { project: PROJECT, bodyEvaluator: evaluator }));
    using model = projected.model;
    const wall = requiredElement(model, projected.idByKeyPath.get('level/wall'), 'WALL');
    expect(wall.geometry.kind).toBe('EXACT');
    expect(bodySolids(wall.geometry)).toHaveLength(1);
  });

  it('requires an evaluator for every activated civil wall or railing', () => {
    const result = familiesToBim(oneProduct(CoincidentRailing({ key: 'railing' })), {
      project: PROJECT,
    });
    expect(errorCode(result)).toBe('FAMILIES_PRODUCT_BODY_EVALUATOR_REQUIRED');
    if (!result.ok) {
      expect(result.error.metadata).toEqual({ keyPath: 'level/railing', category: 'RAILING' });
    }
  });

  it('fails closed when authored Body evaluation fails', () => {
    using evaluator = new csg.Evaluator();
    const result = familiesToBim(oneProduct(EvaluationFailureWall({ key: 'wall' })), {
      project: PROJECT,
      bodyEvaluator: evaluator,
    });
    expect(errorCode(result)).toBe('FAMILIES_PRODUCT_BODY_EVALUATION_FAILED');
    if (!result.ok) expect(result.error.message).toContain("'level/wall' (WALL)");
  });

  it('rejects a successfully evaluated Body with no solids', () => {
    using evaluator = new csg.Evaluator();
    const result = familiesToBim(oneProduct(EmptyBodyWall({ key: 'wall' })), {
      project: PROJECT,
      bodyEvaluator: evaluator,
    });
    expect(errorCode(result)).toBe('FAMILIES_PRODUCT_BODY_EMPTY');
  });

  it('rejects invalid copied solids without disposing evaluator-owned sources', () => {
    const root = oneProduct(CoincidentRailing({ key: 'railing' }));
    using evaluator = new csg.Evaluator();
    const sourceDisposals = observeSources(evaluator, findElement(root, 'level/railing'));
    setFamiliesProductBodyTestHooksForTesting({
      afterCopy: (_itemIndex, solid) => solid[Symbol.dispose](),
    });

    const result = familiesToBim(root, { project: PROJECT, bodyEvaluator: evaluator });
    expect(errorCode(result)).toBe('FAMILIES_PRODUCT_BODY_INVALID');
    expect(sourceDisposals).toEqual([0]);
  });

  it('cleans partial adapter collections when a later exact localization fails', () => {
    const root = oneProduct(MultiSolidRailing({ key: 'railing' }));
    using evaluator = new csg.Evaluator();
    const sourceDisposals = observeSources(evaluator, findElement(root, 'level/railing'));
    const copyDisposals = [0, 0];
    const localizedDisposals = [0, 0];
    setFamiliesProductBodyTestHooksForTesting({
      afterCopy: (itemIndex, solid) => solid.onDispose(() => copyDisposals[itemIndex]++),
      beforeLocalize: (itemIndex) => {
        if (itemIndex === 1) throw new Error('injected later localization failure');
      },
      afterLocalized: (itemIndex, solid) => solid.onDispose(() => localizedDisposals[itemIndex]++),
    });

    const result = familiesToBim(root, { project: PROJECT, bodyEvaluator: evaluator });
    expect(errorCode(result)).toBe('FAMILIES_PRODUCT_BODY_LOCALIZE_FAILED');
    if (!result.ok) {
      expect(result.error.metadata?.['itemIndex']).toBe(1);
      expect(result.error.cause).toBeInstanceOf(Error);
    }
    expect(copyDisposals).toEqual([1, 1]);
    expect(localizedDisposals).toEqual([1, 0]);
    expect(sourceDisposals).toEqual([0, 0]);
  });

  it('disposes localized candidates when Body comparison throws', () => {
    const root = oneProduct(CoincidentRailing({ key: 'railing' }));
    using evaluator = new csg.Evaluator();
    const sourceDisposals = observeSources(evaluator, findElement(root, 'level/railing'));
    let exactDisposals = 0;
    setFamiliesProductBodyTestHooksForTesting({
      beforeCoincidence: (exact) => {
        for (const solid of exact.solids) solid.onDispose(() => exactDisposals++);
        throw new Error('injected comparison failure');
      },
    });

    const result = familiesToBim(root, { project: PROJECT, bodyEvaluator: evaluator });
    expect(errorCode(result)).toBe('FAMILIES_PRODUCT_BODY_COMPARISON_FAILED');
    expect(exactDisposals).toBe(1);
    expect(sourceDisposals).toEqual([0]);
  });

  it('disposes a transferred exact Body when a later projection step throws', () => {
    const root = oneProduct(ShiftedWall({ key: 'wall' }));
    using evaluator = new csg.Evaluator();
    const sourceDisposals = observeSources(evaluator, findElement(root, 'level/wall'));
    let exactDisposals = 0;
    setFamiliesAdapterTestHooksForTesting({
      afterCivilProductBody: (model, localId) => {
        const wall = requiredElement(model, localId, 'WALL');
        for (const solid of bodySolids(wall.geometry)) {
          solid.onDispose(() => exactDisposals++);
        }
        throw new Error('injected post-takeover projection failure');
      },
    });

    const result = familiesToBim(root, { project: PROJECT, bodyEvaluator: evaluator });
    expect(errorCode(result)).toBe('FAMILIES_PROJECTION_FAILED');
    expect(exactDisposals).toBe(1);
    expect(sourceDisposals).toEqual([0]);
  });
});

function oneProduct(product: Element): ResolvedElement {
  return resolve(Storey({ key: 'level', items: [product] }));
}

function findElement(root: ResolvedElement, keyPath: string): ResolvedElement {
  if (root.keyPath === keyPath) return root;
  for (const child of root.children) {
    const found = findElementOrNull(child, keyPath);
    if (found !== null) return found;
  }
  throw new Error(`Expected resolved element ${keyPath}`);
}

function findElementOrNull(root: ResolvedElement, keyPath: string): ResolvedElement | null {
  if (root.keyPath === keyPath) return root;
  for (const child of root.children) {
    const found = findElementOrNull(child, keyPath);
    if (found !== null) return found;
  }
  return null;
}

function observeSources(evaluator: csg.Evaluator, element: ResolvedElement): number[] {
  const evaluated = unwrap(evaluator.evaluate(element.geometry));
  const sources: readonly Solid[] = isSolid(evaluated) ? [evaluated] : getSolids(evaluated);
  const disposals = sources.map(() => 0);
  sources.forEach((solid, itemIndex) => {
    solid.onDispose(() => disposals[itemIndex]++);
  });
  return disposals;
}

function requiredElement<C extends 'WALL' | 'RAILING'>(
  model: BimModel,
  localId: LocalId | undefined,
  category: C
): Extract<ReturnType<BimModel['getAllElements']>[number], { category: C }> {
  if (localId === undefined) throw new Error(`Expected ${category} local id`);
  const element = model.getElement(localId);
  if (element === null || element.category !== category) {
    throw new Error(`Expected ${category} element`);
  }
  return element;
}

function errorCode(result: {
  readonly ok: boolean;
  readonly error?: { readonly code: string };
}): string {
  if (result.ok || result.error === undefined) throw new Error('Expected an error Result');
  return result.error.code;
}
