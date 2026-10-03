import { bodySolids } from '../src/types/productBody.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { csg, getBounds, getKernel, unwrap, type Bounds3D } from 'brepjs';
import {
  civilSemantics,
  el,
  family,
  resolve,
  tRotate,
  tTranslate,
  type Element,
} from 'brepjs-families';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { placedSolids } from '../src/elementFns/placedGeometry.js';
import { familiesToBim } from '../src/familiesAdapter.js';
import { deriveIfcGuidSync } from '../src/identity/guidDerivation.js';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { fromIfc } from '../src/import/fromIfc.js';
import { disposeImportedModel } from '../src/import/importedModel.js';
import { recordIfcBodyFixture, IFC_BODY_META } from './helpers/ifcBodyFixture.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import { DOOR, OPENING_WALL, WINDOW, addWallWithDoor } from './helpers/openingFixture.js';
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

function expectBounds(actual: Bounds3D, expected: Bounds3D, precision = 6): void {
  for (const key of ['xMin', 'xMax', 'yMin', 'yMax', 'zMin', 'zMax'] as const)
    expect(actual[key]).toBeCloseTo(expected[key], precision);
}

const Site = family<{ readonly children: readonly Element[] }>(
  'PlacedSite',
  ({ children }) =>
    el('Group', { transform: [tRotate(90), tTranslate([100, 200, 300])] }, children),
  {
    semantics: civilSemantics({
      kind: 'site',
      category: 'site',
      role: 'transport-site',
      composition: 'element',
    }),
  }
);

const Bridge = family<{ readonly children: readonly Element[] }>(
  'PlacedBridge',
  ({ children }) => el('Group', {}, children),
  {
    semantics: civilSemantics({
      kind: 'facility',
      category: 'bridge',
      role: 'girder',
      composition: 'element',
    }),
  }
);
const Deck = family<{ readonly children: readonly Element[] }>(
  'PlacedDeck',
  ({ children }) => el('Group', {}, children),
  {
    semantics: civilSemantics({
      kind: 'spatial-part',
      category: 'bridge-part',
      role: 'deck',
      composition: 'element',
      subdivision: 'longitudinal',
    }),
  }
);

