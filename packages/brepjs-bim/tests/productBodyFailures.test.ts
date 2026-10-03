import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  box,
  DisposalScope,
  err,
  getFaces,
  tagFaces,
  getKernel,
  measureVolume,
  ok,
  unwrap,
  type ValidSolid,
} from 'brepjs';
import {
  copyProductBody,
  disposeProductBody,
  measureProductBodyMaterial,
  productBodyBounds,
  transformProductBody,
  validateProductBody,
} from '../src/types/productBody.js';
import { IDENTITY_FRAME } from '../src/placementFrame.js';
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

for (const kind of ['PARAMETRIC', 'AUTHORITATIVE'] as const) {
  describe.each(['copy', 'transform'] as const)(`${kind} %s failure cleanup`, (operation) => {
    for (const phase of ['before', 'after'] as const) {
      it.each(['error', 'throw'] as const)(
        `cleans every partial after a later ${phase}-allocation %s`,
        (failure) => {
          const baseline = arena();
          {
            using scope = new DisposalScope();
            const { a, b } = createOverlapFixture(scope);
            const body = unwrap(validateProductBody({ kind, solids: [a, b] }));
            const releases = body.solids.map((solid) => vi.spyOn(solid, Symbol.dispose));
            const outputs: ReturnType<typeof vi.spyOn>[] = [];
            const primary = geometryError('INJECTED_NATIVE_FAILURE', 'later item');
            const fail = () => {
              if (failure === 'throw') throw new Error(primary.message, { cause: primary });
              return err(primary);
            };
            setProductBodyTestHooksForTesting({
              before(event) {
                if (phase === 'before' && event.step === operation && event.itemIndex === 1)
                  return fail();
              },
              afterAllocate(event) {
                outputs.push(vi.spyOn(event.solid, Symbol.dispose));
                if (phase === 'after' && event.step === operation && event.itemIndex === 1)
                  return fail();
              },
            });
            const live = arena();
            const result =
              operation === 'copy'
                ? copyProductBody(body)
                : transformProductBody(body, IDENTITY_FRAME);
            expect(result).toMatchObject({
              ok: false,
              error: {
                operation: operation === 'copy' ? 'copyProductBody' : 'transformProductBody',
                itemIndex: 1,
                cleanup: { kind: 'COMPLETE' },
              },
            });
            expect(outputs).toHaveLength(phase === 'before' ? 1 : 2);
            for (const release of outputs) expect(release).toHaveBeenCalledTimes(1);
            for (const release of releases) expect(release).not.toHaveBeenCalled();
            expect(body.solids).toEqual([a, b]);
            expect(body.kind).toBe(kind);
            expect(unwrap(measureVolume(a))).toBeCloseTo(1, 8);
            expect(unwrap(measureVolume(b))).toBeCloseTo(1, 8);
            expectArena(live);
          }
          expectArena(baseline);
        }
      );
    }
  });
}

it.each(['error', 'throw'] as const)(
  'reports later validation %s with item context and no ownership transfer',
  (failure) => {
    using scope = new DisposalScope();
    const { a, b } = createOverlapFixture(scope);
    const releases = [vi.spyOn(a, Symbol.dispose), vi.spyOn(b, Symbol.dispose)];
    const live = arena();
    setProductBodyTestHooksForTesting({
      before({ step, itemIndex }) {
        if (step === 'validate' && itemIndex === 1) {
          const error = geometryError('INJECTED_VALIDATION', 'second item');
          if (failure === 'throw') throw new Error(error.message, { cause: error });
          return err(error);
        }
      },
    });
    expect(validateProductBody({ kind: 'PARAMETRIC', solids: [a, b] })).toMatchObject({
      ok: false,
      error: { operation: 'validateProductBody', itemIndex: 1, code: 'BODY_VALIDATION_FAILED' },
    });
    for (const release of releases) expect(release).not.toHaveBeenCalled();
    expectArena(live);
  }
);

