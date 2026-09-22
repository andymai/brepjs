import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { box, DisposalScope, err, getKernel, measureVolume, ok, unwrap } from 'brepjs';
import { measureProductBodyMaterial, productBodyBounds } from '../src/types/productBody.js';
import { geometryError } from '../src/errors/bimError.js';
import { setProductBodyTestHooksForTesting } from '../src/productBodyTestHooks.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import { createOverlapFixture } from './helpers/nativeBodyFixture.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
beforeAll(async () => {
  await initKernel();
}, 30000);
const arena = () => (currentKernel === 'occt-wasm' ? nativeShapeCount() : null);
function expectArena(expected: number | null) {
  if (expected !== null) expect(nativeShapeCount()).toBe(expected);
}
afterEach(() => {
  setProductBodyTestHooksForTesting(null);
  vi.restoreAllMocks();
});
it.each(['overlapping', 'disconnected'] as const)(
  'measures occupied %s material and all-item bounds without consuming inputs',
  (arrangement) => {
    const baseline = arena();
    {
      using scope = new DisposalScope();
      const { a, b } = createOverlapFixture(scope);
      const distant = scope.register(box(1, 1, 1, { at: [3.5, 0.5, 0.5] }));
      const items = [a, arrangement === 'overlapping' ? b : distant] as const;
      const live = arena();
      expect(unwrap(measureProductBodyMaterial(items))).toBeCloseTo(
        arrangement === 'overlapping' ? 1.5 : 2,
        8
      );
      const { bounds } = unwrap(productBodyBounds(items));
      expect(bounds.xMin).toBeCloseTo(0, 6);
      expect(bounds.xMax).toBeCloseTo(arrangement === 'overlapping' ? 1.5 : 4, 6);
      for (const item of items) expect(unwrap(measureVolume(item))).toBeCloseTo(1, 8);
      expectArena(live);
    }
    expectArena(baseline);
  }
);

it('reports a later bounds failure without consuming borrowed items', () => {
  using a = box(1, 1, 1);
  using b = box(1, 1, 1);
  const live = arena();
  const releases = [vi.spyOn(a, Symbol.dispose), vi.spyOn(b, Symbol.dispose)];
  setProductBodyTestHooksForTesting({
    before({ step, itemIndex }) {
      if (step === 'bounds' && itemIndex === 1)
        return err(geometryError('LATER_BOUNDS', 'second item'));
    },
  });
  expect(productBodyBounds([a, b])).toMatchObject({ ok: false, error: { itemIndex: 1 } });
  for (const release of releases) expect(release).not.toHaveBeenCalled();
  expectArena(live);
});

it('rejects empty, duplicate, disposed and invalid borrowed items', () => {
  using a = box(1, 1, 1);
  const disposed = box(1, 1, 1);
  disposed[Symbol.dispose]();
  const live = arena();
  for (const input of [[], [a, a], [a, disposed], [a, {}], [a, null]]) {
    expect(Reflect.apply(measureProductBodyMaterial, undefined, [input])).toMatchObject({
      ok: false,
    });
  }
  expect(unwrap(measureVolume(a))).toBeCloseTo(1, 8);
  expectArena(live);
});
for (const stage of ['union-before', 'union-after', 'measure'] as const) {
  it.each(['error', 'throw'] as const)(
    `cleans temporary union after ${stage} %s without changing borrowed inputs`,
    (failure) => {
      const baseline = arena();
      {
        using scope = new DisposalScope();
        const { a, b } = createOverlapFixture(scope);
        const solids = [a, b] as const;
        const releases = solids.map((solid) => vi.spyOn(solid, Symbol.dispose));
        const temporaryReleases: ReturnType<typeof vi.spyOn>[] = [];
        const fail = () => {
          const cause = geometryError('INJECTED', stage);
          if (failure === 'throw') throw new Error(cause.message, { cause });
          return err(cause);
        };
        setProductBodyTestHooksForTesting({
          before({ step }) {
            if (
              (stage === 'union-before' && step === 'union') ||
              (stage === 'measure' && step === 'measure')
            )
              return fail();
          },
          afterAllocate({ solid }) {
            temporaryReleases.push(vi.spyOn(solid, Symbol.dispose));
            if (stage === 'union-after') return fail();
          },
        });
        const live = arena();
        expect(measureProductBodyMaterial(solids)).toMatchObject({
          ok: false,
          error: { operation: 'measureProductBodyMaterial', cleanup: { kind: 'COMPLETE' } },
        });
        expect(temporaryReleases).toHaveLength(stage === 'union-before' ? 0 : 1);
        temporaryReleases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
        releases.forEach((release) => expect(release).not.toHaveBeenCalled());
        expectArena(live);
        expect(unwrap(measureVolume(a))).toBeCloseTo(1, 8);
      }
      expectArena(baseline);
    }
  );
}

it.each([NaN, Infinity, -1, 0])(
  'rejects invalid material volume %s and retires its temporary union',
  (value) => {
    using scope = new DisposalScope();
    const { a, b } = createOverlapFixture(scope);
    const live = arena();
    setProductBodyTestHooksForTesting({ measure: () => ok(value) });
    expect(measureProductBodyMaterial([a, b])).toMatchObject({
      ok: false,
      error: { code: 'BODY_INVALID_VOLUME' },
    });
    expectArena(live);
  }
);

it('returns a measurement error when the native union throws, with borrowed inputs still live', () => {
  using scope = new DisposalScope();
  const { a, b } = createOverlapFixture(scope);
  const live = arena();
  vi.spyOn(getKernel(), 'fuseAll').mockImplementation(() => {
    throw new Error('native union');
  });
  expect(measureProductBodyMaterial([a, b])).toMatchObject({
    ok: false,
    error: { operation: 'measureProductBodyMaterial' },
  });
  expectArena(live);
  expect(unwrap(measureVolume(a))).toBeCloseTo(1, 8);
  expect(unwrap(measureVolume(b))).toBeCloseTo(1, 8);
});

it('preserves a native measurement Result error and retires its union', () => {
  using scope = new DisposalScope();
  const { a, b } = createOverlapFixture(scope);
  const live = arena();
  const cause = {
    kind: 'COMPUTATION',
    code: 'NATIVE_VOLUME_ERROR',
    message: 'native measurement',
  } as const;
  setProductBodyTestHooksForTesting({ measure: () => err(cause) });
  expect(measureProductBodyMaterial([a, b])).toMatchObject({
    ok: false,
    error: { code: 'BODY_MEASUREMENT_FAILED', cause: { cause }, cleanup: { kind: 'COMPLETE' } },
  });
  expectArena(live);
});

it('uses direct singleton measurement without a union or geometry copy', () => {
  using solid = box(2, 3, 4);
  const union = vi.spyOn(getKernel(), 'fuseAll');
  const copy = vi.spyOn(getKernel(), 'copyShape');
  expect(unwrap(measureProductBodyMaterial([solid]))).toBeCloseTo(24, 8);
  expect(union).not.toHaveBeenCalled();
  expect(copy).not.toHaveBeenCalled();
});

it('reports nonfinite bounds instead of returning an incomplete query', () => {
  using solid = box(1, 1, 1);
  const live = arena();
  setProductBodyTestHooksForTesting({
    bounds: () => ({ xMin: 0, yMin: 0, zMin: 0, xMax: NaN, yMax: 1, zMax: 1 }),
  });
  expect(productBodyBounds([solid])).toMatchObject({
    ok: false,
    error: { code: 'BODY_INVALID_BOUNDS' },
  });
  expectArena(live);
});
