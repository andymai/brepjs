/**
 * V7 vs V8 OCCT apples-to-apples benchmark.
 *
 * Downloads both V7 and V8 WASM binaries from npm and loads them in the
 * same process for a controlled comparison.
 *
 * ## Running
 *
 * ```bash
 * npx vitest run benchmarks/v7-vs-v8.bench.test.ts --config vitest.bench.config.ts
 * ```
 *
 * Override versions via env vars:
 *   OCCT_V7_VERSION=0.13.0 OCCT_V8_VERSION=0.14.1 npx vitest run ...
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerKernel, withKernel, getKernel } from '../src/kernel/index.js';
import { DefaultAdapter } from '../src/kernel/occt/defaultAdapter.js';
import { bench, type BenchResult } from './harness.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComparisonResult {
  name: string;
  v7: BenchResult;
  v8: BenchResult;
}

// ---------------------------------------------------------------------------
// npm version fetcher
// ---------------------------------------------------------------------------

const __dir = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dir, '../.bench-cache');

/** Download a specific brepjs-opencascade version from npm and return the src directory path. */
function fetchNpmVersion(version: string): string {
  const versionDir = path.resolve(CACHE_DIR, version);
  const srcDir = path.resolve(versionDir, 'src');
  const marker = path.resolve(srcDir, 'brepjs_single.js');
  if (existsSync(marker)) return srcDir;

  mkdirSync(versionDir, { recursive: true });
  execFileSync('npm', ['pack', `brepjs-opencascade@${version}`, '--pack-destination', versionDir], {
    stdio: 'pipe',
  });
  // Find the tgz
  const tgz = readdirSync(versionDir).find((f) => f.endsWith('.tgz'));
  if (!tgz) throw new Error(`npm pack did not produce a .tgz for ${version}`);
  execFileSync('tar', ['-xzf', path.join(versionDir, tgz), '-C', versionDir], { stdio: 'pipe' });
  renameSync(path.join(versionDir, 'package', 'src'), srcDir);
  rmSync(path.join(versionDir, 'package'), { recursive: true, force: true });
  rmSync(path.join(versionDir, tgz), { force: true });
  return srcDir;
}

/** Load an OCCT WASM binary from a directory and register as a kernel. */
async function loadOCCTFromDir(kernelId: string, srcDir: string): Promise<void> {
  const jsPath = path.resolve(srcDir, 'brepjs_single.js');
  const wasmPath = path.resolve(srcDir, 'brepjs_single.wasm');
  const mod = await import(jsPath);
  const init = mod.default ?? mod;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Emscripten factory
  const oc: any = await init({
    locateFile: (f: string) => (f.endsWith('.wasm') ? wasmPath : f),
  });
  registerKernel(kernelId, new DefaultAdapter(oc));
}

// Last V7 build (OCCT 7.x, emsdk 3.1.14, -Os)
const V7_VERSION = process.env['OCCT_V7_VERSION'] ?? '0.13.0';
// Current V8 build (OCCT 8.0 RC4, emsdk 5.0.3, -Os+LTO)
const V8_VERSION = process.env['OCCT_V8_VERSION'] ?? '0.14.1';

// ---------------------------------------------------------------------------
// Bench helper — runs same fn through both kernels
// ---------------------------------------------------------------------------

async function benchV7vsV8(
  name: string,
  fn: () => void,
  opts?: { warmup?: number; iterations?: number }
): Promise<ComparisonResult> {
  const v7 = await bench(`[v7] ${name}`, () => withKernel('occt-v7', fn), opts);
  const v8 = await bench(`[v8] ${name}`, () => withKernel('occt-v8', fn), opts);
  v7.kernel = 'occt';
  v8.kernel = 'occt';
  return { name, v7, v8 };
}

// ---------------------------------------------------------------------------
// Comparison table printer
// ---------------------------------------------------------------------------