it('rejects native non-solids, invalid solids, sparse arrays, and throwing JavaScript item access', () => {
  using a = box(1, 1, 1);
  using b = box(1, 1, 1);
  const face = getFaces(a)[0];
  expect(validateProductBody({ kind: 'AUTHORITATIVE', solids: [a, face] })).toMatchObject({
    ok: false,
    error: { itemIndex: 1, code: 'BODY_INVALID_ITEM' },
  });
  const isValid = getKernel().isValid.bind(getKernel());
  vi.spyOn(getKernel(), 'isValid').mockImplementation((shape) =>
    shape === b.wrapped ? false : isValid(shape)
  );
  expect(validateProductBody({ kind: 'AUTHORITATIVE', solids: [a, b] })).toMatchObject({
    ok: false,
    error: { itemIndex: 1, code: 'BODY_INVALID_ITEM' },
  });
  const sparse = [a].concat(new Array<ValidSolid>(1));
  expect(validateProductBody({ kind: 'AUTHORITATIVE', solids: sparse })).toMatchObject({
    ok: false,
    error: { itemIndex: 1 },
  });
  const items = [a, b];
  Object.defineProperty(items, 1, {
    get() {
      throw new Error('item getter');
    },
  });
  expect(validateProductBody({ kind: 'AUTHORITATIVE', solids: items })).toMatchObject({
    ok: false,
    error: { itemIndex: 1, code: 'BODY_VALIDATION_FAILED' },
  });
  const descriptor = {
    get kind() {
      throw new Error('descriptor getter');
    },
  };
  expect(validateProductBody(descriptor)).toMatchObject({
    ok: false,
    error: { code: 'BODY_VALIDATION_FAILED' },
  });
  expect(a.disposed).toBe(false);
  expect(b.disposed).toBe(false);
});

it.each(['copy', 'transform'] as const)(
  'preserves the primary %s error and every cleanup cause',
  (operation) => {
    const baseline = arena();
    {
      using scope = new DisposalScope();
      const { a, b } = createOverlapFixture(scope);
      const body = unwrap(validateProductBody({ kind: 'AUTHORITATIVE', solids: [a, b] }));
      const primary = geometryError('PRIMARY', 'operation failed');
      const cleanupCauses = [new Error('cleanup 0'), new Error('cleanup 1')];
      const releases: ReturnType<typeof vi.spyOn>[] = [];
      setProductBodyTestHooksForTesting({
        afterAllocate({ solid, itemIndex }) {
          const dispose = solid[Symbol.dispose].bind(solid);
          releases.push(
            vi.spyOn(solid, Symbol.dispose).mockImplementation(() => {
              dispose();
              throw cleanupCauses[itemIndex] ?? new Error('Unexpected output item');
            })
          );
          if (itemIndex === 1) return err(primary);
        },
      });
      const live = arena();
      const result =
        operation === 'copy' ? copyProductBody(body) : transformProductBody(body, IDENTITY_FRAME);
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'PRIMARY', cause: primary, cleanup: { kind: 'FAILED' } },
      });
      if (result.ok || result.error.cleanup.kind !== 'FAILED')
        throw new Error('Expected cleanup failure');
      expect(result.error.cleanup.diagnostics.map((d) => d.cause)).toEqual(cleanupCauses);
      expect(result.error.cleanup.diagnostics.map((d) => d.itemIndex)).toEqual([0, 1]);
      releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
      expectArena(live);
      expect(unwrap(measureVolume(a))).toBeCloseTo(1, 8);
    }
    expectArena(baseline);
  }
);

it.each(['before', 'after'] as const)(
  'attempts all owner releases when a disposer throws %s native release',
  (when) => {
    const baseline = arena();
    const a = box(1, 1, 1),
      b = box(1, 1, 1);
    const body = unwrap(validateProductBody({ kind: 'PARAMETRIC', solids: [a, b] }));
    const realDispose = a[Symbol.dispose].bind(a);
    const cause = new Error(`failure ${when} release`);
    const first = vi.spyOn(a, Symbol.dispose).mockImplementation(() => {
      if (when === 'after') realDispose();
      throw cause;
    });
    const second = vi.spyOn(b, Symbol.dispose);
    try {
      const report = disposeProductBody(body);
      expect(report).toMatchObject({
        kind: 'FAILED',
        diagnostics: [{ operation: 'disposeProductBody', itemIndex: 0, cause }],
      });
      expect(Object.isFrozen(report)).toBe(true);
      if (report.kind !== 'FAILED') throw new Error('Expected failure');
      expect(Object.isFrozen(report.diagnostics)).toBe(true);
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
      if (when === 'after') expectArena(baseline);
      else {
        expect(a.disposed).toBe(false);
        expect(unwrap(measureVolume(a))).toBeCloseTo(1, 8);
        if (baseline !== null) expect(nativeShapeCount()).toBe(baseline + 1);
      }
    } finally {
      first.mockRestore();
      // Test-owned repair of a known pre-release injection. Owner cleanup did not succeed.
      if (when === 'before') realDispose();
    }
    expectArena(baseline);
  }
);

