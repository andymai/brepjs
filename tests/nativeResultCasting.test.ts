import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import {
  box,
  clone,
  fuseAll,
  getFaces,
  GeometryCleanupError,
  getKernel,
  locate,
  measureVolume,
  sharedEdges,
  unwrap,
} from '@/index.js';
import { OcctWasmAdapter } from '@/kernel/occtWasm/occtWasmAdapter.js';
import { currentKernel, initKernel } from './setup.js';

beforeAll(async () => {
  await initKernel();
}, 30000);
afterEach(() => vi.restoreAllMocks());
type NativeShape = Parameters<ReturnType<typeof getKernel>['dispose']>[0];

function arena(): number | null {
  if (currentKernel !== 'occt-wasm') return null;
  const kernel = getKernel();
  if (!(kernel instanceof OcctWasmAdapter)) throw new Error('Expected occt-wasm backend');
  const raw = kernel.retainedKernelOwner?.getRawKernel();
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('getShapeCount' in raw) ||
    typeof raw.getShapeCount !== 'function'
  )
    throw new Error('Required native shape counter is unavailable');
  const count: unknown = Reflect.apply(raw.getShapeCount, raw, []);
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
    throw new Error('Invalid native shape count');
  return count;
}

it.each(['clone', 'locate', 'fuseAll'] as const)(
  '%s releases an allocated result when casting rejects it, leaving inputs live',
  (operation) => {
    const baseline = arena();
    {
      using a = box(1, 1, 1);
      using b = box(1, 1, 1, { at: [2, 0, 0] });
      const live = arena();
      const kernel = getKernel();
      const dispose = kernel.dispose.bind(kernel);
      const releases = vi.spyOn(kernel, 'dispose');
      let failed: NativeShape | undefined;
      const primary = new Error('Cannot cast native result');
      const casting = vi.spyOn(kernel, 'downcast').mockImplementation((raw: NativeShape) => {
        failed = raw;
        throw primary;
      });
      try {
        if (operation === 'clone') {
          expect(clone(a)).toMatchObject({ ok: false, error: { cause: primary } });
        } else if (operation === 'locate') {
          expect(() => locate(a, { type: 'translate', v: [1, 0, 0] })).toThrow(primary);
        } else {
          expect(() => fuseAll([a, b], { trackEvolution: false })).toThrow(primary);
        }
        expect(failed).toBeDefined();
        expect(releases.mock.calls.filter(([raw]) => raw === failed)).toHaveLength(1);
        expect(arena()).toBe(live);
        expect(a.disposed).toBe(false);
        expect(b.disposed).toBe(false);
        expect(unwrap(measureVolume(a))).toBeCloseTo(1, 8);
        expect(unwrap(measureVolume(b))).toBeCloseTo(1, 8);
      } finally {
        casting.mockRestore();
        // A red-phase leak is repaired only by the test, never counted as owner success.
        if (failed !== undefined && !releases.mock.calls.some(([raw]) => raw === failed))
          dispose(failed);
      }
    }
    expect(arena()).toBe(baseline);
  }
);

function containsCause(value: unknown, target: unknown): boolean {
  if (value === target) return true;
  if (typeof value !== 'object' || value === null) return false;
  if ('cause' in value && containsCause(value.cause, target)) return true;
  if (value instanceof AggregateError) {
    const errors: readonly unknown[] = value.errors;
    return errors.some((error) => containsCause(error, target));
  }
  return false;
}

// Test-owned repair must distinguish aliases of one arena slot from separate Embind objects.
function nativeIdentity(raw: NativeShape): unknown {
  return currentKernel === 'occt-wasm' && 'id' in raw ? raw.id : raw;
}

