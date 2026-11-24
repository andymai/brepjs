import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { box, getKernel, unwrap } from 'brepjs';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { readPsets } from '../src/import/dataRead.js';
import { SpfReader } from '../src/import/spfReader.js';
import { setBodyTestHooksForTesting } from '../src/bodyTestHooks.js';
import { toIfcValidated } from '../src/serialize/toIfc.js';
import {
  bodyExchangeFixture,
  emittedBody,
  IFC_BODY_META,
  recordIfcBodyFixture,
} from './helpers/ifcBodyFixture.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import { expectWallQuantities, recipeWallFixture } from './helpers/wallQuantityFixture.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);

afterEach(() => {
  setBodyTestHooksForTesting(null);
  vi.restoreAllMocks();
});

describe('Wall quantity eligibility', () => {
  it.each(['PARAMETRIC', 'AUTHORITATIVE'] as const)(
    'measures an overlapping %s replacement and omits unsupported recipe quantities',
    async (authority) => {
      const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      {
        const fixture = bodyExchangeFixture('WALL', authority, 'overlapping');
        using model = fixture.model;
        const wall = model.getElement(fixture.localId);
        if (wall?.category !== 'WALL') throw new Error('Missing Wall');
        let measurements = 0;
        setBodyTestHooksForTesting({
          before: ({ step }) => {
            if (step === 'measure') measurements++;
          },
        });
        const live = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
        const exported = unwrap(await toIfcValidated(model, IFC_BODY_META));
        using reader = unwrap(await SpfReader.create(exported.bytes));
        const body = emittedBody(reader, wall.guid);
        expect(body.items).toHaveLength(2);
        const quantities = readPsets(reader, body.expressId).find(
          ({ name }) => name === 'Qto_WallBaseQuantities'
        );
        expectWallQuantities(quantities, {
          Length: 2,
          Width: 0.1,
          Height: 0.5,
          NetVolume: 0.075,
        });
        expect.soft(measurements).toBe(1);
        expect(
          exported.report.issues.filter(({ code }) => code === 'WALL_QUANTITY_OMITTED')
        ).toEqual([]);
        expect(exported.report.issues.filter(({ severity }) => severity === 'error')).toEqual([]);
        fixture.solids.forEach((solid) =>
          expect(getKernel().volume(solid.wrapped)).toBeCloseTo(50_000_000, 2)
        );
        if (live !== null) expect(nativeShapeCount()).toBe(live);
        recordIfcBodyFixture(`quantity-${authority.toLowerCase()}-overlapping`, exported.bytes, {
          guid: wall.guid,
          quantities,
          materialVolumeMm3: 75_000_000,
        });
      }
      if (before !== null) expect(nativeShapeCount()).toBe(before);
    }
  );

  it.each([false, true])(
    'preserves supported recipe quantities with opening=%s and measures NetVolume once',
    async (opening) => {
      const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      {
        const fixture = recipeWallFixture();
        using model = fixture.model;
        if (opening) fixture.addDoorAndCutWall();
        const wall = model.getElement(fixture.localId);
        if (wall?.category !== 'WALL') throw new Error('Missing Wall');
        let measurements = 0;
        setBodyTestHooksForTesting({
          before: ({ step }) => {
            if (step === 'measure') measurements++;
          },
        });
        const exported = unwrap(await toIfcValidated(model, IFC_BODY_META));
        using reader = unwrap(await SpfReader.create(exported.bytes));
        const body = emittedBody(reader, wall.guid);
        const quantities = readPsets(reader, body.expressId).find(
          ({ name }) => name === 'Qto_WallBaseQuantities'
        );
        expectWallQuantities(quantities, {
          Length: 2,
          Width: 0.1,
          Height: 0.5,
          GrossFootprintArea: 0.2,
          NetFootprintArea: opening ? 0.18 : 0.2,
          GrossSideArea: 1,
          NetSideArea: opening ? 0.94 : 1,
          GrossVolume: 0.1,
          NetVolume: opening ? 0.094 : 0.1,
          GrossWeight: opening ? 225.6 : 240,
        });
        expect(measurements).toBe(1);
        expect(
          exported.report.issues.filter(
            ({ code, severity }) => code === 'WALL_QUANTITY_OMITTED' || severity === 'error'
          )
        ).toEqual([]);
        recordIfcBodyFixture(`quantity-recipe-${opening ? 'opening' : 'default'}`, exported.bytes, {
          guid: wall.guid,
          quantities,
          materialVolumeMm3: opening ? 94_000_000 : 100_000_000,
        });
      }
      if (before !== null) expect(nativeShapeCount()).toBe(before);
    }
  );

  it.each([1500, 2000])(
    'does not restore recipe eligibility after a %s mm singleton replacement and rejects a recipe cut',
    async (length) => {
      const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      {
        const fixture = recipeWallFixture();
        using model = fixture.model;
        const replacement = box(length, 100, 500);
        unwrap(
          model.replaceBody({
            localId: fixture.localId,
            body: { kind: 'PARAMETRIC', solids: [replacement] },
          })
        );
        const prior = model.getElement(fixture.localId);
        const relations = model.getAllRelationships();
        using filler = box(100, 100, 100);
        expect(
          model.addDoorAndCutWall(
            {
              wallLocalId: fixture.localId,
              width: 200,
              height: 300,
              offsetAlongWall: 200,
              offsetFromFloor: 0,
              materialName: 'Wood',
            },
            { solids: [filler] }
          )
        ).toMatchObject({ ok: false, error: { code: 'BODY_OPENING_REQUIRES_RECIPE' } });
        expect(model.getElement(fixture.localId)).toBe(prior);
        expect(model.getAllRelationships()).toEqual(relations);
        expect(filler.disposed).toBe(false);
        const wall = model.getElement(fixture.localId);
        if (wall?.category !== 'WALL') throw new Error('Missing Wall');
        const exported = unwrap(await toIfcValidated(model, IFC_BODY_META));
        using reader = unwrap(await SpfReader.create(exported.bytes));
        const body = emittedBody(reader, wall.guid);
        const quantities = readPsets(reader, body.expressId).find(
          ({ name }) => name === 'Qto_WallBaseQuantities'
        );
        // Length/Width/Height remain nominal class facts. Only NetVolume follows
        // the replacement Body; stale nominal dimensions cannot restore gross quantities.
        expectWallQuantities(quantities, {
          Length: 2,
          Width: 0.1,
          Height: 0.5,
          NetVolume: length === 1500 ? 0.075 : 0.1,
        });
        expect(
          exported.report.issues.filter(
            ({ code, severity }) => code === 'WALL_QUANTITY_OMITTED' || severity === 'error'
          )
        ).toEqual([]);
        recordIfcBodyFixture(`quantity-replacement-${length}-rejected-opening`, exported.bytes, {
          guid: wall.guid,
          quantities,
          materialVolumeMm3: length === 1500 ? 75_000_000 : 100_000_000,
        });
      }
      if (before !== null) expect(nativeShapeCount()).toBe(before);
    }
  );
});