describe('retained Families Body placement and openings', () => {
  it.each(['wall', 'railing'] as const)(
    'preserves %s item order, parent placement, authored pivot order and intrinsic Datum',
    async (category) => {
      const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      {
        using evaluator = new csg.Evaluator();
        const root = resolve(
          Site({
            key: 'site',
            children: [
              Bridge({
                key: 'bridge',
                children: [
                  Deck({
                    key: 'deck',
                    children: [
                      civilBody(csg.translate(disconnectedBody(), [-1, 0, -0.2]), {
                        category,
                        transform: [tRotate(90, { at: [1, 0, 0] }), tTranslate([10, 20, 30])],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          })
        );
        const source = borrowedSources(evaluator, root, 'site/bridge/deck/product');
        const expected = [
          { xMin: 80, xMax: 82, yMin: 210, yMax: 211, zMin: 329.8, zMax: 330 },
          { xMin: 80, xMax: 82, yMin: 210, yMax: 211, zMin: 330.6, zMax: 330.8 },
        ];
        source.solids.forEach((solid, index) => {
          const bounds = expected[index];
          if (bounds === undefined) throw new Error('Unexpected source item');
          expectBounds(getBounds(solid), bounds);
        });
        const inputs = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
        const { model, idByKeyPath } = unwrap(
          familiesToBim(root, { project: BODY_PROJECT, bodyEvaluator: evaluator })
        );
        try {
          const id = idByKeyPath.get('site/bridge/deck/product');
          if (id === undefined) throw new Error('Missing product');
          const product = model.getElement(id);
          if (product?.category !== 'WALL' && product?.category !== 'RAILING')
            throw new Error('Wrong product');
          expect(product.geometry.kind).toBe('AUTHORITATIVE');
          expect(bodySolids(product.geometry)).toHaveLength(2);
          const placed = unwrap(
            placedSolids(product, {
              parentFrame: {
                origin: [100, 200, 300],
                axisX: [0, 1, 0],
                axisZ: [0, 0, 1],
              },
            })
          );
          try {
            expect(placed).toHaveLength(2);
            placed.forEach((solid, index) => {
              const bounds = expected[index];
              if (bounds === undefined) throw new Error('Unexpected placed item');
              expectBounds(getBounds(solid), bounds);
              expect(getKernel().volume(solid.wrapped)).toBeCloseTo(0.4, 8);
            });
            const bytes = unwrap(await toIfc(model, { ...IFC_BODY_META, ifcSchema: 'IFC4X3' }));
            recordIfcBodyFixture(`families-placed-${category}`, bytes, {
              guid: product.guid,
              category: product.category,
              itemVolumes: [0.4, 0.4],
              bounds: { xMin: 80, xMax: 82, yMin: 210, yMax: 211, zMin: 329.8, zMax: 330.8 },
            });
            const imported = unwrap(await fromIfc(bytes));
            try {
              const retained = imported.elements.find(({ guid }) => guid === product.guid);
              expect(retained?.geometry.solids).toHaveLength(2);
              retained?.geometry.solids.forEach((solid, index) => {
                const bounds = expected[index];
                if (bounds === undefined) throw new Error('Unexpected imported item');
                // IFC reconstruction reads float32 vertices; keep native placement checks at 1e-6.
                expectBounds(getBounds(solid), bounds, 4);
                expect(getKernel().volume(solid.wrapped)).toBeCloseTo(0.4, 4);
              });
            } finally {
              disposeImportedModel(imported);
            }
          } finally {
            placed.forEach((solid) => solid[Symbol.dispose]());
          }
        } finally {
          model[Symbol.dispose]();
        }
        source.releases.forEach((release) => expect(release).not.toHaveBeenCalled());
        source.solids.forEach((solid) =>
          expect(getKernel().volume(solid.wrapped)).toBeCloseTo(0.4, 8)
        );
        if (inputs !== null) expect(nativeShapeCount()).toBe(inputs);
      }
      if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
    }
  );

  it('retains a Wall with Door and Window cuts after the candidate opening commands', () => {
    const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    {
      using evaluator = new csg.Evaluator();
      const Door = family<{ readonly width: number; readonly height: number }>(
        'Door',
        () =>
          el('Box', {
            size: [DOOR.width, OPENING_WALL.thickness, DOOR.height],
            transform: [tTranslate([DOOR.offsetAlongWall, 0, DOOR.offsetFromFloor])],
          }),
        { role: 'fill' }
      );
      const Window = family<{ readonly width: number; readonly height: number }>(
        'Window',
        () =>
          el('Box', {
            size: [WINDOW.width, OPENING_WALL.thickness, WINDOW.height],
            transform: [tTranslate([WINDOW.offsetAlongWall, 0, WINDOW.offsetFromFloor])],
          }),
        { role: 'fill' }
      );
      const Wall = family(
        'OpeningBodyWall',
        () =>
          el('Box', {
            size: [OPENING_WALL.length, OPENING_WALL.thickness, OPENING_WALL.height],
            voids: [
              Door({ key: 'door', width: DOOR.width, height: DOOR.height }),
              Window({ key: 'window', width: WINDOW.width, height: WINDOW.height }),
            ],
          }),
        {
          semantics: civilSemantics({
            kind: 'product',
            category: 'wall',
            role: 'wall',
            material: OPENING_WALL.materialName,
            dimensionsMm: {
              length: OPENING_WALL.length,
              width: OPENING_WALL.thickness,
              height: OPENING_WALL.height,
            },
          }),
        }
      );
      const root = bodyTree(Wall({ key: 'product' }));
      const source = borrowedSources(evaluator, root);
      // Ticket05's same native fixture supplies the post-opening reference Body.
      using reference = new BimModel();
      const { wallId } = addWallWithDoor(reference);
      unwrap(reference.addWindow({ ...WINDOW, wallLocalId: wallId }));
      const expected = reference.getElement(wallId);
      if (expected?.category !== 'WALL') throw new Error('Missing reference wall');
      expect(getKernel().volume(bodySolids(expected.geometry)[0].wrapped)).toBeCloseTo(53, 8);
      const inputs = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Invoked below with the explicit model receiver via .call().
      const replace = BimModel.prototype.replaceProductBody;
      vi.spyOn(BimModel.prototype, 'replaceProductBody').mockImplementation(function (
        this: BimModel,
        input
      ) {
        const candidate = this.getElement(input.localId);
        if (candidate?.category !== 'WALL') throw new Error('Missing post-opening candidate');
        expect(getKernel().volume(bodySolids(candidate.geometry)[0].wrapped)).toBeCloseTo(53, 8);
        return replace.call(this, input);
      });
      const { model, idByKeyPath } = unwrap(
        familiesToBim(root, { project: BODY_PROJECT, bodyEvaluator: evaluator })
      );
      try {
        const id = idByKeyPath.get('level/product');
        if (id === undefined) throw new Error('Missing wall');
        const wall = model.getElement(id);
        if (wall?.category !== 'WALL') throw new Error('Missing wall');
        expect(wall.geometry.kind).toBe('AUTHORITATIVE');
        expect(bodySolids(wall.geometry)).toHaveLength(1);
        expect(getKernel().volume(bodySolids(wall.geometry)[0].wrapped)).toBeCloseTo(53, 8);
        expectBounds(
          getBounds(bodySolids(wall.geometry)[0]),
          getBounds(bodySolids(expected.geometry)[0])
        );
        expect(
          model.getAllRelationships().filter(({ kind }) => kind === 'VOIDS_WALL')
        ).toHaveLength(2);
        expect(
          model.getAllRelationships().filter(({ kind }) => kind === 'FILLS_OPENING')
        ).toHaveLength(2);
        for (const filler of ['door', 'window']) {
          for (const suffix of ['', '/fill']) {
            const key = `level/product/voids:${filler}${suffix}`;
            const openingId = idByKeyPath.get(key);
            if (openingId === undefined) throw new Error('Missing opening/fill identity');
            expect(model.getElement(openingId)?.guid).toBe(
              deriveIfcGuidSync(`elem:${BODY_PROJECT.projectId}:${key}`)
            );
          }
        }
      } finally {
        model[Symbol.dispose]();
      }
      source.releases.forEach((release) => expect(release).not.toHaveBeenCalled());
      source.solids.forEach((solid) =>
        expect(getKernel().volume(solid.wrapped)).toBeCloseTo(53, 8)
      );
      if (inputs !== null) expect(nativeShapeCount()).toBe(inputs);
    }
    if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
  });
});
