// Tests for fuseAllBisect / cutAllBisect — happy-path coverage with real
// geometry. The bisect-recovery path is validated by inspection (30-line
// recursion) and by the wall-clock benchmark in
// benchmarks/booleanBatch.bench.test.ts; the bench drives bisect via a
// dependency-injection wrapper rather than module mocking.

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  translate,
  fuse,
  cut,
  fuseAll,
  cutAll,
  fuseAllBisect,
  cutAllBisect,
  unwrap,
  isOk,
  isErr,
  isShape3D,
  measureVolume,
} from '@/index.js';
import {
  cutAllBisectWith,
  fuseAllBisectWith,
  type BisectKernelOps,
} from '@/topology/booleanBatchFns.js';
import type { ValidSolid } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function boxAt(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): ValidSolid {
  const b = box(x2 - x1, y2 - y1, z2 - z1);
  if (x1 === 0 && y1 === 0 && z1 === 0) return b;
  return translate(b, [x1, y1, z1]);
}

describe('cutAllBisect — happy path', () => {
  it('matches cutAll output on a typical batch', () => {
    const baselineTools = [
      boxAt(10, 0, 0, 15, 10, 10),
      boxAt(20, 0, 0, 25, 10, 10),
      boxAt(30, 0, 0, 35, 10, 10),
      boxAt(40, 0, 0, 45, 10, 10),
    ];
    const bisectTools = [
      boxAt(10, 0, 0, 15, 10, 10),
      boxAt(20, 0, 0, 25, 10, 10),
      boxAt(30, 0, 0, 35, 10, 10),
      boxAt(40, 0, 0, 45, 10, 10),
    ];
    const baselineVolume = unwrap(
      measureVolume(unwrap(cutAll(boxAt(0, 0, 0, 50, 10, 10), baselineTools)))
    );
    const bisected = unwrap(cutAllBisect(boxAt(0, 0, 0, 50, 10, 10), bisectTools));
    expect(isShape3D(bisected.shape)).toBe(true);
    expect(unwrap(measureVolume(bisected.shape))).toBeCloseTo(baselineVolume, 1);
  });

  it('telemetry shows one successful batch, zero fallbacks on happy path', () => {
    const tools = [
      boxAt(10, 0, 0, 15, 10, 10),
      boxAt(20, 0, 0, 25, 10, 10),
      boxAt(30, 0, 0, 35, 10, 10),
      boxAt(40, 0, 0, 45, 10, 10),
    ];
    const result = unwrap(cutAllBisect(boxAt(0, 0, 0, 50, 10, 10), tools));
    expect(result.telemetry).toEqual({
      totalInputs: 4,
      batchAttempts: 1,
      batchSucceeded: 1,
      singletonFallbacks: 0,
      failedInputs: [],
    });
  });

  it('empty tools returns base unchanged with empty telemetry', () => {
    const result = unwrap(cutAllBisect(boxAt(0, 0, 0, 10, 10, 10), []));
    expect(unwrap(measureVolume(result.shape))).toBeCloseTo(1000, 1);
    expect(result.telemetry.totalInputs).toBe(0);
    expect(result.telemetry.batchAttempts).toBe(0);
  });

  it('single tool: takes singleton path, no batch attempt', () => {
    const result = unwrap(cutAllBisect(boxAt(0, 0, 0, 30, 10, 10), [boxAt(10, 0, 0, 20, 10, 10)]));
    expect(unwrap(measureVolume(result.shape))).toBeCloseTo(2000, 1);
    expect(result.telemetry.batchAttempts).toBe(0);
    expect(result.telemetry.singletonFallbacks).toBe(1);
  });

  it('respects an aborted signal at entry', () => {
    const controller = new AbortController();
    controller.abort(new Error('user cancelled'));
    expect(() =>
      cutAllBisect(boxAt(0, 0, 0, 30, 10, 10), [boxAt(10, 0, 0, 20, 10, 10)], {
        signal: controller.signal,
      })
    ).toThrow(/cancelled/);
  });
});

