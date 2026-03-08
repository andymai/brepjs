/**
 * Shared benchmark setup — initialises both OCCT and brepkit kernels.
 *
 * All benchmark files should import from here instead of duplicating init logic.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initOC } from '../tests/setup.js';
import { registerKernel } from '../src/kernel/index.js';
import { BrepkitAdapter } from '../src/kernel/brepkitAdapter.js';
import { createDualKernelBench } from './harness.js';

let _hasBrepkit = false;

/** Whether brepkit kernel is available. */
export function hasBrepkit(): boolean {
  return _hasBrepkit;
}

/**
 * Initialise OCCT and optionally brepkit kernels.
 *
 * brepkit is only loaded when `BENCH_KERNELS=both` or `BENCH_KERNELS=brepkit`
 * is set, keeping `npm run bench` fast (OCCT-only by default).
 */
export async function initBothKernels(): Promise<void> {
  // Always init OCCT
  await initOC();

  const kernelMode = process.env.BENCH_KERNELS ?? 'occt';
  if (kernelMode !== 'both' && kernelMode !== 'brepkit') return;

  // Try to init brepkit
  try {
    const brepkitWasm = await import('brepkit-wasm');
    if (typeof brepkitWasm.default === 'function') {
      await brepkitWasm.default();
    }
    const BrepKernel = brepkitWasm.BrepKernel ?? brepkitWasm.default?.BrepKernel;
    const kernel = new BrepKernel();
    registerKernel('brepkit', new BrepkitAdapter(kernel));
    _hasBrepkit = true;
    console.log('[benchmark] brepkit WASM loaded successfully');
  } catch {
    console.log('[benchmark] brepkit WASM not available — brepkit benchmarks will be skipped');
  }
}

/** Pre-configured dual-kernel bench helpers. */
export const { benchBoth, benchKernel } = createDualKernelBench(() => _hasBrepkit);

/** Read brepkit-wasm version from package.json. */
export function getBrepkitVersion(): string {
  try {
    const dir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(dir, '../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
    const deps = pkg.dependencies as Record<string, string> | undefined;
    const devDeps = pkg.devDependencies as Record<string, string> | undefined;
    return deps?.['brepkit-wasm'] ?? devDeps?.['brepkit-wasm'] ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
