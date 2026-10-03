import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { csg, err, getKernel, type ValidSolid } from 'brepjs';
import { el, family } from 'brepjs-families';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { specError } from '../src/errors/bimError.js';
import { familiesToBim, setFamiliesAdapterTestHooksForTesting } from '../src/familiesAdapter.js';
import { BimModel } from '../src/model/bimModel.js';
import { setProductBodyTestHooksForTesting } from '../src/productBodyTestHooks.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
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
afterEach(() => {
  setFamiliesAdapterTestHooksForTesting(null);
  setProductBodyTestHooksForTesting(null);
  vi.restoreAllMocks();
});

const FAILURE = specError('INJECTED', 'injected ownership failure');
const THROWN = new Error('injected ownership failure');
const Unsupported = family('Unsupported', () => el('Geometry', { node: csg.box(1, 1, 1) }));
type Release = ReturnType<typeof vi.fn>;
type ReleaseFault = 'complete' | 'before-release' | 'after-release';

function arena(): number | null {
  return currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
}

function expectArena(baseline: number | null, outstanding = 0): void {
  if (baseline !== null) expect(nativeShapeCount()).toBe(baseline + outstanding);
}

/** Recovery is solely for controlled pre-release faults, after both native observations. */
function releaseProbe(solid: ValidSolid, fault: ReleaseFault, recoveries: (() => void)[]): Release {
  const dispose = solid[Symbol.dispose].bind(solid);
  const release = vi.spyOn(solid, Symbol.dispose);
  if (fault !== 'complete') {
    release.mockImplementation(() => {
      if (fault === 'after-release') dispose();
      throw new Error(`injected ${fault}`);
    });
    if (fault === 'before-release') recoveries.push(dispose);
  }
  return release;
}

describe('Families Body preparation ownership', () => {
  it('rejects invalid copied geometry without releasing borrowed sources', () => {
    const baseline = arena();
    {
      using evaluator = new csg.Evaluator();
      const root = bodyTree(civilBody(disconnectedBody()));
      const source = borrowedSources(evaluator, root);
      const inputs = arena();
      const copies: Release[] = [];
      setProductBodyTestHooksForTesting({
        afterAllocate: ({ step, itemIndex, solid }) => {
          if (step !== 'copy') return;
          copies.push(vi.spyOn(solid, Symbol.dispose));
          if (itemIndex === 1) vi.spyOn(getKernel(), 'isValid').mockReturnValue(false);
        },
      });
      expect(
        familiesToBim(root, { project: BODY_PROJECT, bodyEvaluator: evaluator })
      ).toMatchObject({
        ok: false,
        error: {
          code: 'FAMILIES_PRODUCT_BODY_LOCALIZE_FAILED',
          metadata: { itemIndex: 0 },
          cause: { code: 'BODY_INVALID_ITEM' },
        },
      });
      expect(copies).toHaveLength(2);
      copies.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
      source.releases.forEach((release) => expect(release).not.toHaveBeenCalled());
      source.solids.forEach((solid) =>
        expect(getKernel().volume(solid.wrapped)).toBeCloseTo(0.4, 8)
      );
      expectArena(inputs);
    }
    expectArena(baseline);
  });

  for (const step of ['copy', 'transform'] as const) {
    for (const mode of ['error', 'throw'] as const) {
      it.each(['complete', 'before-release', 'after-release'] as const)(
        `cleans ${step} after later allocation ${mode} with %s cleanup`,
        (fault) => {
          const baseline = arena();
          const recoveries: (() => void)[] = [];
          const copied: Release[] = [];
          const localized: Release[] = [];
          const outstanding = fault === 'before-release' ? 1 : 0;
          try {
            {
              using evaluator = new csg.Evaluator();
              const root = bodyTree(civilBody(disconnectedBody()));
              const source = borrowedSources(evaluator, root);
              const inputs = arena();
              setProductBodyTestHooksForTesting({
                afterAllocate: (event) => {
                  const releases = event.step === 'copy' ? copied : localized;
                  releases.push(
                    releaseProbe(
                      event.solid,
                      event.step === step && event.itemIndex === 0 ? fault : 'complete',
                      recoveries
                    )
                  );
                  if (event.step === step && event.itemIndex === 1) {
                    if (mode === 'throw') throw THROWN;
                    return err(FAILURE);
                  }
                },
              });
              const result = familiesToBim(root, {
                project: BODY_PROJECT,
                bodyEvaluator: evaluator,
              });
              expect(result).toMatchObject({
                ok: false,
                error: {
                  code:
                    step === 'copy'
                      ? 'FAMILIES_PRODUCT_BODY_COPY_FAILED'
                      : 'FAMILIES_PRODUCT_BODY_LOCALIZE_FAILED',
                  metadata: {
                    keyPath: 'level/product',
                    category: 'RAILING',
                    itemIndex: 1,
                    cleanup: { kind: fault === 'complete' ? 'COMPLETE' : 'FAILED' },
                  },
                },
              });
              expect(copied).toHaveLength(2);
              expect(localized).toHaveLength(step === 'copy' ? 0 : 2);
              [...copied, ...localized].forEach((release) =>
                expect(release).toHaveBeenCalledTimes(1)
              );
              source.releases.forEach((release) => expect(release).not.toHaveBeenCalled());
              source.solids.forEach((solid) =>
                expect(getKernel().volume(solid.wrapped)).toBeCloseTo(0.4, 8)
              );
              expectArena(inputs, outstanding);
            }
            expectArena(baseline, outstanding);
          } finally {
            recoveries.forEach((recover) => recover());
          }
          expectArena(baseline);
        }
      );
    }
  }

  it.each(['before-release', 'after-release'] as const)(
    'cancels localized outputs when temporary cleanup fails %s',
    (fault) => {
      const baseline = arena();
      const recoveries: (() => void)[] = [];
      const copied: Release[] = [];
      const localized: Release[] = [];
      const outstanding = fault === 'before-release' ? 1 : 0;
      try {
        {
          using evaluator = new csg.Evaluator();
          const root = bodyTree(civilBody(disconnectedBody()));
          const source = borrowedSources(evaluator, root);
          const inputs = arena();
          setProductBodyTestHooksForTesting({
            afterAllocate: ({ step, itemIndex, solid }) => {
              (step === 'copy' ? copied : localized).push(
                releaseProbe(
                  solid,
                  step === 'copy' && itemIndex === 0 ? fault : 'complete',
                  recoveries
                )
              );
            },
          });
          expect(
            familiesToBim(root, { project: BODY_PROJECT, bodyEvaluator: evaluator })
          ).toMatchObject({
            ok: false,
            error: {
              code: 'FAMILIES_PRODUCT_BODY_CLEANUP_FAILED',
              metadata: { cleanup: { kind: 'FAILED' } },
            },
          });
          expect(copied).toHaveLength(2);
          expect(localized).toHaveLength(2);
          [...copied, ...localized].forEach((release) => expect(release).toHaveBeenCalledTimes(1));
          source.releases.forEach((release) => expect(release).not.toHaveBeenCalled());
          source.solids.forEach((solid) =>
            expect(getKernel().volume(solid.wrapped)).toBeCloseTo(0.4, 8)
          );
          expectArena(inputs, outstanding);
        }
        expectArena(baseline, outstanding);
      } finally {
        recoveries.forEach((recover) => recover());
      }
      expectArena(baseline);
    }
  );
});

