/**
 * Vitest setup — re-exports from setup-kernel.ts.
 *
 * `initKernel()` initialises the kernel `TEST_KERNEL` selects (occt-wasm by
 * default). `initOCCT()` always initialises opencascade.js and makes it the
 * default, so only tests that need that adapter should call it.
 */

export { currentKernel, initKernel, initOCCT } from './setup-kernel.js';
