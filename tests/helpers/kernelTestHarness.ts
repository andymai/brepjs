/**
 * Cross-kernel test harness for running tests against both OCCT and brepkit.
 *
 * Usage:
 * ```ts
 * import { initAllKernels, forEachKernel, expectClose } from './helpers/kernelTestHarness.js';
 *
 * beforeAll(async () => { await initAllKernels(); }, 30000);
 *
 * forEachKernel((kernelId, getAdapter) => {
 *   describe(`${kernelId}: volume`, () => {
 *     it('box volume', () => {
 *       const k = getAdapter();
 *       const box = k.makeBox(2, 3, 4);
 *       expectClose(k.volume(box), 24, 1e-4);
 *     });
 *   });
 * });
 * ```
 */

import { initFromOC, getKernel, registerKernel } from '../../src/kernel/index.js';
import type { KernelAdapter } from '../../src/kernel/types.js';
import { BrepkitAdapter } from '../../src/kernel/brepkitAdapter.js';
import { expect } from 'vitest';

export type KernelId = 'occt' | 'brepkit';
export type ThemeKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';

const adapters: Partial<Record<KernelId, KernelAdapter>> = {};

/** Initialize all available kernels. Call in beforeAll. */
export async function initAllKernels(): Promise<void> {
  // OCCT
  try {
    const { default: initOpenCascade } = await import('brepjs-opencascade/src/brepjs_single.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Emscripten factory type
    const oc: any = await initOpenCascade({
      locateFile: (fileName: string) => {
        if (fileName.endsWith('.wasm')) {
          return new URL(
            '../../packages/brepjs-opencascade/src/brepjs_single.wasm',
            import.meta.url
          ).pathname;
        }
        return fileName;
      },
    });
    initFromOC(oc);
    adapters.occt = getKernel();
  } catch {
    console.warn('[test] OCCT WASM not available — OCCT tests will be skipped');
  }

  // brepkit
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM module type
    const brepkitWasm: any = await import('brepkit-wasm');
    // wasm-pack nodejs target: default may be a WASM init function or a re-export object
    if (typeof brepkitWasm.default === 'function') {
      await brepkitWasm.default();
    }
    const BK = brepkitWasm.BrepKernel;
    if (!BK) throw new Error('BrepKernel not found in brepkit-wasm module');
    const bk = new BK();
    const adapter = new BrepkitAdapter(bk);
    registerKernel('brepkit', adapter);
    adapters.brepkit = adapter;
  } catch (e: unknown) {
    console.warn('[test] brepkit WASM not available — brepkit tests will be skipped');
    console.warn('[test] brepkit init error:', e);
  }
}

/** Get the adapter for a kernel, or null if not available. */
export function getAdapter(id: KernelId): KernelAdapter | null {
  return adapters[id] ?? null;
}

/** Check if a kernel is available. */
export function hasKernel(id: KernelId): boolean {
  return id in adapters;
}

/** Available kernel IDs. */
export function availableKernels(): KernelId[] {
  return Object.keys(adapters) as KernelId[];
}

/**
 * Run a test block for each available kernel.
 * The callback receives the kernel ID and a getter for the adapter.
 */
export function forEachKernel(
  callback: (kernelId: KernelId, getAdapter: () => KernelAdapter) => void
): void {
  for (const id of ['occt', 'brepkit'] as const) {
    callback(id, () => {
      const adapter = adapters[id];
      if (!adapter) {
        throw new Error(`Kernel '${id}' not initialized`);
      }
      return adapter;
    });
  }
}

/**
 * Skip a test for a specific kernel and theme.
 * Use at the top of a test to mark known limitations.
 */
export function skipForKernel(
  current: KernelId,
  target: KernelId,
  theme: ThemeKey,
  reason?: string
): void {
  if (current === target) {
    const msg = reason ?? `Skipped for ${target} (Theme ${theme} not yet implemented)`;
    // Use expect.fail approach to skip — Vitest doesn't have a clean skip-from-inside-test
    console.warn(`[skip] ${msg}`);
    return;
  }
}

/**
 * Assert a value is close to expected within tolerance.
 * Supports both relative and absolute tolerance.
 */
export function expectClose(actual: number, expected: number, relTol = 1e-4, absTol = 1e-10): void {
  const diff = Math.abs(actual - expected);
  const tol = Math.max(absTol, Math.abs(expected) * relTol);
  expect(diff).toBeLessThanOrEqual(tol);
}

/**
 * Compare values from two kernels and assert they agree within tolerance.
 */
export function expectKernelsAgree(
  valA: number,
  valB: number,
  label: string,
  relTol = 1e-4,
  absTol = 1e-10
): void {
  const diff = Math.abs(valA - valB);
  const ref = Math.max(Math.abs(valA), Math.abs(valB));
  const tol = Math.max(absTol, ref * relTol);
  expect(
    diff,
    `Cross-kernel disagreement on ${label}: OCCT=${valA}, brepkit=${valB}, diff=${diff}, tol=${tol}`
  ).toBeLessThanOrEqual(tol);
}