describe('Families Body adoption ownership', () => {
  it.each(['complete', 'before-release', 'after-release'] as const)(
    'releases only adapter-owned candidates after adoption rejection with %s cleanup',
    (fault) => {
      const baseline = arena();
      const recoveries: (() => void)[] = [];
      const candidates: Release[] = [];
      const outstanding = fault === 'before-release' ? 1 : 0;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Invoked below with the explicit model receiver via .call().
      const replace = BimModel.prototype.replaceProductBody;
      vi.spyOn(BimModel.prototype, 'replaceProductBody').mockImplementation(function (
        this: BimModel,
        input
      ) {
        input.body.solids.forEach((solid, index) =>
          candidates.push(releaseProbe(solid, index === 0 ? fault : 'complete', recoveries))
        );
        setProductBodyTestHooksForTesting({
          before: ({ step }) => (step === 'validate' ? err(FAILURE) : undefined),
        });
        return replace.call(this, input);
      });
      try {
        {
          using evaluator = new csg.Evaluator();
          const root = bodyTree(civilBody(disconnectedBody()));
          const source = borrowedSources(evaluator, root);
          const inputs = arena();
          expect(
            familiesToBim(root, { project: BODY_PROJECT, bodyEvaluator: evaluator })
          ).toMatchObject({
            ok: false,
            error: {
              code: 'BODY_VALIDATION_FAILED',
              metadata: {
                keyPath: 'level/product',
                category: 'RAILING',
                cleanup: { kind: fault === 'complete' ? 'COMPLETE' : 'FAILED' },
              },
            },
          });
          expect(candidates).toHaveLength(2);
          candidates.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
          source.releases.forEach((release) => expect(release).not.toHaveBeenCalled());
          source.solids.forEach((solid) =>
            expect(getKernel().volume(solid.wrapped)).toBeCloseTo(0.4, 8)
          );
          expectArena(inputs, outstanding);
        }
        expectArena(baseline, outstanding);
      } finally {
        recoveries.forEach((recover) => recover());
      }
      expectArena(baseline);
    }
  );

  for (const later of ['success', 'error', 'throw'] as const) {
    it.each(['before-release', 'after-release'] as const)(
      `keeps COMMITTED ownership through ${later} with retirement failure %s`,
      (fault) => {
        const baseline = arena();
        const recoveries: (() => void)[] = [];
        const adopted: Release[] = [];
        const retired: Release[] = [];
        const outstanding = fault === 'before-release' ? 1 : 0;
        // eslint-disable-next-line @typescript-eslint/unbound-method -- Invoked below with the explicit model receiver via .call().
        const replace = BimModel.prototype.replaceProductBody;
        vi.spyOn(BimModel.prototype, 'replaceProductBody').mockImplementation(function (
          this: BimModel,
          input
        ) {
          const target = this.getElement(input.localId);
          if (target?.category !== 'RAILING') throw new Error('Missing candidate');
          retired.push(releaseProbe(target.geometry.solids[0], fault, recoveries));
          input.body.solids.forEach((solid) =>
            adopted.push(releaseProbe(solid, 'complete', recoveries))
          );
          const receipt = replace.call(this, input);
          expect(receipt).toMatchObject({
            ok: true,
            value: { kind: 'COMMITTED', cleanup: { kind: 'FAILED' } },
          });
          return receipt;
        });
        if (later === 'throw')
          setFamiliesAdapterTestHooksForTesting({
            afterCivilProductBody: () => {
              throw THROWN;
            },
          });
        try {
          {
            using evaluator = new csg.Evaluator();
            const root = bodyTree(
              civilBody(disconnectedBody()),
              ...(later === 'error' ? [Unsupported({ key: 'later' })] : [])
            );
            const source = borrowedSources(evaluator, root);
            const inputs = arena();
            const result = familiesToBim(root, { project: BODY_PROJECT, bodyEvaluator: evaluator });
            if (later === 'success') {
              if (!result.ok) throw new Error(result.error.message);
              try {
                expect(result.value.model.getGeometryCleanupDiagnostics()).toHaveLength(1);
                adopted.forEach((release) => expect(release).not.toHaveBeenCalled());
              } finally {
                result.value.model[Symbol.dispose]();
              }
            } else {
              expect(result).toMatchObject({
                ok: false,
                error: {
                  code:
                    later === 'error' ? 'FAMILIES_UNSUPPORTED_TYPE' : 'FAMILIES_PROJECTION_FAILED',
                  metadata: {
                    cleanup: {
                      kind: 'FAILED',
                      diagnostics: [expect.objectContaining({ operation: 'replaceProductBody' })],
                    },
                  },
                },
              });
            }
            expect(adopted).toHaveLength(2);
            adopted.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
            retired.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
            source.releases.forEach((release) => expect(release).not.toHaveBeenCalled());
            source.solids.forEach((solid) =>
              expect(getKernel().volume(solid.wrapped)).toBeCloseTo(0.4, 8)
            );
            expectArena(inputs, outstanding);
          }
          expectArena(baseline, outstanding);
        } finally {
          recoveries.forEach((recover) => recover());
        }
        expectArena(baseline);
      }
    );
  }

  it.each(['before-release', 'after-release'] as const)(
    'preserves the primary projection error when model cleanup fails %s',
    (fault) => {
      const baseline = arena();
      const recoveries: (() => void)[] = [];
      const adopted: Release[] = [];
      const outstanding = fault === 'before-release' ? 1 : 0;
      setFamiliesAdapterTestHooksForTesting({
        afterCivilProductBody: (model, id) => {
          const target = model.getElement(id);
          if (target?.category !== 'RAILING') throw new Error('Missing adopted Body');
          target.geometry.solids.forEach((solid, index) =>
            adopted.push(releaseProbe(solid, index === 0 ? fault : 'complete', recoveries))
          );
          throw THROWN;
        },
      });
      try {
        {
          using evaluator = new csg.Evaluator();
          const root = bodyTree(civilBody(disconnectedBody()));
          const source = borrowedSources(evaluator, root);
          const inputs = arena();
          expect(
            familiesToBim(root, { project: BODY_PROJECT, bodyEvaluator: evaluator })
          ).toMatchObject({
            ok: false,
            error: {
              code: 'FAMILIES_PROJECTION_FAILED',
              cause: THROWN,
              metadata: {
                cleanup: {
                  kind: 'FAILED',
                  diagnostics: [expect.objectContaining({ operation: 'disposeModel' })],
                },
              },
            },
          });
          expect(adopted).toHaveLength(2);
          adopted.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
          source.releases.forEach((release) => expect(release).not.toHaveBeenCalled());
          source.solids.forEach((solid) =>
            expect(getKernel().volume(solid.wrapped)).toBeCloseTo(0.4, 8)
          );
          expectArena(inputs, outstanding);
        }
        expectArena(baseline, outstanding);
      } finally {
        recoveries.forEach((recover) => recover());
      }
      expectArena(baseline);
    }
  );
});