for (const stage of ['union-before', 'union-after', 'measure'] as const) {
  it.each(['error', 'throw'] as const)(
    `cleans temporary union after ${stage} %s without changing borrowed inputs`,
    (failure) => {
      const baseline = arena();
      {
        using scope = new DisposalScope();
        const { a, b } = createOverlapFixture(scope);
        const body = unwrap(validateProductBody({ kind: 'PARAMETRIC', solids: [a, b] }));
        const releases = body.solids.map((solid) => vi.spyOn(solid, Symbol.dispose));
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
        expect(measureProductBodyMaterial(body.solids)).toMatchObject({
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

it.each(['measure', 'bounds'] as const)(
  'rejects otherwise successful %s when temporary cleanup fails',
  (operation) => {
    using scope = new DisposalScope();
    const { a, b } = createOverlapFixture(scope);
    const body = unwrap(validateProductBody({ kind: 'AUTHORITATIVE', solids: [a, b] }));
    const releases: ReturnType<typeof vi.spyOn>[] = [];
    setProductBodyTestHooksForTesting({
      afterAllocate({ solid }) {
        const release = solid[Symbol.dispose].bind(solid);
        releases.push(
          vi.spyOn(solid, Symbol.dispose).mockImplementation(() => {
            release();
            throw new Error('temporary cleanup failed after release');
          })
        );
      },
    });
    const live = arena();
    const result =
      operation === 'measure'
        ? measureProductBodyMaterial(body.solids)
        : productBodyBounds(body, { kind: 'RESOLVED', tag: 'caller-space', frame: IDENTITY_FRAME });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'BODY_CLEANUP_FAILED', cleanup: { kind: 'FAILED' } },
    });
    releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
    expectArena(live);
    expect(body.solids).toEqual([a, b]);
  }
);

it.each(['error', 'throw'] as const)(
  'cleans all query copies after a later bounds %s',
  (failure) => {
    using scope = new DisposalScope();
    const { a, b } = createOverlapFixture(scope);
    const releases: ReturnType<typeof vi.spyOn>[] = [];
    const live = arena();
    setProductBodyTestHooksForTesting({
      afterAllocate({ solid }) {
        releases.push(vi.spyOn(solid, Symbol.dispose));
      },
      before({ step, itemIndex }) {
        if (step === 'bounds' && itemIndex === 1) {
          const cause = geometryError('BOUNDS_FAILURE', 'later bounds');
          if (failure === 'throw') throw new Error(cause.message, { cause });
          return err(cause);
        }
      },
    });
    expect(
      productBodyBounds([a, b], { kind: 'RESOLVED', tag: 'query', frame: IDENTITY_FRAME })
    ).toMatchObject({ ok: false, error: { itemIndex: 1 } });
    expect(releases).toHaveLength(2);
    releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
    expectArena(live);
  }
);

it.each(['copy', 'transform'] as const)(
  'cleans earlier outputs when the later native %s call throws',
  (operation) => {
    using scope = new DisposalScope();
    const { a, b } = createOverlapFixture(scope);
    const body = unwrap(validateProductBody({ kind: 'PARAMETRIC', solids: [a, b] }));
    const kernel = getKernel();
    if (operation === 'copy') {
      const realCopy = kernel.copyShape.bind(kernel);
      vi.spyOn(kernel, 'copyShape').mockImplementation((shape) => {
        if (shape === b.wrapped) throw new Error('native copy failure');
        const result: unknown = realCopy(shape);
        return result;
      });
    } else {
      const realLocate = kernel.locate.bind(kernel);
      vi.spyOn(kernel, 'locate').mockImplementation((shape, transform) => {
        if (shape === b.wrapped) throw new Error('native locate failure');
        const result: unknown = realLocate(shape, transform);
        return result;
      });
    }
    const releases: ReturnType<typeof vi.spyOn>[] = [];
    setProductBodyTestHooksForTesting({
      afterAllocate({ solid }) {
        releases.push(vi.spyOn(solid, Symbol.dispose));
      },
    });
    const live = arena();
    const result =
      operation === 'copy' ? copyProductBody(body) : transformProductBody(body, IDENTITY_FRAME);
    expect(result).toMatchObject({
      ok: false,
      error: { itemIndex: 1, cleanup: { kind: 'COMPLETE' } },
    });
    expect(releases).toHaveLength(1);
    expect(releases[0]).toHaveBeenCalledTimes(1);
    expectArena(live);
    expect(unwrap(measureVolume(b))).toBeCloseTo(1, 8);
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
  expect(
    productBodyBounds([solid], { kind: 'RESOLVED', tag: 'query', frame: IDENTITY_FRAME })
  ).toMatchObject({ ok: false, error: { code: 'BODY_INVALID_BOUNDS' } });
  expectArena(live);
});

it('rejects an unvalidated frame before allocating any geometry', () => {
  using solid = box(1, 1, 1);
  const body = unwrap(validateProductBody({ kind: 'AUTHORITATIVE', solids: [solid] }));
  const copy = vi.spyOn(getKernel(), 'copyShape');
  const locate = vi.spyOn(getKernel(), 'locate');
  expect(
    Reflect.apply(transformProductBody, undefined, [body, { matrix: IDENTITY_FRAME.matrix }])
  ).toMatchObject({ ok: false, error: { code: 'INVALID_RIGID_FRAME' } });
  expect(copy).not.toHaveBeenCalled();
  expect(locate).not.toHaveBeenCalled();
});

it('releases otherwise successful outputs when native transform cleanup throws', () => {
  using scope = new DisposalScope();
  const { a, b } = createOverlapFixture(scope);
  const body = unwrap(validateProductBody({ kind: 'AUTHORITATIVE', solids: [a, b] }));
  const kernel = getKernel();
  const compose = kernel.composeTransform.bind(kernel);
  const cleanupCause = new Error('native transform cleanup after release');
  const cleanup = vi.fn();
  vi.spyOn(kernel, 'composeTransform').mockImplementation((operations) => {
    const transform = compose(operations);
    return {
      ...transform,
      dispose() {
        cleanup();
        transform.dispose();
        throw cleanupCause;
      },
    };
  });
  const releases: ReturnType<typeof vi.spyOn>[] = [];
  setProductBodyTestHooksForTesting({
    afterAllocate({ solid }) {
      releases.push(vi.spyOn(solid, Symbol.dispose));
    },
  });
  const live = arena();
  const result = transformProductBody(body, IDENTITY_FRAME);
  expect(result).toMatchObject({
    ok: false,
    error: {
      code: 'BODY_CLEANUP_FAILED',
      cleanup: { kind: 'FAILED', diagnostics: [{ cause: cleanupCause }] },
    },
  });
  expect(releases).toHaveLength(2);
  releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
  expect(cleanup).toHaveBeenCalledTimes(1);
  expectArena(live);
  expect(unwrap(measureVolume(a))).toBeCloseTo(1, 8);
});

it('reports an outstanding partial output when failure cleanup throws before native release', () => {
  using scope = new DisposalScope();
  const { a, b } = createOverlapFixture(scope);
  const body = unwrap(validateProductBody({ kind: 'PARAMETRIC', solids: [a, b] }));
  const live = arena();
  const outputs: ValidSolid[] = [];
  const releases: ReturnType<typeof vi.spyOn>[] = [];
  let repair: (() => void) | undefined;
  setProductBodyTestHooksForTesting({
    afterAllocate({ solid, itemIndex }) {
      outputs.push(solid);
      if (itemIndex === 0) {
        repair = solid[Symbol.dispose].bind(solid);
        releases.push(
          vi.spyOn(solid, Symbol.dispose).mockImplementation(() => {
            throw new Error('uncertain partial release');
          })
        );
      } else {
        releases.push(vi.spyOn(solid, Symbol.dispose));
        return err(geometryError('LATER_FAILURE', 'later allocation failed'));
      }
    },
  });
  try {
    const result = transformProductBody(body, IDENTITY_FRAME);
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'LATER_FAILURE',
        cleanup: { kind: 'FAILED', diagnostics: [{ itemIndex: 0, resourceKind: 'SHAPE' }] },
      },
    });
    releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
    const retained = outputs[0];
    if (!retained) throw new Error('Expected retained partial');
    expect(retained.disposed).toBe(false);
    expect(unwrap(measureVolume(retained))).toBeCloseTo(1, 8);
    if (live !== null) expect(nativeShapeCount()).toBe(live + 1);
  } finally {
    vi.restoreAllMocks();
    // Only the test knows this injected failure never called the real disposer.
    repair?.();
  }
  expectArena(live);
});

