/**
 * Lightweight benchmark harness for brepjs.
 *
 * Runs warmup iterations, then timed iterations, and reports
 * min/median/mean/max/stddev/p95/RME stats.
 */

import { withKernel } from '../src/kernel/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BenchResult {
  name: string;
  kernel?: string; // 'occt' | 'brepkit'
  min: number;
  median: number;
  mean: number;
  max: number;
  stddev: number;
  p95: number;
  rme: number; // relative margin of error (%)
  iterations: number;
  aux?: Record<string, unknown>;
}

export interface BenchOptions {
  warmup?: number;
  iterations?: number;
}

export type KernelId = 'occt' | 'brepkit';

// ---------------------------------------------------------------------------
// Statistics helpers
// ---------------------------------------------------------------------------

function calcMedian(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function calcStddev(arr: number[], mean: number): number {
  if (arr.length < 2) return 0;
  const sumSq = arr.reduce((acc, v) => acc + (v - mean) ** 2, 0);
  return Math.sqrt(sumSq / (arr.length - 1));
}

function calcPercentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
  const frac = idx - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac; // eslint-disable-line @typescript-eslint/no-non-null-assertion
}

function calcRME(sd: number, mean: number, n: number): number {
  if (mean === 0 || n < 2) return 0;
  const sem = sd / Math.sqrt(n);
  return (sem / mean) * 100 * 1.96; // 95% confidence
}

// ---------------------------------------------------------------------------
// Core bench function
// ---------------------------------------------------------------------------

export async function bench(
  name: string,
  fn: () => void | Promise<void>,
  { warmup = 2, iterations = 5 }: BenchOptions = {}
): Promise<BenchResult> {
  // Warmup
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  // Timed iterations
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  const min = Math.min(...times);
  const max = Math.max(...times);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const med = calcMedian(times);
  const sd = calcStddev(times, mean);
  const p95 = calcPercentile(times, 95);
  const rme = calcRME(sd, mean, times.length);

  return { name, min, median: med, mean, max, stddev: sd, p95, rme, iterations };
}

// ---------------------------------------------------------------------------
// Multi-kernel helpers
// ---------------------------------------------------------------------------

/**
 * Create bench helpers that run across all available kernels.
 *
 * @param getKernels — returns currently-available kernel ids (e.g. `['occt', 'brepkit']`)
 */
export function createMultiKernelBench(getKernels: () => string[]) {
  async function benchKernel(
    kernelId: KernelId,
    name: string,
    fn: () => void,
    opts?: BenchOptions
  ): Promise<BenchResult | null> {
    if (!getKernels().includes(kernelId)) return null;

    try {
      return await bench(`[${kernelId}] ${name}`, () => {
        withKernel(kernelId, fn);
      }, opts);
    } catch (e) {
      if (kernelId !== 'occt') {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`  [${kernelId}] ${name}: skipped (${msg})`);
        return null;
      }
      throw e;
    }
  }

  async function benchBoth(
    name: string,
    fn: () => void,
    opts?: BenchOptions
  ): Promise<{ occt: BenchResult; brepkit: BenchResult | null }> {
    const occt = (await benchKernel('occt', name, fn, opts))!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    occt.kernel = 'occt';

    const brepkit = await benchKernel('brepkit', name, fn, opts);
    if (brepkit) {
      brepkit.kernel = 'brepkit';
    }

    return { occt, brepkit };
  }

  return { benchKernel, benchBoth };
}

/**
 * @deprecated Use `createMultiKernelBench` instead.
 */
export function createDualKernelBench(hasBrepkit: () => boolean) {
  return createMultiKernelBench(() => {
    const kernels = ['occt'];
    if (hasBrepkit()) kernels.push('brepkit');
    return kernels;
  });
}

/** Push occt (and brepkit if present) results into the array. */
export function collectResults(
  target: BenchResult[],
  { occt, brepkit }: { occt: BenchResult; brepkit: BenchResult | null }
): void {
  target.push(occt);
  if (brepkit) target.push(brepkit);
}

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

/**
 * Prints a markdown table of benchmark results to stdout.
 */
