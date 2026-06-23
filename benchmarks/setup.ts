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
 * - a comma-separated list (e.g. `'occt,brepkit'`) → initialise just those
 * - otherwise → treat as a single kernel id (defaults to `'occt'`)
 *
 * Keeps `npm run bench` fast (OCCT-only by default).
 */
export async function initBenchKernels(): Promise<void> {
  const mode = (process.env['BENCH_KERNELS'] ?? 'occt').trim();
  if (mode === 'all' || mode === 'both') {
    await initAllKernels();
    return;
  }

  const ids = [...new Set(mode.split(',').map((s) => s.trim()).filter(Boolean))];
  if (ids.length === 0) {
    throw new Error(
      'BENCH_KERNELS is empty — set a kernel id, a comma-separated list, or "all"/"both".'
    );
  }
  if (ids.length === 1) {
    // Single kernel: surface a typo loudly rather than silently running nothing.
    await initKernel(ids[0]!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    return;
  }
  // Subset: skip unavailable optional kernels, matching initAllKernels.
  for (const id of ids) {
    try {
      await initKernel(id);
    } catch {
      console.warn(`[kernel-init] ${id} not available — skipping`);
    }
  }
  // Base the guard on what actually registered, not on whether init threw:
  // initKernel can return early after a failed first attempt, so a "did not
  // throw" count would be misleading. Fail loudly instead of producing an
  // empty report at exit 0.
  const ready = ids.filter((id) => getAvailableKernels().includes(id));
  if (ready.length === 0) {
    throw new Error(
      `BENCH_KERNELS subset [${ids.join(', ')}] initialized no kernels — all were unavailable.`
    );
  }
  // The report's "vs occt" column needs the native occt baseline; warn when a
  // subset omits it so the empty comparison column isn't a surprise.
  if (!ready.includes('occt')) {
    console.warn(
      '[kernel-init] subset has no "occt" baseline — the report\'s "vs occt" column will be empty.'
    );
  }
}

/**
 * @deprecated Use `initBenchKernels` instead.
 */
export const initBothKernels = initBenchKernels;

/** Pre-configured multi-kernel bench helpers. */
export const { benchBoth, benchAll, benchKernel } = createMultiKernelBench(
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
