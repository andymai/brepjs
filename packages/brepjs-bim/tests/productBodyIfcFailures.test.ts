import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { IfcAPI } from 'web-ifc';
import { getKernel, unwrap, type ValidSolid } from 'brepjs';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { fromIfc, setFromIfcTestHooksForTesting } from '../src/import/fromIfc.js';
import { SpfReader } from '../src/import/spfReader.js';
import { disposeImportedModel } from '../src/import/importedModel.js';
import { setGeometryReadTestHooksForTesting } from '../src/import/geometryRead.js';
import { setProductBodyItemPreparerForTesting } from '../src/serialize/productBodyPreflight.js';
import { prepareTessellation } from '../src/ifc-writer/tessellationWriter.js';
import { setIfcWriterTestHooksForTesting } from '../src/ifc-writer/ifcWriter.js';
import { setProductBodyTestHooksForTesting } from '../src/productBodyTestHooks.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import { IFC_BODY_META, bodyExchangeFixture } from './helpers/ifcBodyFixture.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);
afterEach(() => {
  setProductBodyItemPreparerForTesting(null);
  setIfcWriterTestHooksForTesting(null);
  setGeometryReadTestHooksForTesting(null);
  setFromIfcTestHooksForTesting(null);
  setProductBodyTestHooksForTesting(null);
  vi.restoreAllMocks();
});

function arena(): number | null {
  return currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
}
function expectArena(expected: number | null): void {
  if (expected !== null) expect(nativeShapeCount()).toBe(expected);
}
function expectLive(solids: readonly ValidSolid[]): void {
  solids.forEach((solid) => expect(getKernel().volume(solid.wrapped)).toBeCloseTo(50_000_000, 2));
}

function isDeletable(value: unknown): value is { delete(): void } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'delete' in value &&
    typeof value.delete === 'function'
  );
}

function isReadableVector(value: unknown): value is { get(index: number): unknown } {
  return (
    typeof value === 'object' && value !== null && 'get' in value && typeof value.get === 'function'
  );
}

function trackIfcVectors(fail?: 'all-lines' | 'type-lines') {
  const releases: ReturnType<typeof vi.fn>[] = [];
  const track = (vector: unknown, label: string) => {
    if (!isDeletable(vector)) throw new Error('Expected an actual web-ifc native vector');
    releases.push(vi.spyOn(vector, 'delete').mockName(label));
    if (
      ((fail === 'all-lines' && label === 'GetAllLines') ||
        (fail === 'type-lines' && label.startsWith('GetLineIDsWithType'))) &&
      isReadableVector(vector)
    ) {
      vi.spyOn(vector, 'get').mockImplementationOnce(() => {
        throw new Error('native vector read failure');
      });
    }
  };
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Invoked below with the real IfcAPI receiver.
  const allLines = IfcAPI.prototype.GetAllLines;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Invoked below with the real IfcAPI receiver.
  const typedLines = IfcAPI.prototype.GetLineIDsWithType;
  vi.spyOn(IfcAPI.prototype, 'GetAllLines').mockImplementation(function (this: IfcAPI, ...args) {
    const vector = allLines.call(this, ...args);
    track(vector, 'GetAllLines');
    return vector;
  });
  vi.spyOn(IfcAPI.prototype, 'GetLineIDsWithType').mockImplementation(function (
    this: IfcAPI,
    ...args
  ) {
    const vector = typedLines.call(this, ...args);
    track(vector, `GetLineIDsWithType ${String(args[1])}`);
    return vector;
  });
  return releases;
}

