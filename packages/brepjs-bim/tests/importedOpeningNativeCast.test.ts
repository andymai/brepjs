import { afterEach, beforeAll, expect, it, vi, type MockInstance } from 'vitest';
import { box, getKernel, measureVolume, translate, unwrap } from 'brepjs';
import * as brepjs from 'brepjs';
import { cutImportedSolids } from '../src/import/cutImportedSolids.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { nativeShapeCount } from './helpers/nativeArena.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);
afterEach(() => vi.restoreAllMocks());

it.each(['none', 'before', 'after'] as const)(
  'releases split children after wrapping fails with %s raw cleanup failure',
  (point) => {
    using host = box(10, 2, 2);
    using toolSource = box(2, 4, 4);
    using tool = translate(toolSource, [4, -1, -1]);
    const kernel = getKernel();
    const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    const iterate = kernel.iterShapes.bind(kernel);
    const dispose = kernel.dispose.bind(kernel);
    const create = brepjs.createSolid;
    const raws: Parameters<typeof kernel.dispose>[0][] = [];
    const children: brepjs.Solid[] = [];
    const cause = new Error('Later imported child wrapping failed');
    const cleanupCause = new Error('Unwrapped child cleanup failed');
    let failedRaw: Parameters<typeof kernel.dispose>[0] | undefined;
    vi.spyOn(kernel, 'iterShapes').mockImplementation((shape, type) => {
      const result: unknown[] = iterate(shape, type);
      if (type === 'solid') raws.push(...result.map(nativeResource));
      return result;
    });
    const wrapping = vi
      .spyOn(brepjs, 'createSolid')
      .mockImplementation((raw: Parameters<typeof kernel.dispose>[0]) => {
        if (children.length === 1) {
          failedRaw = raw;
          throw cause;
        }
        const child = create(raw);
        children.push(child);
        return child;
      });
    const releases = vi.spyOn(kernel, 'dispose').mockImplementation((raw) => {
      if (raw === failedRaw && point !== 'none') {
        if (point === 'after') dispose(raw);
        throw cleanupCause;
      }
      dispose(raw);
    });
    try {
      const result = cutImportedSolids(host, tool);
      expect(result).toMatchObject({ ok: false, error: { code: 'VOID_CUT_FAILED', cause } });
      expect(wrapping).toHaveBeenCalledTimes(2);
      expect(raws).toHaveLength(2);
      for (const raw of raws)
        expect(releases.mock.calls.filter(([released]) => released === raw)).toHaveLength(1);
      expect(result).toMatchObject({
        error: {
          metadata: {
            cleanup:
              point === 'none'
                ? { kind: 'COMPLETE' }
                : {
                    kind: 'FAILED',
                    diagnostics: [{ resourceKind: 'SHAPE', cause: cleanupCause }],
                  },
          },
        },
      });
      expect(unwrap(measureVolume(host))).toBeCloseTo(40, 8);
      expect(unwrap(measureVolume(tool))).toBeCloseTo(32, 8);
      if (baseline !== null)
        expect(nativeShapeCount()).toBe(baseline + (point === 'before' ? 1 : 0));
    } finally {
      const failedAttempted = releases.mock.calls.some(([released]) => released === failedRaw);
      for (const child of children) if (!child.disposed) child[Symbol.dispose]();
      for (const raw of raws)
        if (!releases.mock.calls.some(([released]) => released === raw)) dispose(raw);
      vi.restoreAllMocks();
      // Test-owned repair of the observed pre-release fault, never a production retry.
      if (point === 'before' && failedRaw !== undefined && failedAttempted) dispose(failedRaw);
    }
    if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
  }
);

it.each(['before', 'after'] as const)(
  'cancels survivor transfer when extracted-child cleanup fails %s release',
  (point) => {
    using host = box(10, 2, 2);
    using toolSource = box(2, 4, 4);
    using tool = translate(toolSource, [4, -1, -1]);
    const live = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    const create = brepjs.createSolid;
    const clones = brepjs.clone;
    const releases: MockInstance<() => void>[] = [];
    const outputs: MockInstance<() => void>[] = [];
    let recovery: (() => void) | undefined;
    const cause = new Error('extracted child release failed');
    vi.spyOn(brepjs, 'createSolid').mockImplementation((raw) => {
      const child = create(raw);
      const release = child[Symbol.dispose].bind(child);
      const first = releases.length === 0;
      releases.push(
        vi.spyOn(child, Symbol.dispose).mockImplementation(() => {
          if (first && point === 'before') {
            recovery = release;
            throw cause;
          }
          release();
          if (first) throw cause;
        })
      );
      return child;
    });
    vi.spyOn(brepjs, 'clone').mockImplementation((...args) => {
      const result = clones(...args);
      if (result.ok) outputs.push(vi.spyOn(result.value, Symbol.dispose));
      return result;
    });
    try {
      expect(cutImportedSolids(host, tool)).toMatchObject({
        ok: false,
        error: {
          code: 'VOID_CLEANUP_FAILED',
          metadata: { cleanup: { kind: 'FAILED', diagnostics: [{ cause }] } },
        },
      });
      expect(releases).toHaveLength(2);
      expect(outputs).toHaveLength(2);
      for (const release of [...releases, ...outputs]) expect(release).toHaveBeenCalledTimes(1);
      expect(unwrap(measureVolume(host))).toBeCloseTo(40, 8);
      expect(unwrap(measureVolume(tool))).toBeCloseTo(32, 8);
      if (live !== null) expect(nativeShapeCount()).toBe(live + (point === 'before' ? 1 : 0));
    } finally {
      vi.restoreAllMocks();
      recovery?.();
    }
    if (live !== null) expect(nativeShapeCount()).toBe(live);
  }
);

it('releases every intermediate when a later split-survivor cast fails', () => {
  using host = box(10, 2, 2);
  using toolSource = box(2, 4, 4);
  using tool = translate(toolSource, [4, -1, -1]);
  const kernel = getKernel();
  const live = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
  const downcast = kernel.downcast.bind(kernel);
  const release = kernel.dispose.bind(kernel);
  const releases = vi.spyOn(kernel, 'dispose');
  let firstCast: unknown;
  let casts = 0;
  vi.spyOn(kernel, 'downcast').mockImplementation((raw, type): unknown => {
    if (type === 'solid') {
      if (++casts === 2) throw new Error('later split survivor cast');
      firstCast = downcast(raw, type);
      return firstCast;
    }
    return downcast(raw, type);
  });
  try {
    expect(cutImportedSolids(host, tool)).toMatchObject({ ok: false });
    expect(casts).toBe(2);
    expect(firstCast).toBeDefined();
    expect(releases.mock.calls.filter(([raw]) => raw === firstCast)).toHaveLength(1);
    if (live !== null) expect(nativeShapeCount()).toBe(live);
    expect(unwrap(measureVolume(host))).toBeCloseTo(40, 8);
    expect(unwrap(measureVolume(tool))).toBeCloseTo(32, 8);
  } finally {
    // Only repair the red-phase resource that had no owner release attempt.
    if (firstCast !== undefined && !releases.mock.calls.some(([raw]) => raw === firstCast))
      release(nativeResource(firstCast));
    vi.restoreAllMocks();
  }
});

function nativeResource(value: unknown): { delete(): void } {
  if (!isNativeResource(value)) throw new Error('Expected native resource');
  return value;
}
function isNativeResource(value: unknown): value is { delete(): void } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'delete' in value &&
    typeof value.delete === 'function'
  );
}