export function printResults(results: BenchResult[]): void {
  console.log(
    '\n| Benchmark | Min (ms) | Median (ms) | Mean (ms) | StdDev | p95 (ms) | RME | Iters |'
  );
  console.log(
    '|-----------|----------|-------------|-----------|--------|----------|-----|-------|'
  );
  for (const r of results) {
    console.log(
      `| ${r.name} | ${r.min.toFixed(1)} | ${r.median.toFixed(1)} | ${r.mean.toFixed(1)} | ${r.stddev.toFixed(2)} | ${r.p95.toFixed(1)} | ${r.rme.toFixed(1)}% | ${r.iterations} |`
    );
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

/**
 * Writes JSON results to stdout for CI capture.
 */
export function writeResultsJSON(results: BenchResult[]): void {
  console.log('\n--- BENCHMARK RESULTS JSON ---');
  console.log(JSON.stringify(results, null, 2));
  console.log('--- END BENCHMARK RESULTS ---\n');
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/**
 * Compare current results against a baseline.
 * Returns array of regressions (>threshold % slower).
 */
export function compareResults(
  current: BenchResult[],
  baseline: BenchResult[],
  threshold = 0.1
): { name: string; baselineMedian: number; currentMedian: number; change: number }[] {
  const baselineMap = new Map(baseline.map((r) => [r.name, r]));
  const regressions: {
    name: string;
    baselineMedian: number;
    currentMedian: number;
    change: number;
  }[] = [];

  for (const curr of current) {
    const base = baselineMap.get(curr.name);
    if (!base) continue;

    const change = (curr.median - base.median) / base.median;
    if (change > threshold) {
      regressions.push({
        name: curr.name,
        baselineMedian: base.median,
        currentMedian: curr.median,
        change,
      });
    }
  }

  return regressions;
}

// ---------------------------------------------------------------------------
// Markdown report generation (for kernel-comparison results)
// ---------------------------------------------------------------------------

export interface ReportSection {
  title: string;
  results: BenchResult[];
}

function speedupText(occtMedian: number, brepkitMedian: number): string {
  if (brepkitMedian === 0) return '**>100x faster**';
  const ratio = occtMedian / brepkitMedian;
  if (ratio >= 1) {
    return `**${ratio.toFixed(1)}x faster**`;
  }
  const inverse = 1 / ratio;
  return `**${inverse.toFixed(1)}x SLOWER**`;
}

export function generateReport(
  sections: ReportSection[],
  brepkitVersion: string,
  date: string
): string {
  const lines: string[] = [
    '# brepkit-wasm vs OCCT Kernel Comparison',
    '',
    `**Date:** ${date}`,
    `**brepkit-wasm version:** ${brepkitVersion}`,
    '**Test:** `benchmarks/kernel-comparison.bench.test.ts`',
    '**Environment:** Node.js, Linux (x86_64), 5 iterations per benchmark',
    '',
    '> Auto-generated by benchmark harness. Do not edit manually.',
    '',
    '---',
    '',
    '## Results',
    '',
  ];

  for (const section of sections) {
    lines.push(`### ${section.title}`, '');
    lines.push(
      '| Benchmark | Min (ms) | Median (ms) | Mean (ms) | Max (ms) | Speedup |'
    );
    lines.push(
      '| --- | --- | --- | --- | --- | --- |'
    );

    // Group results into OCCT/brepkit pairs by stripping kernel prefix
    const pairs = new Map<string, { occt?: BenchResult; brepkit?: BenchResult }>();
    for (const r of section.results) {
      const baseName = r.name.replace(/^\[(occt|brepkit)] /, '');
      const pair = pairs.get(baseName) ?? {};
      if (r.kernel === 'occt') pair.occt = r;
      else if (r.kernel === 'brepkit') pair.brepkit = r;
      pairs.set(baseName, pair);
    }

    for (const [_baseName, pair] of pairs) {
      if (pair.occt) {
        lines.push(
          `| ${pair.occt.name} | ${pair.occt.min.toFixed(1)} | ${pair.occt.median.toFixed(1)} | ${pair.occt.mean.toFixed(1)} | ${pair.occt.max.toFixed(1)} | — |`
        );
      }
      if (pair.brepkit) {
        const speedup =
          pair.occt ? speedupText(pair.occt.median, pair.brepkit.median) : '—';
        lines.push(
          `| ${pair.brepkit.name} | ${pair.brepkit.min.toFixed(1)} | ${pair.brepkit.median.toFixed(1)} | ${pair.brepkit.mean.toFixed(1)} | ${pair.brepkit.max.toFixed(1)} | ${speedup} |`
        );
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}
