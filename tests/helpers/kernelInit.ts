/**
 * Unified kernel initialisation for tests, benchmarks, and the agreement suite.
 *
 * Single init module replacing three separate paths.
 * Adding a new kernel requires a branch here in addition to a kernelRegistry entry.
 */

import { initFromManifold, initFromOC, registerKernel } from '@/kernel/index.js';
import { BrepkitAdapter } from '@/kernel/brepkit/brepkitAdapter.js';
import { OcctWasmAdapter } from '@/kernel/occtWasm/occtWasmAdapter.js';
import { kernelConfigs } from './kernelRegistry.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Emscripten instance
let _oc: any = null;
let _bkInitialized = false;
let _occtWasmInitialized = false;
let _manifoldInitialized = false;

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
    _available.push('brepkit');
  } else if (kernel === 'occt-wasm') {
    if (_occtWasmInitialized) return;
    _occtWasmInitialized = true;
    // occt-wasm npm package bundles the Emscripten module in its dist/
    const { resolve } = await import('node:path');
    // Locate the occt-wasm dist directory via the package's import resolution
    const occtWasmEntry = import.meta.resolve('occt-wasm');
    const { fileURLToPath, URL: UrlClass } = await import('node:url');
    const wasmDir = fileURLToPath(new UrlClass('.', occtWasmEntry));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Emscripten factory
    const { default: createOcctWasm }: any = await import(resolve(wasmDir, 'occt-wasm.js'));
    const Module = await createOcctWasm({
      locateFile: (p: string) => (p.endsWith('.wasm') ? resolve(wasmDir, 'occt-wasm.wasm') : p),
    });
    const k = new Module.OcctKernel();
    registerKernel('occt-wasm', new OcctWasmAdapter(Module, k));
    _available.push('occt-wasm');
  } else if (kernel === 'manifold') {
    if (_manifoldInitialized) return;
    _manifoldInitialized = true;
    const { initManifold } = await import('brepjs-manifold');
    const module = await initManifold();
    initFromManifold(module);
    _available.push('manifold');
  } else if (kernel === 'occt') {
    await initOCCT();
  } else {
    const known = kernelConfigs.map((k) => `"${k.id}"`).join(', ');
    throw new Error(`Unknown kernel: "${kernel}". Expected one of: ${known}.`);
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
  for (const { id } of kernelConfigs) {
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
