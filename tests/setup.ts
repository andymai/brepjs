/**
 * Vitest setup — WASM initialization.
 * Initializes brepjs-opencascade for integration tests.
 */

import { setOC } from '../src/oclib.js';

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

  setOC(oc);
  return oc;
}
