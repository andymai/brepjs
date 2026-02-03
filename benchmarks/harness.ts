/**
 * Lightweight benchmark harness for brepjs.
 *
 * Runs warmup iterations, then timed iterations, and reports
 * min/median/mean/max stats.
 */

export interface BenchResult {
  name: string;
  min: number;
  median: number;
  mean: number;
  max: number;
  iterations: number;
  aux?: Record<string, unknown>;
}

export interface BenchOptions {
  warmup?: number;
  iterations?: number;
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

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
  const med = median(times);

  return { name, min, median: med, mean, max, iterations };
}

/**
 * Prints a markdown table of benchmark results to stdout.
 */
export function printResults(results: BenchResult[]): void {
  console.log('\n| Benchmark | Min (ms) | Median (ms) | Mean (ms) | Max (ms) | Iters |');
  console.log('|-----------|----------|-------------|-----------|----------|-------|');
  for (const r of results) {
    console.log(
      `| ${r.name} | ${r.min.toFixed(1)} | ${r.median.toFixed(1)} | ${r.mean.toFixed(1)} | ${r.max.toFixed(1)} | ${r.iterations} |`
    );
  }
  console.log('');
}

/**
 * Writes JSON results to stdout for CI capture.
 */
export function writeResultsJSON(results: BenchResult[]): void {
  console.log('\n--- BENCHMARK RESULTS JSON ---');
  console.log(JSON.stringify(results, null, 2));
  console.log('--- END BENCHMARK RESULTS ---\n');
}

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
  const regressions: { name: string; baselineMedian: number; currentMedian: number; change: number }[] = [];

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
