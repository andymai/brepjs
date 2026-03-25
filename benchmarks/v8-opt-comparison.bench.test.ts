/**
 * 3-way benchmark: V7 (-Os) vs V8 (-O3+LTO) vs V8 (-Os+LTO).
 *
 * Loads three WASM binaries in the same process for a controlled comparison.
 *
 * ## Running
 *
 * ```bash
 * OCCT_V8_O3_PATH=/tmp/v8-optimized-build \
 * OCCT_V8_OS_PATH=/tmp/v8-Os-build \
 * npx vitest run benchmarks/v8-opt-comparison.bench.test.ts --config vitest.bench.config.ts
 * ```
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { registerKernel, withKernel, getKernel } from '../src/kernel/index.js';
import { DefaultAdapter } from '../src/kernel/occt/defaultAdapter.js';
import { initOCCT } from '../tests/setup-kernel.js';
import { bench, type BenchResult } from './harness.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));

type KernelId = 'v7' | 'v8-O3' | 'v8-Os';
const KERNELS: KernelId[] = ['v7', 'v8-O3', 'v8-Os'];

interface TriResult {
  name: string;
  results: Record<KernelId, BenchResult>;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function loadOCCTKernel(id: string, basePath: string): Promise<void> {
  const jsPath = path.resolve(basePath, 'brepjs_single.js');
  const wasmPath = path.resolve(basePath, 'brepjs_single.wasm');
  const mod = await import(jsPath);
  const init = mod.default ?? mod;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Emscripten factory
  const oc: any = await init({
    locateFile: (f: string) => (f.endsWith('.wasm') ? wasmPath : f),
  });
  registerKernel(id, new DefaultAdapter(oc));
}

beforeAll(async () => {
  // V7 — bundled
  const ocV7 = await initOCCT();
  registerKernel('v7', new DefaultAdapter(ocV7));

  // V8 -O3+LTO
  const o3Path =
    process.env['OCCT_V8_O3_PATH'] ?? path.resolve(__dir, '../../brepjs-occt-v8/packages/brepjs-opencascade/src');
  await loadOCCTKernel('v8-O3', o3Path);

  // V8 -Os+LTO
  const osPath = process.env['OCCT_V8_OS_PATH'] ?? '/tmp/v8-Os-build';
  await loadOCCTKernel('v8-Os', osPath);

  // Prewarm all three
  for (const id of KERNELS) {
    withKernel(id, () => getKernel().makeBox(1, 1, 1));
  }
  console.log('[3-way] All kernels loaded and prewarmed');
}, 90000);

// ---------------------------------------------------------------------------
// Bench helper
// ---------------------------------------------------------------------------

async function bench3(
  name: string,
  fn: () => void,
  opts?: { warmup?: number; iterations?: number }
): Promise<TriResult> {
  const results = {} as Record<KernelId, BenchResult>;
  for (const id of KERNELS) {
    results[id] = await bench(`[${id}] ${name}`, () => withKernel(id, fn), opts);
  }
  return { name, results };
}

function printTriComparison(rows: TriResult[]): void {
  console.log(
    '\n| Benchmark | V7 -Os (ms) | V8 -O3 (ms) | V8 -Os (ms) | V8-O3 vs V7 | V8-Os vs V7 |'
  );
  console.log(
    '|-----------|-------------|-------------|-------------|-------------|-------------|'
  );
  for (const r of rows) {
    const v7 = r.results['v7'].median;
    const o3 = r.results['v8-O3'].median;
    const os = r.results['v8-Os'].median;
    const pctO3 = ((o3 - v7) / v7) * 100;
    const pctOs = ((os - v7) / v7) * 100;
    const fmtPct = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(0)}%`;
    console.log(
      `| ${r.name} | ${v7.toFixed(1)} | ${o3.toFixed(1)} | ${os.toFixed(1)} | ${fmtPct(pctO3)} | ${fmtPct(pctOs)} |`
    );
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Workloads (same as kernel-comparison)
// ---------------------------------------------------------------------------

const ALL: TriResult[] = [];

describe('Primitives', () => {
  const rows: TriResult[] = [];
  it('makeBox ×100', async () => { rows.push(await bench3('makeBox ×100', () => { const k = getKernel(); for (let i = 0; i < 100; i++) k.makeBox(10, 20, 30); })); });
  it('makeCylinder ×100', async () => { rows.push(await bench3('makeCylinder ×100', () => { const k = getKernel(); for (let i = 0; i < 100; i++) k.makeCylinder(5, 20); })); });
  it('makeSphere ×100', async () => { rows.push(await bench3('makeSphere ×100', () => { const k = getKernel(); for (let i = 0; i < 100; i++) k.makeSphere(10); })); });
  afterAll(() => { printTriComparison(rows); ALL.push(...rows); });
});

describe('Booleans', () => {
  const rows: TriResult[] = [];
  it('fuse ×10', async () => { rows.push(await bench3('fuse(box,box) ×10', () => { const k = getKernel(); for (let i = 0; i < 10; i++) { const a = k.makeBox(10,10,10); const b = k.translate(k.makeBox(5,5,5),5,5,5); k.fuse(a,b); } })); });
  it('cut ×10', async () => { rows.push(await bench3('cut(box,cyl) ×10', () => { const k = getKernel(); for (let i = 0; i < 10; i++) { const box = k.makeBox(10,10,10); const cyl = k.makeCylinder(3,20); k.cut(box,cyl); } })); });
  it('intersect ×10', async () => { rows.push(await bench3('intersect(box,sph) ×10', () => { const k = getKernel(); for (let i = 0; i < 10; i++) { const box = k.makeBox(10,10,10); const sph = k.makeSphere(8); k.intersect(box,sph); } })); });
  afterAll(() => { printTriComparison(rows); ALL.push(...rows); });
});

describe('Transforms', () => {
  const rows: TriResult[] = [];
  it('translate ×1000', async () => { rows.push(await bench3('translate ×1000', () => { const k = getKernel(); let s = k.makeBox(1,1,1); for (let i = 0; i < 1000; i++) s = k.translate(s,0.01,0,0); })); });
  it('rotate ×100', async () => { rows.push(await bench3('rotate ×100', () => { const k = getKernel(); let s = k.makeBox(5,5,5); for (let i = 0; i < 100; i++) s = k.rotate(s,3.6,[0,0,1]); })); });
  afterAll(() => { printTriComparison(rows); ALL.push(...rows); });
});

describe('Meshing', () => {
  const rows: TriResult[] = [];
  it('mesh box', async () => { rows.push(await bench3('mesh box (tol=0.1)', () => { const k = getKernel(); k.mesh(k.makeBox(10,10,10), {tolerance:0.1, angularTolerance:0.5}); })); });
  it('mesh sphere', async () => { rows.push(await bench3('mesh sphere (tol=0.01)', () => { const k = getKernel(); k.mesh(k.makeSphere(10), {tolerance:0.01, angularTolerance:0.1}); })); });
  afterAll(() => { printTriComparison(rows); ALL.push(...rows); });
});

describe('Measurement', () => {
  const rows: TriResult[] = [];
  it('volume ×100', async () => { rows.push(await bench3('volume ×100', () => { const k = getKernel(); const b = k.makeBox(10,10,10); for (let i = 0; i < 100; i++) k.volume(b); })); });
  it('bbox ×100', async () => { rows.push(await bench3('boundingBox ×100', () => { const k = getKernel(); const b = k.makeBox(10,10,10); for (let i = 0; i < 100; i++) k.boundingBox(b); })); });
  afterAll(() => { printTriComparison(rows); ALL.push(...rows); });
});

describe('I/O', () => {
  const rows: TriResult[] = [];
  it('exportSTEP ×10', async () => { rows.push(await bench3('exportSTEP ×10', () => { const k = getKernel(); const b = k.makeBox(10,10,10); for (let i = 0; i < 10; i++) k.exportSTEP([b]); })); });
  afterAll(() => { printTriComparison(rows); ALL.push(...rows); });
});

describe('End-to-end', () => {
  const rows: TriResult[] = [];
  it('box+chamfer', async () => { rows.push(await bench3('box+chamfer', () => { const k = getKernel(); const b = k.makeBox(20,20,20); k.chamfer(b, k.iterShapes(b,'edge'), 1); })); });
  it('box+fillet', async () => { rows.push(await bench3('box+fillet', () => { const k = getKernel(); const b = k.makeBox(20,20,20); k.fillet(b, k.iterShapes(b,'edge'), 1); })); });
  it('multi-boolean', async () => { rows.push(await bench3('multi-boolean', () => { const k = getKernel(); let r = k.makeBox(50,50,10); for (let x = -15; x <= 15; x += 10) for (let y = -15; y <= 15; y += 10) r = k.cut(r, k.translate(k.makeCylinder(3,20),x,y,-5)); })); });
  afterAll(() => { printTriComparison(rows); ALL.push(...rows); });
});

afterAll(() => {
  console.log('\n========================================');
  console.log('  3-WAY COMPARISON SUMMARY');
  console.log('  V7(-Os,emsdk3.1.14) vs V8(-O3+LTO) vs V8(-Os+LTO)');
  console.log('  Binary sizes: V7=19.2MB  V8-O3=27.1MB  V8-Os=16.9MB');
  console.log('========================================');
  printTriComparison(ALL);
});
