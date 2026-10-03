import { csg, getSolids, isSolid, unwrap } from 'brepjs';
import {
  civilSemantics,
  el,
  family,
  resolve,
  type Element,
  type ResolvedElement,
  type TransformOp,
} from 'brepjs-families';
import { vi } from 'vitest';

export const BODY_PROJECT = { name: 'Authored Bodies', projectId: 'authored-bodies' };

const Storey = family<{ readonly items: readonly Element[] }>(
  'AuthoredBodyStorey',
  ({ items }) => el('Group', {}, items),
  { archetype: 'storey' }
);

export function civilBody(
  node: csg.IRNode,
  options: {
    readonly category?: 'wall' | 'railing';
    readonly dimensions?: {
      readonly length: number;
      readonly width: number;
      readonly height: number;
    };
    readonly transform?: readonly TransformOp[];
  } = {}
): Element {
  const category = options.category ?? 'railing';
  const Product = family(
    'AuthoredBody',
    () => el('Geometry', { node, transform: options.transform ?? [] }),
    {
      semantics: civilSemantics({
        kind: 'product',
        category,
        role: category === 'wall' ? 'wall' : 'guardrail',
        material: 'Concrete',
        dimensionsMm: options.dimensions ?? { length: 2, width: 1, height: 1 },
      }),
    }
  );
  return Product({ key: 'product' });
}

export function bodyTree(product: Element, ...later: readonly Element[]): ResolvedElement {
  return resolve(Storey({ key: 'level', items: [product, ...later] }));
}

export function resolvedProduct(root: ResolvedElement, keyPath = 'level/product'): ResolvedElement {
  const find = (element: ResolvedElement): ResolvedElement | undefined =>
    element.keyPath === keyPath
      ? element
      : element.children.map(find).find((child) => child !== undefined);
  const product = find(root);
  if (product === undefined) throw new Error('Expected resolved product');
  return product;
}

export function borrowedSources(
  evaluator: csg.Evaluator,
  root: ResolvedElement,
  keyPath = 'level/product'
) {
  const evaluated = unwrap(evaluator.evaluate(resolvedProduct(root, keyPath).geometry));
  const solids = isSolid(evaluated) ? [evaluated] : getSolids(evaluated);
  const releases = solids.map((solid) => vi.spyOn(solid, Symbol.dispose));
  return { solids, releases };
}

export function disconnectedBody() {
  return csg.compound([csg.box(2, 1, 0.2), csg.translate(csg.box(2, 1, 0.2), [0, 0, 0.8])]);
}
