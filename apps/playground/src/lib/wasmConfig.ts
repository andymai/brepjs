/**
 * Shared WASM configuration constants.
 */

/** Cache name for WASM files (used by preloader and worker) */
export const WASM_CACHE_NAME = 'brepjs-wasm-v2-occt-wasm';

/** WASM files to preload and serve */
export const WASM_FILES = [
  'occt-wasm.js',
  'occt-wasm.wasm',
] as const;
