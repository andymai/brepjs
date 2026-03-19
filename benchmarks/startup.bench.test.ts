/**
 * Startup & initialisation benchmarks.
 *
 * Measures the phases that dominate first-load latency:
 *   1. End-to-end cold start → first render (most important, runs first)
 *   2. Breakdown of individual phases (incremental, shares process cache)
 *
 * Because WASM init is one-shot in a process (V8 caches compiled modules),
 * the end-to-end test runs FIRST to get a true cold measurement. Subsequent
 * phase breakdowns share cached state and are useful for relative comparison
 * but not absolute timing.
 *
 * Uses vitest `forks` pool — each test file gets a fresh worker process.
 */
import { describe, it } from 'vitest';
import { printResults, type BenchResult } from './harness.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function singleResult(name: string, ms: number): BenchResult {
  return {
    name,
    min: ms,
    median: ms,
    mean: ms,
    max: ms,
    stddev: 0,
    p95: ms,
    rme: 0,
    iterations: 1,
  };
}

function locateWasm(fileName: string): string {
  if (fileName.endsWith('.wasm')) {
    return new URL(
      '../packages/brepjs-opencascade/src/brepjs_single.wasm',
      import.meta.url
    ).pathname;
  }
  return fileName;
}

// ---------------------------------------------------------------------------
// Tests — ordering matters (end-to-end first for cold measurement)
// ---------------------------------------------------------------------------

describe('Startup benchmarks', () => {
  const results: BenchResult[] = [];

  it('end-to-end cold start → first mesh (TRUE cold)', async () => {
    const t0 = performance.now();

    const { default: initOpenCascade } = await import(
      'brepjs-opencascade/src/brepjs_single.js'
    );
    const tImport = performance.now();

    const oc = await initOpenCascade({ locateFile: locateWasm });
    const tWasm = performance.now();

    const { initFromOC } = await import('../src/kernel/index.js');
    initFromOC(oc);
    const tAdapter = performance.now();

    const { box, mesh } = await import('../src/index.js');
    const b = box(10, 10, 10);
    const tFirstOp = performance.now();

    mesh(b);
    const tMesh = performance.now();

    // Record all phase breakdowns from the cold run
    results.push(singleResult('cold: import glue JS', tImport - t0));
    results.push(singleResult('cold: WASM compile+instantiate', tWasm - tImport));
    results.push(singleResult('cold: initFromOC (adapter)', tAdapter - tWasm));
    results.push(singleResult('cold: first box()', tFirstOp - tAdapter));
    results.push(singleResult('cold: first mesh()', tMesh - tFirstOp));
    results.push(singleResult('cold: TOTAL start → first mesh', tMesh - t0));
  });

  it('warm WASM init (V8 cached module — simulates subsequent page loads)', async () => {
    // The WASM module is now cached in V8. This simulates browser scenarios
    // where the WASM is in the HTTP cache but needs re-instantiation.
    const { default: initOpenCascade } = await import(
      'brepjs-opencascade/src/brepjs_single.js'
    );

    const t0 = performance.now();
    const oc = await initOpenCascade({ locateFile: locateWasm });
    const tWasm = performance.now();

    const { initFromOC } = await import('../src/kernel/index.js');
    initFromOC(oc);

    const { box, mesh } = await import('../src/index.js');
    const b = box(10, 10, 10);
    mesh(b);
    const tEnd = performance.now();

    results.push(singleResult('warm: WASM re-instantiate', tWasm - t0));
    results.push(singleResult('warm: TOTAL re-init → first mesh', tEnd - t0));
  });

  it('prints results', () => {
    printResults(results);

    // Summary
    const cold = results.find((r) => r.name === 'cold: TOTAL start → first mesh');
    const warm = results.find((r) => r.name === 'warm: TOTAL re-init → first mesh');
    if (cold && warm) {
      console.log(`  Cold start total: ${cold.median.toFixed(0)} ms`);
      console.log(`  Warm re-init total: ${warm.median.toFixed(0)} ms`);
      console.log(`  V8 cache speedup: ${(cold.median / warm.median).toFixed(1)}x\n`);
    }
  });
});
