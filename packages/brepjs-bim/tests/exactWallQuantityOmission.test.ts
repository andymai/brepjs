import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as WebIFC from 'web-ifc';
import { err, getKernel, ok, unwrap } from 'brepjs';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { toIfcValidated } from '../src/serialize/toIfc.js';
import { SpfReader } from '../src/import/spfReader.js';
import { readPsets } from '../src/import/dataRead.js';
import { setProductBodyTestHooksForTesting } from '../src/productBodyTestHooks.js';
import { measureProductBodyMaterial } from '../src/types/productBody.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import {
  bodyExchangeFixture,
  emittedBody,
  IFC_BODY_META,
  recordIfcBodyFixture,
} from './helpers/ifcBodyFixture.js';
import { recipeWallFixture } from './helpers/wallQuantityFixture.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);

afterEach(() => {
  setProductBodyTestHooksForTesting(null);
  vi.restoreAllMocks();
});

describe('Wall quantity omission', () => {
  it('exports the retained Body and reports an omission from the same failed measurement', async () => {
    const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    {
      const fixture = bodyExchangeFixture('WALL', 'AUTHORITATIVE', 'singleton');
      using model = fixture.model;
      const wall = model.getElement(fixture.localId);
      if (wall?.category !== 'WALL') throw new Error('Missing Wall');
      const releases = fixture.solids.map((solid) => vi.spyOn(solid, Symbol.dispose));
      const liveInputs = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      const cause = {
        kind: 'COMPUTATION',
        code: 'NATIVE_VOLUME_ERROR',
        message: 'injected quantity measurement failure',
      } as const;
      let measurements = 0;
      setProductBodyTestHooksForTesting({
        measure: () => {
          measurements++;
          return err(cause);
        },
      });

      const exported = unwrap(await toIfcValidated(model, IFC_BODY_META));
      using reader = unwrap(await SpfReader.create(exported.bytes));
      const body = emittedBody(reader, wall.guid);
      expect(body.items).toHaveLength(1);
      expect(body.items[0]?.type).toBe(WebIFC.IFCTRIANGULATEDFACESET);
      expect.soft(readPsets(reader, body.expressId).filter((pset) => pset.isQuantity)).toEqual([]);
      const omissions = exported.report.issues.filter(
        ({ code }) => code === 'WALL_QUANTITY_OMITTED'
      );
      expect.soft(omissions).toMatchObject([
        {
          severity: 'warning',
          entity: wall.localId,
          context: {
            guid: wall.guid,
            cause: {
              code: 'IFC_WALL_QUANTITY_DERIVATION_FAILED',
              cause: { code: 'BODY_MEASUREMENT_FAILED' },
            },
          },
        },
      ]);
      expect.soft(measurements).toBe(1);
      expect(exported.report.issues.filter(({ severity }) => severity === 'error')).toEqual([]);
      releases.forEach((release) => expect(release).not.toHaveBeenCalled());
      fixture.solids.forEach((solid) =>
        expect(getKernel().volume(solid.wrapped)).toBeCloseTo(50_000_000, 2)
      );
      if (liveInputs !== null) expect(nativeShapeCount()).toBe(liveInputs);
    }
    if (before !== null) expect(nativeShapeCount()).toBe(before);
  });

  for (const authority of ['recipe', 'PARAMETRIC', 'AUTHORITATIVE'] as const) {
    it.each([
      { failure: 'Result error', code: 'BODY_MEASUREMENT_FAILED' },
      { failure: 'throw', code: 'BODY_OPERATION_FAILED' },
      { failure: 'NaN', code: 'BODY_INVALID_VOLUME', value: NaN },
      { failure: 'infinity', code: 'BODY_INVALID_VOLUME', value: Infinity },
      { failure: 'negative infinity', code: 'BODY_INVALID_VOLUME', value: -Infinity },
      { failure: 'zero', code: 'BODY_INVALID_VOLUME', value: 0 },
      { failure: 'negative', code: 'BODY_INVALID_VOLUME', value: -1 },
    ])(
      `omits ${authority} quantities for $failure without weakening required measurement`,
      async (failure) => {
        const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
        {
          const fixture =
            authority === 'recipe'
              ? recipeWallFixture()
              : bodyExchangeFixture('WALL', authority, 'singleton');
          using model = fixture.model;
          const wall = model.getElement(fixture.localId);
          if (wall?.category !== 'WALL') throw new Error('Missing Wall');
          const live = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
          const releases = wall.geometry.solids.map((solid) => vi.spyOn(solid, Symbol.dispose));
          const cause = {
            kind: 'COMPUTATION',
            code: 'VOLUME_FAILED',
            message: 'injected shared measurement failure',
          } as const;
          const thrown = new Error('injected shared measurement throw');
          let measurements = 0;
          setProductBodyTestHooksForTesting({
            measure: () => {
              measurements++;
              if (failure.failure === 'Result error') return err(cause);
              if (failure.failure === 'throw') throw thrown;
              if (failure.value === undefined) throw new Error('Missing invalid measurement');
              return ok(failure.value);
            },
          });
          const exported = unwrap(await toIfcValidated(model, IFC_BODY_META));
          using reader = unwrap(await SpfReader.create(exported.bytes));
          const body = emittedBody(reader, wall.guid);
          expect(body.items).toHaveLength(1);
          expect(readPsets(reader, body.expressId).filter(({ isQuantity }) => isQuantity)).toEqual(
            []
          );
          const omissions = exported.report.issues.filter(
            ({ code }) => code === 'WALL_QUANTITY_OMITTED'
          );
          expect(omissions).toMatchObject([
            {
              severity: 'warning',
              entity: wall.localId,
              context: {
                guid: wall.guid,
                cause: {
                  code: 'IFC_WALL_QUANTITY_DERIVATION_FAILED',
                  cause: { code: failure.code, cleanup: { kind: 'COMPLETE' } },
                },
              },
            },
          ]);
          expect(measurements).toBe(1);
          expect(exported.report.issues.filter(({ severity }) => severity === 'error')).toEqual([]);
          const required = measureProductBodyMaterial(wall.geometry.solids);
          expect(required).toMatchObject({
            ok: false,
            error: { code: failure.code, cleanup: { kind: 'COMPLETE' } },
          });
          if (required.ok) throw new Error('Expected required measurement failure');
          if (failure.failure === 'Result error')
            expect(required.error.cause).toMatchObject({ cause });
          if (failure.failure === 'throw')
            expect(required.error.cause).toMatchObject({ cause: thrown });
          if (failure.value !== undefined)
            expect(required.error.cause).toMatchObject({ cause: failure.value });
          expect(omissions[0]?.context?.['cause']).toMatchObject({ cause: required.error });
          expect(measurements).toBe(2);
          releases.forEach((release) => expect(release).not.toHaveBeenCalled());
          wall.geometry.solids.forEach((solid) =>
            expect(getKernel().volume(solid.wrapped)).toBeCloseTo(
              authority === 'recipe' ? 100_000_000 : 50_000_000,
              2
            )
          );
          if (live !== null) expect(nativeShapeCount()).toBe(live);
          if (failure.failure === 'Result error')
            recordIfcBodyFixture(`quantity-omitted-${authority.toLowerCase()}`, exported.bytes, {
              guid: wall.guid,
              omissions,
            });
        }
        if (before !== null) expect(nativeShapeCount()).toBe(before);
      }
    );
  }
});
