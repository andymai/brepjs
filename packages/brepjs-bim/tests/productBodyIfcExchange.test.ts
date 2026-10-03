import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as WebIFC from 'web-ifc';
import { getBounds, getKernel, unwrap, type Bounds3D } from 'brepjs';
import * as brepjs from 'brepjs';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { fromIfc } from '../src/import/fromIfc.js';
import { disposeImportedModel } from '../src/import/importedModel.js';
import { SpfReader } from '../src/import/spfReader.js';
import { setGeometryReadTestHooksForTesting } from '../src/import/geometryRead.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import {
  IFC_BODY_META,
  bodyExchangeFixture,
  coordinateBounds,
  emittedBody,
  emittedOpening,
  emittedStyle,
  recordIfcBodyFixture,
  retainedOpeningFixture,
} from './helpers/ifcBodyFixture.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);
afterEach(() => {
  setGeometryReadTestHooksForTesting(null);
  vi.restoreAllMocks();
});

function expectBounds(actual: Bounds3D, expected: Bounds3D, divisor = 1): void {
  for (const key of ['xMin', 'xMax', 'yMin', 'yMax', 'zMin', 'zMax'] as const)
    expect(actual[key]).toBeCloseTo(expected[key] / divisor, 3);
}

describe('retained Product Body IFC exchange', () => {
  for (const category of ['WALL', 'RAILING'] as const) {
    for (const authority of ['PARAMETRIC', 'AUTHORITATIVE'] as const) {
      it.each(['singleton', 'disconnected', 'overlapping'] as const)(
        `${category} ${authority} preserves every %s item, placement and style`,
        async (layout) => {
          const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
          {
            const fixture = bodyExchangeFixture(category, authority, layout);
            using model = fixture.model;
            const sourceReleases = fixture.solids.map((solid) => vi.spyOn(solid, Symbol.dispose));
            const element = model.getElement(fixture.localId);
            if (element?.category !== 'WALL' && element?.category !== 'RAILING')
              throw new Error('Missing source element');
            const liveInputs = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
            const bytes = unwrap(await toIfc(model, IFC_BODY_META));
            using reader = unwrap(await SpfReader.create(bytes));
            const exported = emittedBody(reader, element.guid);
            expect(exported.representationType).toBe('Tessellation');
            expect(exported.items).toHaveLength(fixture.solids.length);
            exported.items.forEach((item, index) => {
              expect(item.type).toBe(WebIFC.IFCTRIANGULATEDFACESET);
              const expected = fixture.localBounds[index];
              if (expected === undefined) throw new Error('Unexpected emitted item');
              expectBounds(coordinateBounds(item.coords), expected, 1000);
              expect(item.triangles).toHaveLength(12);
              expect(item.styleIds).toHaveLength(fixture.styled ? 1 : 0);
              for (const styleId of item.styleIds) {
                const style = emittedStyle(reader, styleId);
                expect(style.name).toBe('Body blue');
                expect(style.r).toBeCloseTo(0.2, 6);
                expect(style.g).toBeCloseTo(0.4, 6);
                expect(style.b).toBeCloseTo(0.6, 6);
                expect(style.transparency).toBeCloseTo(0.25, 6);
              }
            });
            const reconstructedIds: number[] = [];
            const releases: ReturnType<typeof vi.fn>[] = [];
            setGeometryReadTestHooksForTesting({
              afterItemSolid: (itemId, solid) => {
                reconstructedIds.push(itemId);
                releases.push(vi.spyOn(solid, Symbol.dispose));
              },
            });
            const imported = unwrap(await fromIfc(bytes));
            try {
              const product = imported.elements.find(({ guid }) => guid === element.guid);
              if (product === undefined) throw new Error('Missing reconstructed element');
              expect(product.category).toBe(category);
              expect(product.material?.name).toBe('Concrete');
              expect(product.classification).toMatchObject({
                system: 'Step1',
                code: 'retained-body',
              });
              expect(
                product.psets.find(({ name }) => name === 'Fixture')?.properties
              ).toMatchObject({ Source: 'retained items', Enabled: true });
              expect(product.geometry.completeness).toBe('COMPLETE');
              expect(product.geometry.fidelity).toBe('TESSELLATED_MANIFOLD');
              expect(product.geometry.solids).toHaveLength(fixture.solids.length);
              expect(reconstructedIds).toEqual(exported.items.map(({ itemId }) => itemId));
              expect(product.geometry.solid).toBe(
                layout === 'singleton' ? product.geometry.solids[0] : null
              );
              product.geometry.solids.forEach((solid, index) => {
                const expected = fixture.worldBounds[index];
                const volume = fixture.itemVolumes[index];
                if (expected === undefined || volume === undefined)
                  throw new Error('Unexpected reconstructed item');
                expectBounds(getBounds(solid), expected);
                expect(getKernel().volume(solid.wrapped)).toBeCloseTo(volume, 2);
              });
              expect(product.geometry.volumeMm3).toBeCloseTo(fixture.materialVolume, 2);
              const expectedBounds = coordinateBounds(
                fixture.worldBounds.flatMap((bounds) => [
                  [bounds.xMin, bounds.yMin, bounds.zMin] as const,
                  [bounds.xMax, bounds.yMax, bounds.zMax] as const,
                ])
              );
              if (product.geometry.bounds === null) throw new Error('Missing aggregate bounds');
              expectBounds(product.geometry.bounds, expectedBounds);
              releases.forEach((release) => expect(release).not.toHaveBeenCalled());
              expect(model.getElement(fixture.localId)).toBe(element);
              expect(element.geometry).toMatchObject({ kind: authority, solids: fixture.solids });
              recordIfcBodyFixture(
                `${category.toLowerCase()}-${authority.toLowerCase()}-${layout}`,
                bytes,
                {
                  guid: element.guid,
                  category,
                  authority,
                  exported,
                  expected: {
                    localBounds: fixture.localBounds,
                    worldBounds: fixture.worldBounds,
                    itemVolumes: fixture.itemVolumes,
                    materialVolume: fixture.materialVolume,
                  },
                  imported: {
                    itemIds: reconstructedIds,
                    items: product.geometry.solids.map((solid) => ({
                      bounds: getBounds(solid),
                      volumeMm3: getKernel().volume(solid.wrapped),
                    })),
                    bounds: product.geometry.bounds,
                    volumeMm3: product.geometry.volumeMm3,
                    classification: product.classification,
                    material: product.material,
                    psets: product.psets,
                  },
                }
              );
            } finally {
              disposeImportedModel(imported);
            }
            releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
            sourceReleases.forEach((release) => expect(release).not.toHaveBeenCalled());
            fixture.solids.forEach((solid, index) =>
              expect(getKernel().volume(solid.wrapped)).toBeCloseTo(
                fixture.itemVolumes[index] ?? -1,
                2
              )
            );
            if (liveInputs !== null) expect(nativeShapeCount()).toBe(liveInputs);
          }
          if (before !== null) expect(nativeShapeCount()).toBe(before);
        }
      );
    }
  }

  it.each(['PARAMETRIC', 'AUTHORITATIVE'] as const)(
    'preserves a retained %s host and opening/filler relationships without recutting',
    async (authority) => {
      const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      {
        const fixture = retainedOpeningFixture(authority);
        using model = fixture.model;
        const liveInputs = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
        const cut = vi.spyOn(brepjs, 'cut');
        const sourceReleases = fixture.solids.map((solid) => vi.spyOn(solid, Symbol.dispose));
        const bytes = unwrap(await toIfc(model, IFC_BODY_META));
        using reader = unwrap(await SpfReader.create(bytes));
        const exported = emittedBody(reader, fixture.wall.guid);
        expect(exported.items).toHaveLength(2);
        expect(emittedOpening(reader, fixture.opening.guid)).toEqual([
          {
            identifier: 'Reference',
            type: 'SweptSolid',
            contextIdentifier: 'Reference',
            itemIds: [expect.any(Number)],
          },
        ]);
        const reconstructedIds: number[] = [];
        const releases: ReturnType<typeof vi.fn>[] = [];
        setGeometryReadTestHooksForTesting({
          afterItemSolid: (id, solid) => {
            reconstructedIds.push(id);
            releases.push(vi.spyOn(solid, Symbol.dispose));
          },
        });
        const imported = unwrap(await fromIfc(bytes));
        try {
          const host = imported.elements.find(({ guid }) => guid === fixture.wall.guid);
          const opening = imported.elements.find(({ guid }) => guid === fixture.opening.guid);
          const filler = imported.elements.find(({ guid }) => guid === fixture.filler.guid);
          if (!host || !opening || !filler) throw new Error('Opening identities were lost');
          expect(host.category).toBe('WALL');
          expect(opening.category).toBe('OPENING');
          expect(filler.category).toBe('DOOR');
          expect(host.voidedBy).toEqual([opening.expressId]);
          expect(filler.fills).toBe(opening.expressId);
          expect(host.geometry.completeness).toBe('COMPLETE');
          expect(host.geometry.fidelity).toBe('TESSELLATED_MANIFOLD');
          expect(host.geometry.solids).toHaveLength(2);
          expect(host.geometry.volumeMm3).toBeCloseTo(60, 5);
          expect(reconstructedIds).toEqual(exported.items.map(({ itemId }) => itemId));
          host.geometry.solids.forEach((solid, index) => {
            expect(getKernel().volume(solid.wrapped)).toBeCloseTo(index === 0 ? 54 : 6, 5);
            expectBounds(
              getBounds(solid),
              index === 0
                ? { xMin: 0, xMax: 10, yMin: 0, yMax: 1, zMin: 7000, zMax: 7006 }
                : { xMin: 20, xMax: 22, yMin: 0, yMax: 1, zMin: 7000, zMax: 7003 }
            );
          });
          expect(cut).not.toHaveBeenCalled();
          recordIfcBodyFixture(`wall-${authority.toLowerCase()}-retained-opening`, bytes, {
            authority,
            guid: fixture.wall.guid,
            openingGuid: fixture.opening.guid,
            fillerGuid: fixture.filler.guid,
            exported,
            imported: {
              hostId: host.expressId,
              openingId: opening.expressId,
              fillerId: filler.expressId,
              voidedBy: host.voidedBy,
              fills: filler.fills,
              itemIds: reconstructedIds,
              items: host.geometry.solids.map((solid) => ({
                bounds: getBounds(solid),
                volumeMm3: getKernel().volume(solid.wrapped),
              })),
              bounds: host.geometry.bounds,
              volumeMm3: host.geometry.volumeMm3,
            },
          });
        } finally {
          disposeImportedModel(imported);
        }
        releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
        sourceReleases.forEach((release) => expect(release).not.toHaveBeenCalled());
        fixture.solids.forEach((solid, index) =>
          expect(getKernel().volume(solid.wrapped)).toBeCloseTo(index === 0 ? 54 : 6, 6)
        );
        if (liveInputs !== null) expect(nativeShapeCount()).toBe(liveInputs);
      }
      if (before !== null) expect(nativeShapeCount()).toBe(before);
    }
  );
});
