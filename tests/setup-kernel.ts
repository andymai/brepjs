/**
 * Kernel-agnostic test setup.
 *
 * Reads `TEST_KERNEL` env var (`"occt"` | `"brepkit"`, default `"occt"`) and
 * initialises the corresponding kernel as the default.  Used by the vitest
 * workspace so the full test suite can run against either backend.
 */

import { initFromOC, registerKernel } from '@/kernel/index.js';
import { BrepkitAdapter } from '@/kernel/brepkit/brepkitAdapter.js';

/** The active kernel id, derived from `TEST_KERNEL` env var (default `"occt"`). */
export const currentKernel: string = process.env['TEST_KERNEL'] ?? 'occt';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Emscripten instance
let _oc: any = null;
let _bkInitialized = false;

/**
 * Initialise whichever kernel `TEST_KERNEL` selects (default: occt).
 *
 * Safe to call multiple times — only the first call has an effect.
 */
export async function initKernel(): Promise<void> {
  const kernel = process.env['TEST_KERNEL'] ?? 'occt';

  if (kernel === 'brepkit') {
    if (_bkInitialized) return;
    _bkInitialized = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic WASM import
    const bk: any = await import('brepkit-wasm');
    if (typeof bk.default === 'function') await bk.default();
    const BrepKernel = bk.BrepKernel ?? bk.default?.BrepKernel;
    if (!BrepKernel) throw new Error('brepkit-wasm: could not resolve BrepKernel constructor');
    registerKernel('brepkit', new BrepkitAdapter(new BrepKernel()));
  } else if (kernel === 'occt') {
    await initOCCT();
  } else {
    throw new Error(`Unknown TEST_KERNEL value: "${kernel}". Expected "occt" or "brepkit".`);
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
        return new URL('../packages/brepjs-opencascade/src/brepjs_single.wasm', import.meta.url)
          .pathname;
      }
      return fileName;
    },
  });

  initFromOC(_oc);
  return _oc;
}
