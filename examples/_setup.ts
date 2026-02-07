/**
 * Shared WASM initialization for all examples.
 *
 * Import this file as the first import in any example to auto-initialize
 * the OpenCascade kernel:
 *
 *   import './_setup.js';
 *
 * Uses top-level await so the kernel is ready before any other code runs.
 */

import { initFromOC } from 'brepjs';

const { default: initOpenCascade } = await import('brepjs-opencascade');
const oc = await initOpenCascade({
  locateFile: (fileName: string) => {
    if (fileName.endsWith('.wasm')) {
      return new URL(
        '../packages/brepjs-opencascade/src/brepjs_single.wasm',
        import.meta.url
      ).pathname;
    }
    return fileName;
  },
});
initFromOC(oc);
