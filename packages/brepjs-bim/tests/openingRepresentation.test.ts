import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getBounds, getKernel, unwrap } from 'brepjs';
import * as brepjs from 'brepjs';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { fromIfc } from '../src/import/fromIfc.js';
import { disposeImportedModel } from '../src/import/importedModel.js';
import { SpfReader } from '../src/import/spfReader.js';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import {
  IFC_BODY_META,
  emittedOpening,
  recordIfcBodyFixture,
  retainedOpeningFixture,
} from './helpers/ifcBodyFixture.js';
import { bodyFixture } from './helpers/importedBodyFixture.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import { openingHost } from './helpers/openingFixture.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);
afterEach(() => vi.restoreAllMocks());

describe('IFC opening representation semantics', () => {
  for (const authority of ['PARAMETRIC', 'AUTHORITATIVE'] as const) {
    for (const fillerKind of ['DOOR', 'WINDOW'] as const) {
      it.each(['disconnected', 'aperture'] as const)(
        `${authority} ${fillerKind} preserves retained %s items with Reference openings`,
        async (layout) => {
          const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
          const sourceReleases: ReturnType<typeof vi.fn>[] = [];
          {
            const fixture = retainedOpeningFixture(authority, fillerKind, layout);
            using model = fixture.model;
            sourceReleases.push(...fixture.solids.map((solid) => vi.spyOn(solid, Symbol.dispose)));
            const liveInputs = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
            const cut = vi.spyOn(brepjs, 'cut');
            const bytes = unwrap(await toIfc(model, IFC_BODY_META));
            using reader = unwrap(await SpfReader.create(bytes));
            const representations = emittedOpening(reader, fixture.opening.guid);
            expect(representations).toEqual([
              {
                identifier: 'Reference',
                contextIdentifier: 'Reference',
                type: 'SweptSolid',
                itemIds: [expect.any(Number)],
              },
            ]);
            const imported = unwrap(await fromIfc(bytes));
            const importedReleases = imported.elements.flatMap((element) =>
              element.geometry.solids.map((solid) => vi.spyOn(solid, Symbol.dispose))
            );
            try {
              const host = imported.elements.find(({ guid }) => guid === fixture.wall.guid);
              const opening = imported.elements.find(({ guid }) => guid === fixture.opening.guid);
              const filler = imported.elements.find(({ guid }) => guid === fixture.filler.guid);
              if (!host || !opening || !filler) throw new Error('Lost opening identities');
              expect(host.voidedBy).toEqual([opening.expressId]);
              expect(filler.fills).toBe(opening.expressId);
              expect(filler.category).toBe(fillerKind);
              // Reference geometry is informative; it is not an imported display Body.
              expect(opening.geometry.completeness).toBe('NONE');
              expect(opening.geometry.solids).toHaveLength(0);
              expect(host.geometry.completeness).toBe('COMPLETE');
              expect(host.geometry.solids).toHaveLength(2);
              const expectedVolume = fixture.itemVolumes.reduce((sum, volume) => sum + volume, 0);
              expect(host.geometry.volumeMm3).toBeCloseTo(expectedVolume, 5);
              host.geometry.solids.forEach((solid, index) => {
                expect(getKernel().volume(solid.wrapped)).toBeCloseTo(
                  fixture.itemVolumes[index] ?? -1,
                  5
                );
                const source = fixture.solids[index];
                if (!source) throw new Error('Unexpected imported Body item');
                const bounds = getBounds(source);
                for (const key of ['xMin', 'xMax', 'yMin', 'yMax', 'zMin', 'zMax'] as const)
                  expect(getBounds(solid)[key]).toBeCloseTo(
                    bounds[key] + (key.startsWith('z') ? 7000 : 0),
                    5
                  );
              });
              expect(cut).not.toHaveBeenCalled();
              recordIfcBodyFixture(
                `opening-${authority.toLowerCase()}-${fillerKind.toLowerCase()}-${layout}`,
                bytes,
                {
                  kind: 'opening-semantics',
                  authority,
                  fillerKind,
                  layout,
                  guid: fixture.wall.guid,
                  openingGuid: fixture.opening.guid,
                  fillerGuid: fixture.filler.guid,
                  representations,
                  expected: { materialVolume: expectedVolume, itemVolumes: fixture.itemVolumes },
                }
              );
            } finally {
              disposeImportedModel(imported);
            }
            importedReleases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
            sourceReleases.forEach((release) => expect(release).not.toHaveBeenCalled());
            if (liveInputs !== null) expect(nativeShapeCount()).toBe(liveInputs);
          }
          sourceReleases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
          if (before !== null) expect(nativeShapeCount()).toBe(before);
        }
      );
    }
  }

  it.each(['Body', 'Reference'] as const)(
    'imports an external parametric host with a %s opening according to its representation',
    async (openingRepresentation) => {
      const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      const cut = vi.spyOn(brepjs, 'cut');
      const bytes = await bodyFixture({
        extrudedCubes: 2,
        withOpening: true,
        openingRepresentation,
      });
      const imported = unwrap(await fromIfc(bytes));
      const releases = imported.elements.flatMap((element) =>
        element.geometry.solids.map((solid) => vi.spyOn(solid, Symbol.dispose))
      );
      try {
        const host = imported.elements.find(({ category }) => category === 'WALL');
        expect(host?.geometry.completeness).toBe('COMPLETE');
        expect(host?.geometry.solids).toHaveLength(2);
        expect(host?.geometry.volumeMm3).toBeCloseTo(
          openingRepresentation === 'Body' ? 812_500 : 1_125_000,
          2
        );
        if (openingRepresentation === 'Body') expect(cut).toHaveBeenCalledTimes(2);
        else expect(cut).not.toHaveBeenCalled();
      } finally {
        disposeImportedModel(imported);
      }
      releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
      if (before !== null) expect(nativeShapeCount()).toBe(before);
    }
  );

  it('keeps recipe-exported gross Slab geometry and its Body opening subtractive', async () => {
    const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    {
      using model = new BimModel();
      const project = unwrap(
        model.init({ name: 'Gross slab control', projectId: 'gross-slab-control' })
      );
      const site = unwrap(model.addSite({ name: 'Site' }));
      const building = unwrap(model.addBuilding({ name: 'Building' }));
      const storey = unwrap(model.addStorey({ name: 'Level', elevation: 7000 }));
      model.aggregate(project, site);
      model.aggregate(site, building);
      model.aggregate(building, storey);
      const host = openingHost(model, 'Slab');
      model.placeIn(host.hostId, storey);
      unwrap(host.open());
      const slab = model.getElement(host.hostId);
      const opening = model.getAllElements().find(({ category }) => category === 'OPENING');
      if (!slab || !opening) throw new Error('Missing gross slab fixture records');
      const cut = vi.spyOn(brepjs, 'cut');
      const bytes = unwrap(await toIfc(model, IFC_BODY_META));
      using reader = unwrap(await SpfReader.create(bytes));
      expect(emittedOpening(reader, opening.guid)).toEqual([
        {
          identifier: 'Body',
          contextIdentifier: 'Body',
          type: 'SweptSolid',
          itemIds: [expect.any(Number)],
        },
      ]);
      const imported = unwrap(await fromIfc(bytes));
      try {
        const reconstructed = imported.elements.find(({ guid }) => guid === slab.guid);
        expect(reconstructed?.geometry.volumeMm3).toBeCloseTo(94, 5);
        expect(cut).toHaveBeenCalledTimes(1);
        recordIfcBodyFixture('opening-gross-slab-body', bytes, {
          kind: 'opening-semantics',
          layout: 'gross',
          guid: slab.guid,
          openingGuid: opening.guid,
          expected: { grossVolume: 100, materialVolume: 94 },
        });
      } finally {
        disposeImportedModel(imported);
      }
    }
    if (before !== null) expect(nativeShapeCount()).toBe(before);
  });
});