describe('fuseAllBisect — happy path', () => {
  it('matches fuseAll output on a typical batch', () => {
    const shapesA = [
      boxAt(0, 0, 0, 10, 10, 10),
      boxAt(15, 0, 0, 25, 10, 10),
      boxAt(30, 0, 0, 40, 10, 10),
    ];
    const shapesB = [
      boxAt(0, 0, 0, 10, 10, 10),
      boxAt(15, 0, 0, 25, 10, 10),
      boxAt(30, 0, 0, 40, 10, 10),
    ];
    const baselineVolume = unwrap(measureVolume(unwrap(fuseAll(shapesA))));
    const bisected = unwrap(fuseAllBisect(shapesB));
    expect(unwrap(measureVolume(bisected.shape))).toBeCloseTo(baselineVolume, 1);
  });

  it('telemetry shows one successful batch on happy path', () => {
    const result = unwrap(
      fuseAllBisect([
        boxAt(0, 0, 0, 10, 10, 10),
        boxAt(15, 0, 0, 25, 10, 10),
        boxAt(30, 0, 0, 40, 10, 10),
      ])
    );
    expect(result.telemetry.totalInputs).toBe(3);
    expect(result.telemetry.batchAttempts).toBe(1);
    expect(result.telemetry.batchSucceeded).toBe(1);
    expect(result.telemetry.failedInputs).toEqual([]);
  });

  it('empty shapes errors with FUSE_ALL_EMPTY', () => {
    const result = fuseAllBisect([]);
    expect(isErr(result)).toBe(true);
  });

  it('single shape returns it unchanged with no kernel calls counted', () => {
    const only = boxAt(0, 0, 0, 10, 10, 10);
    const result = unwrap(fuseAllBisect([only]));
    expect(unwrap(measureVolume(result.shape))).toBeCloseTo(1000, 1);
    // Identity case: no batch, no pairwise. singletonFallbacks counts
    // actual pairwise kernel calls; the trivial passthrough is neither.
    expect(result.telemetry).toEqual({
      totalInputs: 1,
      batchAttempts: 0,
      batchSucceeded: 0,
      singletonFallbacks: 0,
      failedInputs: [],
    });
  });

  it('respects an aborted signal at entry', () => {
    const controller = new AbortController();
    controller.abort(new Error('user cancelled'));
    expect(() =>
      fuseAllBisect([boxAt(0, 0, 0, 10, 10, 10), boxAt(15, 0, 0, 25, 10, 10)], {
        signal: controller.signal,
      })
    ).toThrow(/cancelled/);
  });
});

// ---------------------------------------------------------------------------
// Bisect-recovery path — drive failures via DI rather than module mocking
// ---------------------------------------------------------------------------
// `cutAllBisectWith` / `fuseAllBisectWith` accept a `BisectKernelOps` so we
// can wrap the real ops with synthetic failure modes and watch the bisect
// recovery walk down to a working batch size.

function wrapWithBatchFailure(threshold: number): BisectKernelOps {
  return {
    cut, // real pairwise — always works on the synthetic geometry we feed it
    fuse,
    cutAll: (base, tools, options) => {
      if (tools.length > threshold) throw new Error(`simulated batch failure (n=${tools.length})`);
      return cutAll(base, tools, options);
    },
    fuseAll: (shapes, options) => {
      if (shapes.length > threshold)
        throw new Error(`simulated batch failure (n=${shapes.length})`);
      return fuseAll(shapes, options);
    },
  };
}

