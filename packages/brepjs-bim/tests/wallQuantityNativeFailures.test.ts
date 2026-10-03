import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { getKernel, unwrap, type ValidSolid } from 'brepjs';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { readPsets } from '../src/import/dataRead.js';
import { SpfReader } from '../src/import/spfReader.js';
import { setProductBodyTestHooksForTesting } from '../src/productBodyTestHooks.js';
import { copyProductBody } from '../src/types/productBody.js';
import { toIfcValidated } from '../src/serialize/toIfc.js';
import {
  bodyExchangeFixture,
  emittedBody,
  IFC_BODY_META,
  recordIfcBodyFixture,
} from './helpers/ifcBodyFixture.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import { expectWallQuantities } from './helpers/wallQuantityFixture.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);
afterEach(() => {
  setProductBodyTestHooksForTesting(null);
  vi.restoreAllMocks();
});

function arena(): number | null {
  return currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
}
function expectArena(expected: number | null, outstanding = 0): void {
  if (expected !== null) expect(nativeShapeCount()).toBe(expected + outstanding);
}
function expectLive(solids: readonly ValidSolid[]): void {
  solids.forEach((solid) => expect(getKernel().volume(solid.wrapped)).toBeCloseTo(50_000_000, 2));
}

for (const authority of ['PARAMETRIC', 'AUTHORITATIVE'] as const) {
  it.each(['fuseAll', 'volume'] as const)(
    `exports ${authority} retained items after native %s failure`,
    async (method) => {
      const before = arena();
      const sourceReleases: ReturnType<typeof vi.fn>[] = [];
      {
        const fixture = bodyExchangeFixture('WALL', authority, 'overlapping');
        using model = fixture.model;
        const wall = model.getElement(fixture.localId);
        if (wall?.category !== 'WALL') throw new Error('Missing Wall');
        const live = arena();
        sourceReleases.push(...fixture.solids.map((solid) => vi.spyOn(solid, Symbol.dispose)));
        const temporaryReleases: ReturnType<typeof vi.fn>[] = [];
        const cause = new Error(`native ${method} failure`);
        let failures = 0;
        let measurements = 0;
        setProductBodyTestHooksForTesting({
          before: ({ step }) => {
            if (step === 'measure') measurements++;
            if (step === (method === 'fuseAll' ? 'union' : 'measure')) {
              vi.spyOn(getKernel(), method).mockImplementationOnce(() => {
                failures++;
                throw cause;
              });
            }
          },
          afterAllocate: ({ solid }) => {
            temporaryReleases.push(vi.spyOn(solid, Symbol.dispose));
          },
        });
        const exported = unwrap(await toIfcValidated(model, IFC_BODY_META));
        using reader = unwrap(await SpfReader.create(exported.bytes));
        const body = emittedBody(reader, wall.guid);
        expect(body.items).toHaveLength(2);
        expect(readPsets(reader, body.expressId).filter(({ isQuantity }) => isQuantity)).toEqual(
          []
        );
        expect(
          exported.report.issues.filter(({ code }) => code === 'WALL_QUANTITY_OMITTED')
        ).toMatchObject([
          {
            severity: 'warning',
            entity: wall.localId,
            context: {
              guid: wall.guid,
              cause: {
                code: 'IFC_WALL_QUANTITY_DERIVATION_FAILED',
                cause: {
                  code: 'BODY_OPERATION_FAILED',
                  cause: { cause },
                  cleanup: { kind: 'COMPLETE' },
                },
              },
            },
          },
        ]);
        expect(exported.report.issues.filter(({ severity }) => severity === 'error')).toEqual([]);
        expect(failures).toBe(1);
        expect(measurements).toBe(method === 'volume' ? 1 : 0);
        expect(temporaryReleases).toHaveLength(method === 'volume' ? 1 : 0);
        temporaryReleases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
        sourceReleases.forEach((release) => expect(release).not.toHaveBeenCalled());
        expectLive(fixture.solids);
        expectArena(live);
      }
      sourceReleases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
      expectArena(before);
    }
  );
}