describe('retained Body export failures', () => {
  for (const category of ['WALL', 'RAILING'] as const) {
    for (const authority of ['PARAMETRIC', 'AUTHORITATIVE'] as const) {
      it.each(['error', 'throw'] as const)(
        `${category} ${authority} reports a later preflight %s and closes the writer`,
        async (failure) => {
          const before = arena();
          {
            const fixture = bodyExchangeFixture(category, authority, 'overlapping');
            using model = fixture.model;
            const liveInputs = arena();
            const releases = fixture.solids.map((solid) => vi.spyOn(solid, Symbol.dispose));
            const close = vi.spyOn(IfcAPI.prototype, 'CloseModel');
            const save = vi.spyOn(IfcAPI.prototype, 'SaveModel');
            const cause = new Error('later item could not mesh');
            setProductBodyItemPreparerForTesting((solid) => {
              if (solid === fixture.solids[1]) {
                if (failure === 'throw') throw cause;
                return { ok: false, reason: cause.message, cause };
              }
              return prepareTessellation(solid);
            });
            const result = await toIfc(model, IFC_BODY_META);
            expect(result.ok).toBe(false);
            if (result.ok) throw new Error('Unexpected successful IFC artifact');
            expect(result.error.code).toBe('BODY_TESSELLATION_FAILED');
            expect(result.error.metadata).toMatchObject({ localId: fixture.localId, itemIndex: 1 });
            expect(result.error.cause).toBe(cause);
            expect(close).toHaveBeenCalledTimes(1);
            expect(save).not.toHaveBeenCalled();
            releases.forEach((release) => expect(release).not.toHaveBeenCalled());
            expectLive(fixture.solids);
            expectArena(liveInputs);
          }
          expectArena(before);
        }
      );
    }
  }

  it.each(['write', 'save'] as const)(
    'closes native IFC resources once after %s failure without consuming sources',
    async (failure) => {
      const before = arena();
      {
        const fixture = bodyExchangeFixture('WALL', 'AUTHORITATIVE', 'overlapping');
        using model = fixture.model;
        const liveInputs = arena();
        const releases = fixture.solids.map((solid) => vi.spyOn(solid, Symbol.dispose));
        const close = vi.spyOn(IfcAPI.prototype, 'CloseModel');
        const cause = new Error(`injected IFC ${failure} failure`);
        if (failure === 'write') {
          let lines = 0;
          setIfcWriterTestHooksForTesting({
            afterWriteLine: () => {
              if (++lines === 5) throw cause;
            },
          });
          await expect(toIfc(model, IFC_BODY_META)).rejects.toBe(cause);
        } else {
          vi.spyOn(IfcAPI.prototype, 'SaveModel').mockImplementationOnce(() => {
            throw cause;
          });
          const result = await toIfc(model, IFC_BODY_META);
          expect(result.ok).toBe(false);
          if (result.ok) throw new Error('Unexpected successful IFC artifact');
          expect(result.error.code).toBe('IFC_SAVE_FAILED');
          expect(result.error.cause).toBe(cause);
        }
        expect(close).toHaveBeenCalledTimes(1);
        releases.forEach((release) => expect(release).not.toHaveBeenCalled());
        expectLive(fixture.solids);
        expectArena(liveInputs);
      }
      expectArena(before);
    }
  );
});