function printComparison(results: ComparisonResult[]): void {
  console.log(
    '\n| Benchmark | V7 Median (ms) | V8 Median (ms) | Change | Verdict |'
  );
  console.log(
    '|-----------|----------------|----------------|--------|---------|'
  );
  for (const r of results) {
    const pct = ((r.v8.median - r.v7.median) / r.v7.median) * 100;
    const sign = pct >= 0 ? '+' : '';
    const verdict =
      pct < -5 ? '✅ V8 faster' : pct > 5 ? '🔴 V8 slower' : '➖ ~same';
    console.log(
      `| ${r.name} | ${r.v7.median.toFixed(1)} | ${r.v8.median.toFixed(1)} | ${sign}${pct.toFixed(1)}% | ${verdict} |`
    );
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const ALL: ComparisonResult[] = [];

beforeAll(async () => {
  // Download both versions from npm (cached in .bench-cache/)
  console.log(`[v7-vs-v8] Fetching V7 (${V7_VERSION}) and V8 (${V8_VERSION}) from npm...`); // eslint-disable-line no-console
  const v7Dir = fetchNpmVersion(V7_VERSION);
  const v8Dir = fetchNpmVersion(V8_VERSION);

  // Load both WASM binaries as separate kernels
  await loadOCCTFromDir('occt-v7', v7Dir);
  await loadOCCTFromDir('occt-v8', v8Dir);

  // Prewarm both kernels (first call has JIT penalty)
  withKernel('occt-v7', () => getKernel().makeBox(1, 1, 1));
  withKernel('occt-v8', () => getKernel().makeBox(1, 1, 1));

  console.log(`[v7-vs-v8] Both kernels loaded and prewarmed (V7=${V7_VERSION}, V8=${V8_VERSION})`); // eslint-disable-line no-console
}, 90000);

describe('V7 vs V8: Primitives', () => {
  const results: ComparisonResult[] = [];

  it('makeBox ×100', async () => {
    results.push(
      await benchV7vsV8('makeBox(10,20,30) ×100', () => {
        const k = getKernel();
        for (let i = 0; i < 100; i++) k.makeBox(10, 20, 30);
      })
    );
  });

  it('makeCylinder ×100', async () => {
    results.push(
      await benchV7vsV8('makeCylinder(5,20) ×100', () => {
        const k = getKernel();
        for (let i = 0; i < 100; i++) k.makeCylinder(5, 20);
      })
    );
  });

  it('makeSphere ×100', async () => {
    results.push(
      await benchV7vsV8('makeSphere(10) ×100', () => {
        const k = getKernel();
        for (let i = 0; i < 100; i++) k.makeSphere(10);
      })
    );
  });

  afterAll(() => {
    printComparison(results);
    ALL.push(...results);
  });
});

describe('V7 vs V8: Booleans', () => {
  const results: ComparisonResult[] = [];

  it('fuse (box ∪ box) ×10', async () => {
    results.push(
      await benchV7vsV8('fuse(box,box) ×10', () => {
        const k = getKernel();
        for (let i = 0; i < 10; i++) {
          const a = k.makeBox(10, 10, 10);
          const b = k.translate(k.makeBox(5, 5, 5), 5, 5, 5);
          k.fuse(a, b);
        }
      })
    );
  });

  it('cut (box - cyl) ×10', async () => {
    results.push(
      await benchV7vsV8('cut(box,cyl) ×10', () => {
        const k = getKernel();
        for (let i = 0; i < 10; i++) {
          const box = k.makeBox(10, 10, 10);
          const cyl = k.makeCylinder(3, 20);
          k.cut(box, cyl);
        }
      })
    );
  });

  it('intersect (box ∩ sphere) ×10', async () => {
    results.push(
      await benchV7vsV8('intersect(box,sphere) ×10', () => {
        const k = getKernel();
        for (let i = 0; i < 10; i++) {
          const box = k.makeBox(10, 10, 10);
          const sph = k.makeSphere(8);
          k.intersect(box, sph);
        }
      })
    );
  });

  afterAll(() => {
    printComparison(results);
    ALL.push(...results);
  });
});

describe('V7 vs V8: Transforms', () => {
  const results: ComparisonResult[] = [];

  it('translate ×1000', async () => {
    results.push(
      await benchV7vsV8('translate ×1000', () => {
        const k = getKernel();
        let shape = k.makeBox(1, 1, 1);
        for (let i = 0; i < 1000; i++) shape = k.translate(shape, 0.01, 0, 0);
      })
    );
  });

  it('rotate ×100', async () => {
    results.push(
      await benchV7vsV8('rotate ×100', () => {
        const k = getKernel();
        let shape = k.makeBox(5, 5, 5);
        for (let i = 0; i < 100; i++) shape = k.rotate(shape, 3.6, [0, 0, 1]);
      })
    );
  });

  afterAll(() => {
    printComparison(results);
    ALL.push(...results);
  });
});

describe('V7 vs V8: Meshing', () => {
  const results: ComparisonResult[] = [];

  it('mesh box (coarse)', async () => {
    results.push(
      await benchV7vsV8('mesh box (tol=0.1)', () => {
        const k = getKernel();
        const box = k.makeBox(10, 10, 10);
        k.mesh(box, { tolerance: 0.1, angularTolerance: 0.5 });
      })
    );
  });

  it('mesh sphere (fine)', async () => {
    results.push(
      await benchV7vsV8('mesh sphere (tol=0.01)', () => {
        const k = getKernel();
        const sph = k.makeSphere(10);
        k.mesh(sph, { tolerance: 0.01, angularTolerance: 0.1 });
      })
    );
  });

  afterAll(() => {
    printComparison(results);
    ALL.push(...results);
  });
});

describe('V7 vs V8: Measurement', () => {
  const results: ComparisonResult[] = [];

  it('volume ×100', async () => {
    results.push(
      await benchV7vsV8('volume ×100', () => {
        const k = getKernel();
        const box = k.makeBox(10, 10, 10);
        for (let i = 0; i < 100; i++) k.volume(box);
      })
    );
  });

  it('boundingBox ×100', async () => {
    results.push(
      await benchV7vsV8('boundingBox ×100', () => {
        const k = getKernel();
        const box = k.makeBox(10, 10, 10);
        for (let i = 0; i < 100; i++) k.boundingBox(box);
      })
    );
  });

  afterAll(() => {
    printComparison(results);
    ALL.push(...results);
  });
});

describe('V7 vs V8: I/O', () => {
  const results: ComparisonResult[] = [];

  it('exportSTEP ×10', async () => {
    results.push(
      await benchV7vsV8('exportSTEP ×10', () => {
        const k = getKernel();
        const box = k.makeBox(10, 10, 10);
        for (let i = 0; i < 10; i++) k.exportSTEP([box]);
      })
    );
  });

  afterAll(() => {
    printComparison(results);
    ALL.push(...results);
  });
});

describe('V7 vs V8: End-to-end', () => {
  const results: ComparisonResult[] = [];

  it('box + chamfer', async () => {
    results.push(
      await benchV7vsV8('box+chamfer', () => {
        const k = getKernel();
        const box = k.makeBox(20, 20, 20);
        const edges = k.iterShapes(box, 'edge');
        k.chamfer(box, edges, 1);
      })
    );
  });

  it('box + fillet', async () => {
    results.push(
      await benchV7vsV8('box+fillet', () => {
        const k = getKernel();
        const box = k.makeBox(20, 20, 20);
        const edges = k.iterShapes(box, 'edge');
        k.fillet(box, edges, 1);
      })
    );
  });

  it('multi-boolean model (4 holes)', async () => {
    results.push(
      await benchV7vsV8('multi-boolean model', () => {
        const k = getKernel();
        let result = k.makeBox(50, 50, 10);
        for (let x = -15; x <= 15; x += 10) {
          for (let y = -15; y <= 15; y += 10) {
            const hole = k.translate(k.makeCylinder(3, 20), x, y, -5);
            result = k.cut(result, hole);
          }
        }
      })
    );
  });

  afterAll(() => {
    printComparison(results);
    ALL.push(...results);
  });
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

afterAll(() => {
  console.log('\n========================================');
  console.log('  FULL V7 vs V8 COMPARISON SUMMARY');
  console.log('========================================');
  printComparison(ALL);
});