describe('cutAllBisect — bisect recovery via injected ops', () => {
  it('bisects until a small-enough batch succeeds', () => {
    const ops = wrapWithBatchFailure(2);
    const tools = [
      boxAt(10, 0, 0, 15, 10, 10),
      boxAt(20, 0, 0, 25, 10, 10),
      boxAt(30, 0, 0, 35, 10, 10),
      boxAt(40, 0, 0, 45, 10, 10),
    ];
    const result = cutAllBisectWith(ops, boxAt(0, 0, 0, 50, 10, 10), tools);
    expect(isOk(result)).toBe(true);
    const { shape, telemetry } = unwrap(result);
    expect(isShape3D(shape)).toBe(true);
    expect(unwrap(measureVolume(shape))).toBeCloseTo(3000, 1);
    // n=4 batch fails, bisects to two halves of 2 (both succeed at threshold).
    // batchAttempts: 1 (full) + 2 (halves) = 3; batchSucceeded: 2.
    expect(telemetry).toEqual({
      totalInputs: 4,
      batchAttempts: 3,
      batchSucceeded: 2,
      singletonFallbacks: 0,
      failedInputs: [],
    });
  });

  it('falls through to singleton when all batch sizes fail', () => {
    const ops = wrapWithBatchFailure(0); // even n=1 batch fails
    const tools = [boxAt(10, 0, 0, 15, 10, 10), boxAt(20, 0, 0, 25, 10, 10)];
    const result = cutAllBisectWith(ops, boxAt(0, 0, 0, 30, 10, 10), tools);
    expect(isOk(result)).toBe(true);
    const { telemetry } = unwrap(result);
    // n=2 batch fails, bisects to two singletons. Each singleton goes
    // through pairwise `cut` (real), which succeeds.
    expect(telemetry.singletonFallbacks).toBe(2);
    expect(telemetry.failedInputs).toEqual([]);
  });

  it('records failedInputs when both batch and pairwise fail', () => {
    const failingOps: BisectKernelOps = {
      cut: () => {
        throw new Error('pairwise always fails');
      },
      fuse,
      cutAll: () => {
        throw new Error('batch always fails');
      },
      fuseAll,
    };
    const tools = [boxAt(10, 0, 0, 15, 10, 10), boxAt(20, 0, 0, 25, 10, 10)];
    const result = cutAllBisectWith(failingOps, boxAt(0, 0, 0, 30, 10, 10), tools);
    expect(isOk(result)).toBe(true);
    const { telemetry } = unwrap(result);
    expect(telemetry.failedInputs).toEqual([0, 1]);
  });
});

describe('fuseAllBisect — bisect recovery via injected ops', () => {
  it('failedInputs is deduplicated when fuse fails at multiple recursion levels', () => {
    // wrapWithBatchFailure(0) makes EVERY batch (size ≥ 1) throw. Pairwise
    // ops.fuse is the real fuse, which we additionally force to fail so
    // combineFuseHalves drops both halves at each level. This drives the
    // multi-level fuse failure case that produced duplicate indices before
    // the dedup fix.
    const ops: BisectKernelOps = {
      cut,
      fuse: () => {
        throw new Error('pairwise fuse always fails');
      },
      cutAll,
      fuseAll: () => {
        throw new Error('batch always fails');
      },
    };
    const shapes = [
      boxAt(0, 0, 0, 10, 10, 10),
      boxAt(15, 0, 0, 25, 10, 10),
      boxAt(30, 0, 0, 40, 10, 10),
      boxAt(45, 0, 0, 55, 10, 10),
    ];
    const result = fuseAllBisectWith(ops, shapes);
    expect(isOk(result)).toBe(true);
    const { telemetry } = unwrap(result);
    // Without dedup, index 1 and 3 would each appear twice in failedInputs.
    const sorted = [...telemetry.failedInputs];
    expect(sorted).toEqual([...new Set(sorted)]);
    expect(sorted).toEqual([...sorted].sort((a, b) => a - b));
  });

  it('bisects and combines halves on failure', () => {
    const ops = wrapWithBatchFailure(2);
    const shapes = [
      boxAt(0, 0, 0, 10, 10, 10),
      boxAt(15, 0, 0, 25, 10, 10),
      boxAt(30, 0, 0, 40, 10, 10),
      boxAt(45, 0, 0, 55, 10, 10),
    ];
    const result = fuseAllBisectWith(ops, shapes);
    expect(isOk(result)).toBe(true);
    const { telemetry } = unwrap(result);
    expect(telemetry.totalInputs).toBe(4);
    // n=4 batch fails, bisects to two halves of 2 (both succeed). Then a
    // pairwise `fuse` combines them (one extra batchAttempt + batchSucceeded).
    expect(telemetry.batchSucceeded).toBeGreaterThan(0);
    expect(telemetry.failedInputs).toEqual([]);
  });
});