for (const primaryFailure of [false, true]) {
  it.each(['before', 'after'] as const)(
    `continues later Wall measurement after uncertain release %s native disposal, primary failure=${String(primaryFailure)}`,
    async (releasePoint) => {
      const before = arena();
      let recovery: (() => void) | undefined;
      const outstanding = releasePoint === 'before' ? 1 : 0;
      const sourceReleases: ReturnType<typeof vi.fn>[] = [];
      const temporaryReleases: ReturnType<typeof vi.fn>[] = [];
      try {
        {
          const fixture = bodyExchangeFixture('WALL', 'PARAMETRIC', 'overlapping');
          using model = fixture.model;
          const wall = model.getElement(fixture.localId);
          if (wall?.category !== 'WALL') throw new Error('Missing Wall');
          const container = model
            .getAllRelationships()
            .find(
              (rel) => rel.kind === 'CONTAINED_IN' && rel.relatedElements.includes(wall.localId)
            );
          if (container?.kind !== 'CONTAINED_IN') throw new Error('Missing containment');
          const laterId = unwrap(model.addWall({ ...wall.spec, origin: [4000, 2000, 3000] }));
          model.placeIn(laterId, container.relatingStructure);
          const copied = unwrap(copyProductBody(wall.geometry));
          unwrap(model.replaceProductBody({ localId: laterId, body: copied }));
          const laterWall = model.getElement(laterId);
          if (laterWall?.category !== 'WALL') throw new Error('Missing later Wall');
          const inputs = [...fixture.solids, ...copied.solids];
          sourceReleases.push(...inputs.map((solid) => vi.spyOn(solid, Symbol.dispose)));
          const live = arena();
          const cleanupCause = new Error(`union cleanup ${releasePoint} native release`);
          const primaryCause = new Error('union measurement failed');
          let allocations = 0;
          let measurements = 0;
          setProductBodyTestHooksForTesting({
            before: ({ step }) => {
              if (step !== 'measure') return;
              measurements++;
              if (primaryFailure && allocations === 1) throw primaryCause;
            },
            afterAllocate: ({ solid }) => {
              allocations++;
              const release = solid[Symbol.dispose].bind(solid);
              if (allocations !== 1) {
                temporaryReleases.push(vi.spyOn(solid, Symbol.dispose));
                return;
              }
              if (releasePoint === 'before') recovery = release;
              temporaryReleases.push(
                vi.spyOn(solid, Symbol.dispose).mockImplementation(() => {
                  if (releasePoint === 'after') release();
                  throw cleanupCause;
                })
              );
            },
          });
          const exported = unwrap(await toIfcValidated(model, IFC_BODY_META));
          using reader = unwrap(await SpfReader.create(exported.bytes));
          const body = emittedBody(reader, wall.guid);
          const laterBody = emittedBody(reader, laterWall.guid);
          expect(body.items).toHaveLength(2);
          expect(laterBody.items).toHaveLength(2);
          expect(readPsets(reader, body.expressId).filter(({ isQuantity }) => isQuantity)).toEqual(
            []
          );
          expectWallQuantities(
            readPsets(reader, laterBody.expressId).find(
              ({ name }) => name === 'Qto_WallBaseQuantities'
            ),
            {
              Length: 2,
              Width: 0.1,
              Height: 0.5,
              NetVolume: 0.075,
            }
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
                  cause: {
                    code: primaryFailure ? 'BODY_OPERATION_FAILED' : 'BODY_CLEANUP_FAILED',
                    cleanup: {
                      kind: 'FAILED',
                      diagnostics: [
                        {
                          operation: 'measureProductBodyMaterial',
                          itemIndex: 0,
                          resourceKind: 'SHAPE',
                          cause: cleanupCause,
                        },
                      ],
                    },
                  },
                },
              },
            },
          ]);
          if (primaryFailure)
            expect(omissions[0]?.context?.['cause']).toMatchObject({
              cause: { cause: { cause: primaryCause } },
            });
          expect(exported.report.issues.filter(({ severity }) => severity === 'error')).toEqual([]);
          expect(measurements).toBe(2);
          expect(temporaryReleases).toHaveLength(2);
          temporaryReleases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
          sourceReleases.forEach((release) => expect(release).not.toHaveBeenCalled());
          expectLive(inputs);
          expectArena(live, outstanding);
          recordIfcBodyFixture(
            `quantity-cleanup-${releasePoint}-${String(primaryFailure)}`,
            exported.bytes,
            {
              guid: wall.guid,
              laterGuid: laterWall.guid,
              omissions,
              outstandingBeforeRecovery: outstanding,
            }
          );
        }
        sourceReleases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
        temporaryReleases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
        // Assert production cleanup before the fixture recovers its known unreleased slot.
        expectArena(before, outstanding);
      } finally {
        recovery?.();
      }
      expectArena(before);
    }
  );
}
