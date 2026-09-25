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
