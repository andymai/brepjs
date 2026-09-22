import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { box, getKernel, measureVolume, unwrap } from 'brepjs';
import { measureProductBodyMaterial } from '../src/types/productBody.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
beforeAll(async () => {
  await initKernel();
}, 30000);
const arena = () => (currentKernel === 'occt-wasm' ? nativeShapeCount() : null);
type NativeShape = Parameters<ReturnType<typeof getKernel>['dispose']>[0];
function expectArena(expected: number | null) {
  if (expected !== null) expect(nativeShapeCount()).toBe(expected);
}
afterEach(() => vi.restoreAllMocks());
function containsCause(value: unknown, target: unknown): boolean {
  if (value === target) return true;
  if (typeof value !== 'object' || value === null) return false;
  if ('cause' in value && containsCause(value.cause, target)) return true;
  if ('suppressed' in value && containsCause(value.suppressed, target)) return true;
  if ('error' in value && containsCause(value.error, target)) return true;
  if (value instanceof AggregateError) {
    const errors: readonly unknown[] = value.errors;
    return errors.some((error) => containsCause(error, target));
  }
  return false;
}

describe('union raw-result cleanup', () => {
  it.each(['before', 'after'] as const)(
    'reports cleanup failure %s release and preserves the cast error',
    (when) => {
      const baseline = arena();
      {
        using a = box(1, 1, 1);
        using b = box(1, 1, 1, { at: [2, 0, 0] });
        const solids = [a, b] as const;
        const live = arena();
        const kernel = getKernel();
        const downcast = kernel.downcast.bind(kernel);
        const release = kernel.dispose.bind(kernel);
        let failed: NativeShape | undefined;
        let casts = 0;
        const primary = new Error('Native result cast failed');
        const cleanupCause = new Error('Native result cleanup failed');
        vi.spyOn(kernel, 'downcast').mockImplementation((raw: NativeShape, type): unknown => {
          if (++casts === 1) {
            failed = raw;
            throw primary;
          }
          return downcast(raw, type);
        });
        const cleanup = vi.spyOn(kernel, 'dispose').mockImplementation((raw) => {
          if (raw === failed) {
            if (when === 'after') release(raw);
            throw cleanupCause;
          }
          release(raw);
        });
        try {
          const result = measureProductBodyMaterial(solids);
          expect(result).toMatchObject({ ok: false, error: { cleanup: { kind: 'FAILED' } } });
          if (result.ok || result.error.cleanup.kind !== 'FAILED')
            throw new Error('Expected cleanup failure');
          expect(result.error.cleanup.diagnostics).toEqual([
            {
              operation: 'measureProductBodyMaterial',
              itemIndex: 0,
              resourceKind: 'SHAPE',
              cause: cleanupCause,
            },
          ]);
          expect(containsCause(result.error, primary)).toBe(true);
          expect(cleanup.mock.calls.filter(([raw]) => raw === failed)).toHaveLength(1);
          expectArena(live === null ? null : live + (when === 'before' ? 1 : 0));
          expect(a.disposed).toBe(false);
          expect(b.disposed).toBe(false);
          expect(unwrap(measureVolume(a))).toBeCloseTo(1, 8);
        } finally {
          vi.restoreAllMocks();
          if (when === 'before' && failed !== undefined) release(failed);
        }
        expectArena(live);
      }
      expectArena(baseline);
    }
  );
});

it('reclaims the union result when native result casting fails', () => {
  const baseline = arena();
  {
    using a = box(1, 1, 1);
    using b = box(1, 1, 1, { at: [2, 0, 0] });
    const solids = [a, b] as const;
    const live = arena();
    const kernel = getKernel();
    const downcast = kernel.downcast.bind(kernel);
    const release = kernel.dispose.bind(kernel);
    const releases = vi.spyOn(kernel, 'dispose');
    let failed: NativeShape | undefined;
    let casts = 0;
    const primary = new Error('Native result cast failed');
    const casting = vi
      .spyOn(kernel, 'downcast')
      .mockImplementation((raw: NativeShape, type): unknown => {
        if (++casts === 1) {
          failed = raw;
          throw primary;
        }
        return downcast(raw, type);
      });
    try {
      const result = measureProductBodyMaterial(solids);
      expect(result).toMatchObject({
        ok: false,
        error: {
          itemIndex: 0,
          cause: { cause: primary },
          cleanup: { kind: 'COMPLETE' },
        },
      });
      expect(failed).toBeDefined();
      expect(releases.mock.calls.filter(([raw]) => raw === failed)).toHaveLength(1);
      expectArena(live);
      expect(a.disposed).toBe(false);
      expect(b.disposed).toBe(false);
      expect(unwrap(measureVolume(a))).toBeCloseTo(1, 8);
      expect(unwrap(measureVolume(b))).toBeCloseTo(1, 8);
    } finally {
      casting.mockRestore();
      // Repair only the red-phase leak. Successful owner cleanup is never retried.
      if (failed !== undefined && !releases.mock.calls.some(([raw]) => raw === failed))
        release(failed);
    }
  }
  expectArena(baseline);
});
