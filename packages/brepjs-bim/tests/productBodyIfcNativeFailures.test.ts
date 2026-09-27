import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { getKernel, unwrap, type ValidSolid } from 'brepjs';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { fromIfc } from '../src/import/fromIfc.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { disposeImportedModel } from '../src/import/importedModel.js';
import { setProductBodyTestHooksForTesting } from '../src/productBodyTestHooks.js';
import { setGeometryReadTestHooksForTesting } from '../src/import/geometryRead.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import { IFC_BODY_META, bodyExchangeFixture } from './helpers/ifcBodyFixture.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);
afterEach(() => {
  setProductBodyTestHooksForTesting(null);
  setGeometryReadTestHooksForTesting(null);
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

it.each(['fuseAll', 'volume'] as const)(
  'retains imported siblings and releases query geometry when native %s throws',
  async (method) => {
    const before = arena();
    {
      const fixture = bodyExchangeFixture('RAILING', 'EXACT', 'overlapping');
      using model = fixture.model;
      const bytes = unwrap(await toIfc(model, IFC_BODY_META));
      const liveInputs = arena();
      const releases: ReturnType<typeof vi.fn>[] = [];
      const temporaryReleases: ReturnType<typeof vi.fn>[] = [];
      setGeometryReadTestHooksForTesting({
        afterItemSolid: (_id, solid) => {
          releases.push(vi.spyOn(solid, Symbol.dispose));
        },
      });
      setProductBodyTestHooksForTesting({
        afterAllocate: ({ solid }) => {
          temporaryReleases.push(vi.spyOn(solid, Symbol.dispose));
        },
      });
      const failedNative = vi.spyOn(getKernel(), method).mockImplementation(() => {
        throw new Error(`native ${method} failure`);
      });
      const imported = unwrap(await fromIfc(bytes));
      failedNative.mockRestore();
      try {
        const product = imported.elements[0];
        if (!product) throw new Error('Missing complete product');
        expect(product.geometry.completeness).toBe('COMPLETE');
        expect(product.geometry.solids).toHaveLength(2);
        expect(product.geometry.volumeMm3).toBeNull();
        expect(product.geometry.bounds).toBeNull();
        expect(imported.diagnostics.issues.map(({ code }) => code)).toContain(
          'BODY_AGGREGATE_MEASUREMENT_FAILED'
        );
        expectLive(product.geometry.solids);
        releases.forEach((release) => expect(release).not.toHaveBeenCalled());
        expect(temporaryReleases).toHaveLength(method === 'volume' ? 1 : 0);
        temporaryReleases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
        expectArena(liveInputs, 2);
      } finally {
        disposeImportedModel(imported);
      }
      expect(releases).toHaveLength(2);
      releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
      expectLive(fixture.solids);
      expectArena(liveInputs);
    }
    expectArena(before);
  }
);

for (const primaryFailure of [false, true]) {
  it.each(['before', 'after'] as const)(
    `reports uncertain temporary release %s native disposal, primary failure=${String(primaryFailure)}`,
    async (releasePoint) => {
      const before = arena();
      let recovery: (() => void) | undefined;
      const outstanding = releasePoint === 'before' ? 1 : 0;
      try {
        {
          const fixture = bodyExchangeFixture('WALL', 'EXACT', 'overlapping');
          using model = fixture.model;
          const bytes = unwrap(await toIfc(model, IFC_BODY_META));
          const liveInputs = arena();
          const sourceReleases = fixture.solids.map((solid) => vi.spyOn(solid, Symbol.dispose));
          const releases: ReturnType<typeof vi.fn>[] = [];
          const temporaryReleases: ReturnType<typeof vi.fn>[] = [];
          const cleanupCause = new Error(`union cleanup ${releasePoint} native release`);
          const primaryCause = new Error('union measurement failed');
          setGeometryReadTestHooksForTesting({
            afterItemSolid: (_id, solid) => {
              releases.push(vi.spyOn(solid, Symbol.dispose));
            },
          });
          setProductBodyTestHooksForTesting({
            before: ({ step }) => {
              if (primaryFailure && step === 'measure') throw primaryCause;
            },
            afterAllocate: ({ solid }) => {
              const release = solid[Symbol.dispose].bind(solid);
              if (releasePoint === 'before') recovery = release;
              temporaryReleases.push(
                vi.spyOn(solid, Symbol.dispose).mockImplementation(() => {
                  if (releasePoint === 'after') release();
                  throw cleanupCause;
                })
              );
            },
          });
          const imported = unwrap(await fromIfc(bytes));
          try {
            const product = imported.elements[0];
            if (!product) throw new Error('Missing reconstructed product');
            expect(product.geometry.completeness).toBe('COMPLETE');
            expect(product.geometry.solids).toHaveLength(2);
            expect(product.geometry.volumeMm3).toBeNull();
            expect(product.geometry.bounds).toBeNull();
            const diagnostic = imported.diagnostics.issues.find(
              ({ code }) => code === 'BODY_AGGREGATE_MEASUREMENT_FAILED'
            );
            expect(diagnostic).toMatchObject({
              severity: 'warning',
              entity: product.expressId,
              context: {
                cause: {
                  code: primaryFailure ? 'BODY_OPERATION_FAILED' : 'BODY_CLEANUP_FAILED',
                  cleanup: { kind: 'FAILED', diagnostics: [{ cause: cleanupCause }] },
                },
              },
            });
            if (primaryFailure)
              expect(diagnostic?.context?.['cause']).toMatchObject({
                cause: { cause: primaryCause },
              });
            expect(temporaryReleases).toHaveLength(1);
            temporaryReleases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
            releases.forEach((release) => expect(release).not.toHaveBeenCalled());
            expectLive(product.geometry.solids);
            expectLive(fixture.solids);
            expectArena(liveInputs, 2 + outstanding);
          } finally {
            disposeImportedModel(imported);
          }
          releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
          sourceReleases.forEach((release) => expect(release).not.toHaveBeenCalled());
          temporaryReleases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
          expectLive(fixture.solids);
          expectArena(liveInputs, outstanding);
        }
        // Check the completed model/import scopes before recovering the deliberately retained slot.
        expectArena(before, outstanding);
      } finally {
        // Only this controlled fixture knows that the before-release injection released nothing.
        recovery?.();
      }
      expectArena(before);
    }
  );
}
