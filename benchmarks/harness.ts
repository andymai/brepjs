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

export type KernelId = 'occt' | 'brepkit' | 'occt-wasm';

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

  async function benchAll(
    name: string,
    fn: () => void,
    opts?: BenchOptions
  ): Promise<Record<string, BenchResult | null>> {
    const results: Record<string, BenchResult | null> = {};
    for (const kid of getKernels()) {
      const r = await benchKernel(kid as KernelId, name, fn, opts);
      if (r) r.kernel = kid;
      results[kid] = r;
    }
    return results;
  }

  async function benchBoth(
    name: string,
    fn: () => void,
    opts?: BenchOptions
  ): Promise<{ occt: BenchResult; brepkit: BenchResult | null; 'occt-wasm'?: BenchResult | null }> {
    const all = await benchAll(name, fn, opts);
    return {
      occt: all['occt']!,  // eslint-disable-line @typescript-eslint/no-non-null-assertion
      brepkit: all['brepkit'] ?? null,
      'occt-wasm': all['occt-wasm'] ?? null,
    };
  }

  return { benchKernel, benchBoth, benchAll };
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

/** Push all non-null kernel results into the array. */
export function collectResults(
  target: BenchResult[],
  results: Record<string, BenchResult | null>
): void {
  for (const r of Object.values(results)) {
    if (r) target.push(r);
  }
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

function speedupText(baselineMedian: number, compareMedian: number): string {
  if (compareMedian === 0 && baselineMedian === 0) return '≈ same';
  if (compareMedian === 0) return '**>100x faster**';
  if (baselineMedian === 0) return '**>100x SLOWER**';
  const ratio = baselineMedian / compareMedian;
  if (ratio >= 1) {
    // Within rounding of parity — don't flag measurement noise as a speedup.
    if (ratio.toFixed(1) === '1.0') return '≈ same';
    return `**${ratio.toFixed(1)}x faster**`;
  }
  // Check the displayed slowdown multiplier, not the raw ratio, so a real
  // sub-10% slowdown isn't rounded away into "≈ same".
  const inverse = 1 / ratio;
  if (inverse.toFixed(1) === '1.0') return '≈ same';
  return `**${inverse.toFixed(1)}x SLOWER**`;
}

/** All kernel IDs that may appear in reports, in display order. */
const KERNEL_ORDER: readonly string[] = ['occt', 'occt-wasm', 'brepkit'];

export function generateReport(
  sections: ReportSection[],
  brepkitVersion: string,
  date: string
): string {
  const lines: string[] = [
    '# Kernel Comparison',
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
      '| Benchmark | Min (ms) | Median (ms) | Mean (ms) | Max (ms) | vs occt |'
    );
    lines.push(
      '| --- | --- | --- | --- | --- | --- |'
    );

    // Group results by base name (stripping [kernel] prefix)
    const groups = new Map<string, Map<string, BenchResult>>();
    for (const r of section.results) {
      const baseName = r.name.replace(/^\[[^\]]+] /, '');
      const group = groups.get(baseName) ?? new Map<string, BenchResult>();
      if (r.kernel) group.set(r.kernel, r);
      groups.set(baseName, group);
    }

    for (const [_baseName, group] of groups) {
      const occtResult = group.get('occt');
      // Known kernels first (stable display order), then any other kernel that
      // produced results (e.g. one selected via a subset but absent from
      // KERNEL_ORDER) so a kernel that actually ran is never dropped silently.
      const known = KERNEL_ORDER.filter((kid) => group.has(kid));
      const extra = [...group.keys()].filter((kid) => !KERNEL_ORDER.includes(kid));
      for (const kid of [...known, ...extra]) {
        const r = group.get(kid);
        if (!r) continue;
        const speedup =
          kid === 'occt' || !occtResult
            ? '—'
            : speedupText(occtResult.median, r.median);
        lines.push(
          `| ${r.name} | ${r.min.toFixed(1)} | ${r.median.toFixed(1)} | ${r.mean.toFixed(1)} | ${r.max.toFixed(1)} | ${speedup} |`
        );
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}
