/**
 * V7 vs V8 OCCT apples-to-apples benchmark.
 *
 * Loads both WASM binaries in the same process and runs identical operations
 * through each kernel, producing a direct comparison.
 *
 * ## Running
 *
 * ```bash
 * # V8 WASM must be available at OCCT_V8_PATH (or default ../brepjs-occt-v8/...)
 * npx vitest run benchmarks/v7-vs-v8.bench.test.ts
 * ```
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { registerKernel, withKernel, getKernel } from '../src/kernel/index.js';
import { DefaultAdapter } from '../src/kernel/occt/defaultAdapter.js';
import { initOCCT } from '../tests/setup-kernel.js';
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
// Init helpers
// ---------------------------------------------------------------------------

const __dir = path.dirname(fileURLToPath(import.meta.url));

async function initV8Kernel(): Promise<void> {
  const v8Base =
    process.env['OCCT_V8_PATH'] ??
    path.resolve(__dir, '../../brepjs-occt-v8/packages/brepjs-opencascade/src');

  const jsPath = path.resolve(v8Base, 'brepjs_single.js');
  const wasmPath = path.resolve(v8Base, 'brepjs_single.wasm');

  // Dynamic import of the V8 Emscripten module factory
  const mod = await import(jsPath);
  const initV8 = mod.default ?? mod;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Emscripten factory
  const oc: any = await initV8({
    locateFile: (fileName: string) => {
      if (fileName.endsWith('.wasm')) return wasmPath;
      return fileName;
    },
  });

  registerKernel('occt-v8', new DefaultAdapter(oc));
}

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
  // Init V7 (the default bundled OCCT)
  const ocV7 = await initOCCT();

  // Re-register V7 under explicit name
  registerKernel('occt-v7', new DefaultAdapter(ocV7));

  // Init V8 from separate WASM build
  await initV8Kernel();

  // Prewarm both kernels (first call has JIT penalty)
  withKernel('occt-v7', () => getKernel().makeBox(1, 1, 1));
  withKernel('occt-v8', () => getKernel().makeBox(1, 1, 1));

  console.log('[v7-vs-v8] Both kernels loaded and prewarmed');
}, 60000);

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
