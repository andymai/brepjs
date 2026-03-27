/**
 * Unified kernel initialisation for tests, benchmarks, and the agreement suite.
 *
 * Single init module replacing three separate paths.
 * Adding a new kernel requires a branch here in addition to a kernelRegistry entry.
 */

import { initFromOC, registerKernel } from '@/kernel/index.js';
import { BrepkitAdapter } from '@/kernel/brepkit/brepkitAdapter.js';
import { OcctWasmAdapter } from '@/kernel/occtWasm/occtWasmAdapter.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Emscripten instance
let _oc: any = null;
let _bkInitialized = false;
let _occtWasmInitialized = false;

const _available: string[] = [];

/**
 * Initialise whichever kernel `id` selects (defaults to `TEST_KERNEL` env, then `"occt"`).
 *
 * Safe to call multiple times — only the first call per kernel has an effect.
 */
export async function initKernel(id?: string): Promise<void> {
  const kernel = id ?? process.env['TEST_KERNEL'] ?? 'occt';

  if (kernel === 'brepkit') {
    if (_bkInitialized) return;
    _bkInitialized = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic WASM import
    const bk: any = await import('brepkit-wasm');
    if (typeof bk.default === 'function') await bk.default();
    const BrepKernel = bk.BrepKernel ?? bk.default?.BrepKernel;
    if (!BrepKernel) throw new Error('brepkit-wasm: could not resolve BrepKernel constructor');
    registerKernel('brepkit', new BrepkitAdapter(new BrepKernel()));
    if (!_available.includes('brepkit')) _available.push('brepkit');
  } else if (kernel === 'occt-wasm') {
    if (_occtWasmInitialized) return;
    _occtWasmInitialized = true;
    const pathMod = await import('node:path');
    const wasmDir = pathMod.resolve(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Emscripten dirname
      (import.meta as any).dirname ?? process.cwd(),
      '../../occt-wasm/dist'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic WASM import
    const mod: any = await import(pathMod.join(wasmDir, 'occt-wasm.js'));
    const createOcctWasm = mod.default;
    const Module = await createOcctWasm({
      locateFile: (p: string) =>
        p.endsWith('.wasm') ? pathMod.join(wasmDir, 'occt-wasm.wasm') : p,
    });
    const k = new Module.OcctKernel();
    registerKernel('occt-wasm', new OcctWasmAdapter(Module, k));
    if (!_available.includes('occt-wasm')) _available.push('occt-wasm');
  } else if (kernel === 'occt') {
    await initOCCT();
  } else {
    throw new Error(`Unknown kernel: "${kernel}". Expected "occt", "brepkit", or "occt-wasm".`);
  }
}

/**
 * Initialise and return the raw OCCT (`oc`) instance.
 *
 * For OCCT-only tests that need direct access to `oc.gp_Pnt_3()` etc.
 * Also ensures the OCCT kernel is registered.  Safe to call multiple times.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Emscripten instance
export async function initOCCT(): Promise<any> {
  if (_oc) return _oc;

  const { default: initOpenCascade } = await import('brepjs-opencascade/src/brepjs_single.js');
  _oc = await initOpenCascade({
    locateFile: (fileName: string) => {
      if (fileName.endsWith('.wasm')) {
        return new URL('../../packages/brepjs-opencascade/src/brepjs_single.wasm', import.meta.url)
          .pathname;
      }
      return fileName;
    },
  });

  initFromOC(_oc);
  if (!_available.includes('occt')) _available.push('occt');
  return _oc;
}

/**
 * Initialise all available kernels (for agreement suite, benchmarks).
 *
 * Uses try/catch to gracefully skip unavailable kernels.
 * Returns the list of successfully loaded kernel ids.
 */
export async function initAllKernels(): Promise<string[]> {
  const results: string[] = [];
  for (const id of ['occt', 'brepkit']) {
    try {
      await initKernel(id);
      results.push(id);
    } catch {
      console.warn(`[kernel-init] ${id} not available — skipping`);
    }
  }
  return results;
}

/** Returns kernel ids that have been successfully loaded. */
export function getAvailableKernels(): string[] {
  return [..._available];
}