it('preserves the primary failure alongside transform and output cleanup diagnostics', () => {
  using scope = new DisposalScope();
  const { a, b } = createOverlapFixture(scope);
  const body = unwrap(validateProductBody({ kind: 'PARAMETRIC', solids: [a, b] }));
  const compose = getKernel().composeTransform.bind(getKernel());
  const transformCause = new Error('transform release');
  const outputCause = new Error('output release');
  vi.spyOn(getKernel(), 'composeTransform').mockImplementation((ops) => {
    const transform = compose(ops);
    return {
      ...transform,
      dispose() {
        transform.dispose();
        throw transformCause;
      },
    };
  });
  const primary = geometryError('PRIMARY_FAILURE', 'later transform failed');
  const releases: ReturnType<typeof vi.spyOn>[] = [];
  setProductBodyTestHooksForTesting({
    before({ step, itemIndex }) {
      if (step === 'transform' && itemIndex === 1) return err(primary);
    },
    afterAllocate({ solid }) {
      const release = solid[Symbol.dispose].bind(solid);
      releases.push(
        vi.spyOn(solid, Symbol.dispose).mockImplementation(() => {
          release();
          throw outputCause;
        })
      );
    },
  });
  const live = arena();
  const result = transformProductBody(body, IDENTITY_FRAME);
  expect(result).toMatchObject({
    ok: false,
    error: { code: 'PRIMARY_FAILURE', cause: primary, cleanup: { kind: 'FAILED' } },
  });
  if (result.ok || result.error.cleanup.kind !== 'FAILED') throw new Error('Expected failure');
  expect(result.error.cleanup.diagnostics.map((d) => d.cause)).toEqual([
    transformCause,
    outputCause,
  ]);
  expect(result.error.cleanup.diagnostics.map((d) => d.resourceKind)).toEqual([
    'TRANSFORM',
    'SHAPE',
  ]);
  releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
  expectArena(live);
});

it('rejects malformed Body descriptors in bounds instead of bypassing authority validation', () => {
  using solid = box(1, 1, 1);
  for (const input of [
    null,
    { kind: 'EXACT', solids: [solid] },
    { kind: 'AUTHORITATIVE', solids: [] },
  ]) {
    expect(Reflect.apply(productBodyBounds, undefined, [input])).toMatchObject({
      ok: false,
      error: { operation: 'productBodyBounds' },
    });
  }
});

it('cleans a placed output and temporary faces when metadata propagation throws after native allocation', () => {
  using source = box(1, 1, 1);
  const face = getFaces(source)[0];
  if (!face) throw new Error('Expected face');
  tagFaces(source, [face], 'kept');
  const body = unwrap(validateProductBody({ kind: 'AUTHORITATIVE', solids: [source] }));
  const live = arena();
  vi.spyOn(getKernel(), 'hashCode').mockImplementation(() => {
    throw new Error('metadata after allocation');
  });
  expect(transformProductBody(body, IDENTITY_FRAME)).toMatchObject({ ok: false });
  expectArena(live);
  expect(unwrap(measureVolume(source))).toBeCloseTo(1, 8);
});
