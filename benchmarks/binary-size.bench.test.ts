/**
 * Binary size tracking benchmark.
 *
 * Records WASM binary and JS glue sizes as auxiliary metrics.
 * Not a timing benchmark — captures artifact sizes for tracking
 * across optimization phases.
 *
 * Target: 50%+ reduction of single-threaded WASM (11 MB → ≤5.5 MB).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { printResults, writeResultsJSON, type BenchResult } from './harness.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, '../packages/brepjs-opencascade/src');

interface SizeEntry {
  file: string;
  bytes: number;
  kb: number;
  mb: number;
}

function fileSize(filePath: string): SizeEntry | null {
  try {
    const stats = fs.statSync(filePath);
    return {
      file: path.basename(filePath),
      bytes: stats.size,
      kb: Math.round(stats.size / 1024),
      mb: +(stats.size / (1024 * 1024)).toFixed(2),
    };
  } catch {
    return null;
  }
}

describe('Binary size tracking', () => {
  const results: BenchResult[] = [];

  const artifacts = [
    { name: 'single.wasm', path: path.join(pkgDir, 'brepjs_single.wasm') },
    { name: 'single.js', path: path.join(pkgDir, 'brepjs_single.js') },
    { name: 'single.d.ts', path: path.join(pkgDir, 'brepjs_single.d.ts') },
  ];

  it('records artifact sizes', () => {
    const sizes: SizeEntry[] = [];

    for (const artifact of artifacts) {
      const size = fileSize(artifact.path);
      if (size) {
        sizes.push(size);
        // Store size in MB as the "median" field for easy comparison
        results.push({
          name: `[size] ${artifact.name}`,
          min: size.mb,
          median: size.mb,
          mean: size.mb,
          max: size.mb,
          stddev: 0,
          p95: size.mb,
          rme: 0,
          iterations: 1,
          aux: { bytes: size.bytes, kb: size.kb, mb: size.mb },
        });
      }
    }

    // WASM files are gitignored and restored via ensure-wasm.sh.
    // Skip assertion in CI where artifacts may not be present.
    if (sizes.length === 0) {
      console.log('  [skip] No WASM artifacts found (CI without pre-built binaries)');
    }
  });

  it('records aggregate sizes', () => {
    const singleWasm = fileSize(path.join(pkgDir, 'brepjs_single.wasm'));
    const singleJs = fileSize(path.join(pkgDir, 'brepjs_single.js'));

    if (singleWasm && singleJs) {
      const totalSingleBytes = singleWasm.bytes + singleJs.bytes;
      results.push({
        name: '[size] single total (wasm+js)',
        min: +(totalSingleBytes / (1024 * 1024)).toFixed(2),
        median: +(totalSingleBytes / (1024 * 1024)).toFixed(2),
        mean: +(totalSingleBytes / (1024 * 1024)).toFixed(2),
        max: +(totalSingleBytes / (1024 * 1024)).toFixed(2),
        stddev: 0,
        p95: +(totalSingleBytes / (1024 * 1024)).toFixed(2),
        rme: 0,
        iterations: 1,
        aux: { bytes: totalSingleBytes },
      });
    }

    // Total package size (all variants)
    let totalBytes = 0;
    for (const artifact of artifacts) {
      const size = fileSize(artifact.path);
      if (size) totalBytes += size.bytes;
    }
    if (totalBytes > 0) {
      results.push({
        name: '[size] all variants total',
        min: +(totalBytes / (1024 * 1024)).toFixed(2),
        median: +(totalBytes / (1024 * 1024)).toFixed(2),
        mean: +(totalBytes / (1024 * 1024)).toFixed(2),
        max: +(totalBytes / (1024 * 1024)).toFixed(2),
        stddev: 0,
        p95: +(totalBytes / (1024 * 1024)).toFixed(2),
        rme: 0,
        iterations: 1,
        aux: { bytes: totalBytes },
      });
    }
  });

  it('prints size report', () => {
    console.log('\n--- Binary Size Report ---');
    console.log('| Artifact | Size (MB) | Size (KB) | Bytes |');
    console.log('|----------|-----------|-----------|-------|');
    for (const r of results) {
      const a = r.aux as Record<string, number>;
      console.log(
        `| ${r.name.replace('[size] ', '')} | ${a.mb ?? r.median} | ${a.kb ?? Math.round(r.median * 1024)} | ${a.bytes ?? Math.round(r.median * 1024 * 1024)} |`
      );
    }
    console.log('');

    // Print the standard table too
    printResults(results);

    // JSON output for CI if requested
    if (process.env.BENCH_OUTPUT_JSON === '1') {
      writeResultsJSON(results);
    }
  });
});
