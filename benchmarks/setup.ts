/**
 * Shared benchmark setup — initialises kernels via the unified init module.
 *
 * All benchmark files should import from here instead of duplicating init logic.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initKernel,
  initAllKernels,
  getAvailableKernels,
} from '../tests/helpers/kernelInit.js';
import { createMultiKernelBench } from './harness.js';

/** Whether brepkit kernel is available. */
export function hasBrepkit(): boolean {
  return getAvailableKernels().includes('brepkit');
}

/**
 * Initialise kernels for benchmarks.
 *
 * Reads `BENCH_KERNELS` env var:
 * - `'all'` or `'both'` → initialise all available kernels
 * - otherwise → treat as a kernel id (defaults to `'occt'`)
 *
 * Keeps `npm run bench` fast (OCCT-only by default).
 */
export async function initBenchKernels(): Promise<void> {
  const mode = process.env['BENCH_KERNELS'] ?? 'occt';
  if (mode === 'all' || mode === 'both') {
    await initAllKernels();
  } else {
    await initKernel(mode);
  }
}

/**
 * @deprecated Use `initBenchKernels` instead.
 */
export const initBothKernels = initBenchKernels;

/** Pre-configured multi-kernel bench helpers. */
export const { benchBoth, benchKernel } = createMultiKernelBench(
  () => getAvailableKernels()
);

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