describe('retained Body import failures', () => {
  for (const stage of ['element', 'fatal'] as const) {
    it.each(['before', 'after'] as const)(
      `attempts all ${stage} cleanup once when a release fails %s native disposal`,
      async (point) => {
        const before = arena();
        let recover: (() => void) | undefined;
        const outstanding = point === 'before' ? 1 : 0;
        try {
          {
            const fixture = bodyExchangeFixture('WALL', 'PARAMETRIC', 'overlapping');
            using model = fixture.model;
            const bytes = unwrap(await toIfc(model, IFC_BODY_META));
            const liveInputs = arena();
            const primaryCause = new Error('import read failed');
            const cleanupCause = new Error('reconstructed item release failed');
            const releases: ReturnType<typeof vi.fn>[] = [];
            setGeometryReadTestHooksForTesting({
              afterItemSolid: (_id, solid) => {
                const dispose = solid[Symbol.dispose].bind(solid);
                const release = vi.spyOn(solid, Symbol.dispose);
                releases.push(release);
                if (releases.length === 1) {
                  if (point === 'before') recover = dispose;
                  release.mockImplementation(() => {
                    if (point === 'after') dispose();
                    throw cleanupCause;
                  });
                }
              },
            });
            setFromIfcTestHooksForTesting({
              afterGeometry: () => {
                if (stage === 'element') throw primaryCause;
              },
              afterElement: () => {
                if (stage === 'fatal') throw primaryCause;
              },
            });
            const result = await fromIfc(bytes);
            const report = {
              cleanup: { kind: 'FAILED', diagnostics: [{ itemIndex: 0, cause: cleanupCause }] },
            };
            if (stage === 'fatal') {
              expect(result.ok).toBe(false);
              if (result.ok) {
                disposeImportedModel(result.value);
                throw new Error('Unexpected import success');
              }
              expect(result.error.cause).toBe(primaryCause);
              expect(result.error.metadata).toMatchObject(report);
            } else {
              const imported = unwrap(result);
              try {
                expect(imported.elements).toHaveLength(0);
                const failure = imported.diagnostics.issues.find(
                  ({ code }) => code === 'ELEMENT_READ_FAILED'
                );
                expect(failure?.context?.['cause']).toMatchObject({
                  cause: primaryCause,
                  metadata: report,
                });
              } finally {
                disposeImportedModel(imported);
              }
            }
            expect(releases).toHaveLength(2);
            releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
            expectLive(fixture.solids);
            expectArena(liveInputs === null ? null : liveInputs + outstanding);
          }
          expectArena(before === null ? null : before + outstanding);
        } finally {
          recover?.();
        }
        expectArena(before);
      }
    );
  }

  for (const primaryFailure of [false, true]) {
    it.each(['before', 'after'] as const)(
      `releases reconstructed owners when reader close fails %s native release, primary failure=${String(primaryFailure)}`,
      async (point) => {
        const before = arena();
        let recoverForeign: (() => void) | undefined;
        try {
          {
            const fixture = bodyExchangeFixture('RAILING', 'PARAMETRIC', 'overlapping');
            using model = fixture.model;
            const bytes = unwrap(await toIfc(model, IFC_BODY_META));
            const liveInputs = arena();
            const releases: ReturnType<typeof vi.fn>[] = [];
            setGeometryReadTestHooksForTesting({
              afterItemSolid: (_id, solid) => {
                releases.push(vi.spyOn(solid, Symbol.dispose));
              },
            });
            const primaryCause = new Error('model read failed');
            if (primaryFailure)
              setFromIfcTestHooksForTesting({
                afterElement: () => {
                  throw primaryCause;
                },
              });
            const cleanupCause = new Error('reader close failed');
            // eslint-disable-next-line @typescript-eslint/unbound-method -- Called with the captured real IfcAPI receiver.
            const close = IfcAPI.prototype.CloseModel;
            let isOpen: (() => boolean) | undefined;
            const closeAttempt = vi
              .spyOn(IfcAPI.prototype, 'CloseModel')
              .mockImplementationOnce(function (this: IfcAPI, id) {
                isOpen = () => this.IsModelOpen(id);
                if (point === 'after') close.call(this, id);
                else recoverForeign = () => close.call(this, id);
                throw cleanupCause;
              });
            const result = await fromIfc(bytes);
            expect(result.ok).toBe(false);
            if (result.ok) {
              disposeImportedModel(result.value);
              throw new Error('Unexpected import success');
            }
            expect(result.error.code).toBe(
              primaryFailure ? 'IMPORT_FAILED' : 'IMPORT_CLOSE_FAILED'
            );
            expect(result.error.cause).toBe(primaryFailure ? primaryCause : cleanupCause);
            if (primaryFailure)
              expect(result.error.metadata?.['readerCloseCause']).toBe(cleanupCause);
            expect(closeAttempt).toHaveBeenCalledTimes(1);
            expect(releases).toHaveLength(2);
            releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
            expect(isOpen?.()).toBe(point === 'before');
            expectLive(fixture.solids);
            expectArena(liveInputs);
          }
          expectArena(before);
        } finally {
          recoverForeign?.();
        }
      }
    );
  }

  it.each(['all-lines', 'type-lines'] as const)(
    'releases the reader-owned %s vector even when iteration throws',
    async (failure) => {
      const before = arena();
      {
        const fixture = bodyExchangeFixture('RAILING', 'PARAMETRIC', 'overlapping');
        using model = fixture.model;
        const bytes = unwrap(await toIfc(model, IFC_BODY_META));
        const liveInputs = arena();
        const close = vi.spyOn(IfcAPI.prototype, 'CloseModel');
        const releases = trackIfcVectors(failure);
        if (failure === 'all-lines') {
          using reader = unwrap(await SpfReader.create(bytes));
          expect(() => reader.getAllLines()).toThrow('native vector read failure');
        } else {
          const result = await fromIfc(bytes);
          expect(result.ok).toBe(false);
          if (result.ok) {
            disposeImportedModel(result.value);
            throw new Error('Unexpected import success');
          }
          expect(result.error.code).toBe('IMPORT_FAILED');
        }
        expect(close).toHaveBeenCalledTimes(1);
        expect(releases.length).toBeGreaterThan(0);
        releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
        expectLive(fixture.solids);
        expectArena(liveInputs);
      }
      expectArena(before);
    }
  );

  it.each([false, true])(
    'releases each GUID root vector once, including after a line-read failure=%s',
    async (failRead) => {
      const before = arena();
      {
        const fixture = bodyExchangeFixture('WALL', 'PARAMETRIC', 'singleton');
        using model = fixture.model;
        const product = model.getElement(fixture.localId);
        if (!product) throw new Error('Missing GUID lookup fixture');
        const bytes = unwrap(await toIfc(model, IFC_BODY_META));
        const close = vi.spyOn(IfcAPI.prototype, 'CloseModel');
        const releases = trackIfcVectors();
        {
          using reader = unwrap(await SpfReader.create(bytes));
          if (failRead) {
            vi.spyOn(reader, 'getLine').mockImplementationOnce(() => {
              throw new Error('GUID root line read failed');
            });
            expect(() => reader.expressIdFromGuid(product.guid)).toThrow(
              'GUID root line read failed'
            );
            expect(releases).toHaveLength(1);
            releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
          }
          for (let repeat = 0; repeat < 3; repeat++) {
            const id = reader.expressIdFromGuid(product.guid);
            if (id === undefined) throw new Error('Missing indexed GUID');
            expect(reader.guidFromExpressId(id)).toBe(product.guid);
          }
        }
        expect(releases).toHaveLength(failRead ? 2 : 1);
        releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
        expect(close).toHaveBeenCalledTimes(1);
      }
      expectArena(before);
    }
  );

  it.each(['later-item', 'element', 'fatal'] as const)(
    'releases native items and closes the reader after %s failure',
    async (failure) => {
      const before = arena();
      {
        const fixture = bodyExchangeFixture('WALL', 'PARAMETRIC', 'overlapping');
        using model = fixture.model;
        const bytes = unwrap(await toIfc(model, IFC_BODY_META));
        const liveInputs = arena();
        const close = vi.spyOn(IfcAPI.prototype, 'CloseModel');
        const releases: ReturnType<typeof vi.fn>[] = [];
        const foreignReleases = trackIfcVectors();
        setGeometryReadTestHooksForTesting({
          afterItemSolid: (_id, solid) => {
            releases.push(vi.spyOn(solid, Symbol.dispose));
            if (failure === 'later-item' && releases.length === 2)
              throw new Error('later item failed');
          },
        });
        setFromIfcTestHooksForTesting({
          afterGeometry: () => {
            if (failure === 'element') throw new Error('metadata failed');
          },
          afterElement: () => {
            if (failure === 'fatal') throw new Error('model read failed');
          },
        });
        const result = await fromIfc(bytes);
        expect(close).toHaveBeenCalledTimes(1);
        expect(foreignReleases.length).toBeGreaterThan(0);
        foreignReleases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
        expect(releases).toHaveLength(2);
        if (failure === 'fatal') {
          expect(result.ok).toBe(false);
          if (result.ok) {
            disposeImportedModel(result.value);
            throw new Error('Unexpected model');
          }
          expect(result.error.code).toBe('IMPORT_FAILED');
        } else {
          const imported = unwrap(result);
          try {
            if (failure === 'element') {
              expect(imported.elements).toHaveLength(0);
              expect(imported.diagnostics.issues.map(({ code }) => code)).toContain(
                'ELEMENT_READ_FAILED'
              );
              expectArena(liveInputs);
            } else {
              const product = imported.elements[0];
              if (product === undefined) throw new Error('Missing partial product');
              expect(product.geometry.completeness).toBe('PARTIAL');
              expect(product.geometry.solids).toHaveLength(1);
              expect(product.geometry.bounds).toBeNull();
              expect(product.geometry.volumeMm3).toBeNull();
              expect(product.geometry.solid).toBeNull();
              expectLive(product.geometry.solids);
              expect(releases[0]).not.toHaveBeenCalled();
              expect(releases[1]).toHaveBeenCalledTimes(1);
              expectArena(liveInputs === null ? null : liveInputs + 1);
            }
          } finally {
            disposeImportedModel(imported);
          }
        }
        releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
        expectLive(fixture.solids);
        expectArena(liveInputs);
      }
      expectArena(before);
    }
  );

  it.each(['bounds', 'union', 'measure'] as const)(
    'keeps complete imported siblings live when shared %s fails',
    async (failure) => {
      const before = arena();
      {
        const fixture = bodyExchangeFixture('RAILING', 'AUTHORITATIVE', 'overlapping');
        using model = fixture.model;
        const bytes = unwrap(await toIfc(model, IFC_BODY_META));
        const liveInputs = arena();
        const close = vi.spyOn(IfcAPI.prototype, 'CloseModel');
        const releases: ReturnType<typeof vi.fn>[] = [];
        const temporaryReleases: ReturnType<typeof vi.fn>[] = [];
        setGeometryReadTestHooksForTesting({
          afterItemSolid: (_id, solid) => {
            releases.push(vi.spyOn(solid, Symbol.dispose));
          },
        });
        const cause = new Error(`${failure} unavailable`);
        setProductBodyTestHooksForTesting({
          before: ({ step, itemIndex }) => {
            if (step === failure && (failure !== 'bounds' || itemIndex === 1)) throw cause;
          },
          afterAllocate: ({ solid }) => {
            temporaryReleases.push(vi.spyOn(solid, Symbol.dispose));
          },
        });
        const imported = unwrap(await fromIfc(bytes));
        try {
          expect(close).toHaveBeenCalledTimes(1);
          const product = imported.elements[0];
          if (product === undefined) throw new Error('Missing complete product');
          expect(product.geometry.completeness).toBe('COMPLETE');
          expect(product.geometry.solids).toHaveLength(2);
          expect(product.geometry.bounds).toBeNull();
          expect(product.geometry.volumeMm3).toBeNull();
          expect(imported.diagnostics.issues).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code: 'BODY_AGGREGATE_MEASUREMENT_FAILED',
                severity: 'warning',
                entity: product.expressId,
              }),
            ])
          );
          expectLive(product.geometry.solids);
          releases.forEach((release) => expect(release).not.toHaveBeenCalled());
          expect(temporaryReleases).toHaveLength(failure === 'measure' ? 1 : 0);
          temporaryReleases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
          expectArena(liveInputs === null ? null : liveInputs + 2);
        } finally {
          disposeImportedModel(imported);
        }
        releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
        expectLive(fixture.solids);
        expectArena(liveInputs);
      }
      expectArena(before);
    }
  );
});