for (const failIndex of [0, 2]) {
  it.each(['none', 'before', 'after'] as const)(
    `sharedEdges retires each result once after cast ${failIndex} fails (cleanup failure: %s)`,
    (when) => {
      const baseline = arena();
      {
        using source = box(1, 1, 1);
        const face = getFaces(source)[0];
        if (face === undefined) throw new Error('Expected fixture face');
        const live = arena();
        const kernel = getKernel();
        const query = kernel.sharedEdges.bind(kernel);
        const downcast = kernel.downcast.bind(kernel);
        const dispose = kernel.dispose.bind(kernel);
        const owned = new Set<NativeShape>();
        const released = new Set<unknown>();
        let batch: NativeShape[] = [];
        const release = (raw: NativeShape) => {
          dispose(raw);
          released.add(nativeIdentity(raw));
        };
        vi.spyOn(kernel, 'sharedEdges').mockImplementation((left, right) => {
          // The legacy native query is unsupported. Feed real owned native edges at that boundary.
          batch = currentKernel === 'occt' ? kernel.iterShapes(left, 'edge') : query(left, right);
          batch.forEach((raw) => owned.add(raw));
          return batch;
        });
        const primary = new Error('Shared-edge cast failed');
        const castCleanupCause = new Error('Failed edge cleanup');
        const remainingCleanupCause = new Error('Untouched edge cleanup');
        let failed: NativeShape | undefined;
        let casts = 0;
        vi.spyOn(kernel, 'downcast').mockImplementation((raw: NativeShape, type) => {
          if (casts++ === failIndex) {
            failed = raw;
            throw primary;
          }
          const output: NativeShape = downcast(raw, type);
          owned.add(output);
          return output;
        });
        const releases = vi.spyOn(kernel, 'dispose').mockImplementation((raw) => {
          const failing = raw === failed || raw === batch[failIndex + 1];
          if (when !== 'before' || !failing) release(raw);
          if (failing && when !== 'none')
            throw raw === failed ? castCleanupCause : remainingCleanupCause;
        });
        try {
          let failure: unknown;
          try {
            const edges = sharedEdges(face, face);
            for (const edge of edges) edge[Symbol.dispose]();
          } catch (cause) {
            failure = cause;
          }
          expect(containsCause(failure, primary)).toBe(true);
          if (when !== 'none') {
            expect(containsCause(failure, castCleanupCause)).toBe(true);
            expect(containsCause(failure, remainingCleanupCause)).toBe(true);
          }
          expect(batch).toHaveLength(4);
          expect(releases.mock.calls.filter(([raw]) => raw === failed)).toHaveLength(1);
          for (const raw of batch.slice(failIndex + 1))
            expect(releases.mock.calls.filter(([item]) => item === raw)).toHaveLength(1);
          expect(arena()).toBe(live === null ? null : live + (when === 'before' ? 2 : 0));
          expect(source.disposed).toBe(false);
          expect(unwrap(measureVolume(source))).toBeCloseTo(1, 8);
        } finally {
          vi.restoreAllMocks();
          // Known pre-release injections (or red-phase leaks) are repaired by the test only.
          for (const raw of owned) if (!released.has(nativeIdentity(raw))) release(raw);
        }
        expect(arena()).toBe(live);
      }
      expect(arena()).toBe(baseline);
    }
  );
}

it.each(['before', 'after'] as const)(
  'preserves cast and cleanup failures when raw cleanup throws %s release',
  (when) => {
    const baseline = arena();
    {
      using source = box(1, 1, 1);
      const live = arena();
      const kernel = getKernel();
      const dispose = kernel.dispose.bind(kernel);
      let failed: NativeShape | undefined;
      const primary = new Error('Cannot cast native result');
      const cleanupCause = new Error('Cannot release native result');
      vi.spyOn(kernel, 'downcast').mockImplementation((raw: NativeShape) => {
        failed = raw;
        throw primary;
      });
      const releases = vi.spyOn(kernel, 'dispose').mockImplementation((raw) => {
        if (raw === failed) {
          if (when === 'after') dispose(raw);
          throw cleanupCause;
        }
        dispose(raw);
      });
      try {
        const result = clone(source);
        expect(result).toMatchObject({ ok: false, error: { cause: expect.any(AggregateError) } });
        if (result.ok || !(result.error.cause instanceof AggregateError))
          throw new Error('Expected original and cleanup errors');
        const errors: readonly unknown[] = result.error.cause.errors;
        expect(errors[0]).toBe(primary);
        expect(errors[1]).toBeInstanceOf(GeometryCleanupError);
        expect(errors[1]).toMatchObject({ resourceKind: 'SHAPE', cause: cleanupCause });
        expect(releases.mock.calls.filter(([raw]) => raw === failed)).toHaveLength(1);
        expect(arena()).toBe(live === null ? null : live + (when === 'before' ? 1 : 0));
        expect(source.disposed).toBe(false);
        expect(unwrap(measureVolume(source))).toBeCloseTo(1, 8);
      } finally {
        vi.restoreAllMocks();
        if (when === 'before' && failed !== undefined) dispose(failed);
      }
      expect(arena()).toBe(live);
    }
    expect(arena()).toBe(baseline);
  }
);
