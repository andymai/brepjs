/**
 * Vitest setup — WASM initialization.
 * Initializes brepjs-opencascade for integration tests.
 */

import { initFromOC } from '../src/kernel/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Emscripten factory type
let oc: any = null;

export async function initOC() {
  if (oc) return oc;

  const { default: initOpenCascade } = await import('brepjs-opencascade/src/brepjs_single.js');
  oc = await initOpenCascade({
    locateFile: (fileName: string) => {
      if (fileName.endsWith('.wasm')) {
        return new URL('../packages/brepjs-opencascade/src/brepjs_single.wasm', import.meta.url)
          .pathname;
      }
      return fileName;
    },
  });

  initFromOC(oc);
  return oc;
}
