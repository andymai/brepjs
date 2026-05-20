// Wall-clock benchmark for cutAllBisect vs a sequential-fallback pattern.
//
// Models the failure-recovery scenario that motivates the bisect primitive:
// the kernel's N-way `cutAll` throws on certain tool combinations, leaving
// consumers like gridfinity-layout-tool to fall back to N pairwise `cut`
// calls. Bisect does O(log N) batch attempts + at most 1 pairwise singleton
// instead.
//
// Failures are forced via the BisectKernelOps DI seam, not by hunting for
// failure-inducing geometry — keeps the bench stable across kernel versions.

import { describe, it, beforeAll } from 'vitest';
import {
  box,
  translate,
  cut,
  cutAll,
  fuse,
  fuseAll,
  unwrap,
  isOk,
} from '../src/index.js';
import {
  cutAllBisectWith,
  type BisectKernelOps,
} from '../src/topology/booleanBatchFns.js';
import { initBenchKernels, benchBoth } from './setup.js';
import { collectResults, printResults, type BenchResult } from './harness.js';
import type { ValidSolid, Shape3D } from '../src/index.js';

beforeAll(async () => {
  await initBenchKernels();
}, 30000);

function boxAt(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): ValidSolid {
  const b = box(x2 - x1, y2 - y1, z2 - z1);
  if (x1 === 0 && y1 === 0 && z1 === 0) return b;
  return translate(b, [x1, y1, z1]);
}

function makeTools(n: number): ValidSolid[] {
  return Array.from({ length: n }, (_, i) => boxAt(2 + i * 4, 0, 0, 5 + i * 4, 10, 10));
}

const baseFactory = (): ValidSolid => boxAt(0, 0, 0, 100, 10, 10);

/** OPs that reject batches > threshold — drives bisect to walk down to size threshold+1. */
function failingOps(batchSizeLimit: number): BisectKernelOps {
  return {
    cut,
    fuse,
    cutAll: ((base, tools, options) => {
      if (tools.length > batchSizeLimit) {
        throw new Error(`simulated batch failure (n=${tools.length})`);
      }
      return cutAll(base, tools, options);
    }) as typeof cutAll,
    fuseAll,
  };
}

/**
 * The pattern gridfinity-layout-tool uses today: try the full batch, on any
 * throw, walk the tools list sequentially with pairwise `cut`. With N=16 and
 * a batch that always fails, this is 16 pairwise WASM calls.
 */
function sequentialFallbackCut(base: ValidSolid, tools: ValidSolid[]): Shape3D {
  try {
    const r = cutAll(base, tools);
    if (r.ok) return r.value;
  } catch {
    // fall through
  }
  let result: Shape3D = base;
  for (const tool of tools) {
    try {
      const r = cut(result as ValidSolid, tool);
      if (r.ok) result = r.value;
    } catch {
      // skip bad tool — matches gridfinity's behaviour
    }
  }
  return result;
}

/** A "force batch to fail" variant that drives the sequential fallback. */
function sequentialFallbackForcedFail(base: ValidSolid, tools: ValidSolid[]): Shape3D {
  // Skip the batch attempt entirely (forced-fail equivalent), go straight to
  // pairwise. Models the steady-state cost of consumers whose data reliably
  // makes cutAll throw.
  let result: Shape3D = base;
  for (const tool of tools) {
    const r = cut(result as ValidSolid, tool);
    if (r.ok) result = r.value;
  }
  return result;
}

describe('booleanBatch — happy path (no failure, bisect should be ~free)', () => {
  const results: BenchResult[] = [];
  const N = 8;

  it(`cutAll ${N} tools (baseline)`, async () => {
    collectResults(
      results,
      await benchBoth(`cutAll N=${N} (happy)`, () => {
        unwrap(cutAll(baseFactory(), makeTools(N)));
      })
    );
  });

  it(`cutAllBisect ${N} tools (happy path)`, async () => {
    collectResults(
      results,
      await benchBoth(`cutAllBisect N=${N} (happy)`, () => {
        const r = cutAllBisectWith(
          { cut, fuse, cutAll, fuseAll },
          baseFactory(),
          makeTools(N)
        );
        if (!isOk(r)) throw new Error('bisect failed unexpectedly');
      })
    );
  });

  it('prints happy-path results', () => {
    printResults(results);
  });
});

describe('booleanBatch — forced batch failure (the scenario bisect fixes)', () => {
  const results: BenchResult[] = [];
  const N = 16;

  it(`sequential pairwise fallback, N=${N} (current gridfinity pattern)`, async () => {
    collectResults(
      results,
      await benchBoth(`sequential-fallback N=${N}`, () => {
        sequentialFallbackForcedFail(baseFactory(), makeTools(N));
      })
    );
  });

  it(`cutAllBisect with forced batch failure (>4), N=${N}`, async () => {
    const ops = failingOps(4);
    collectResults(
      results,
      await benchBoth(`cutAllBisect N=${N} (batch fails >4)`, () => {
        const r = cutAllBisectWith(ops, baseFactory(), makeTools(N));
        if (!isOk(r)) throw new Error('bisect failed unexpectedly');
      })
    );
  });

  it(`cutAllBisect with forced batch failure (>2), N=${N}`, async () => {
    const ops = failingOps(2);
    collectResults(
      results,
      await benchBoth(`cutAllBisect N=${N} (batch fails >2)`, () => {
        const r = cutAllBisectWith(ops, baseFactory(), makeTools(N));
        if (!isOk(r)) throw new Error('bisect failed unexpectedly');
      })
    );
  });

  it('prints forced-failure results', () => {
    printResults(results);
  });
});

describe('booleanBatch — single bad tool in an otherwise-good batch', () => {
  const results: BenchResult[] = [];
  const N = 16;

  // The realistic case: kernel batches usually succeed; one tool occasionally
  // breaks the whole batch. Bisect isolates it in log(N) batch attempts.
  it(`cutAllBisect, ${N} tools, batch fails only at size > 8`, async () => {
    const ops = failingOps(8);
    collectResults(
      results,
      await benchBoth(`cutAllBisect N=${N} (batch fails >8)`, () => {
        const r = cutAllBisectWith(ops, baseFactory(), makeTools(N));
        if (!isOk(r)) throw new Error('bisect failed unexpectedly');
      })
    );
  });

  it(`sequential pairwise, ${N} tools (no batch attempt)`, async () => {
    collectResults(
      results,
      await benchBoth(`sequential-fallback N=${N} (1 batch fail)`, () => {
        sequentialFallbackCut(baseFactory(), makeTools(N));
      })
    );
  });

  it('prints single-bad-tool results', () => {
    printResults(results);
  });
});
