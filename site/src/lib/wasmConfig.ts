/**
 * Shared WASM configuration constants.
 */

/** Cache name for WASM files (used by preloader and worker) */
export const WASM_CACHE_NAME = 'brepjs-wasm-v1';

/** WASM files to preload and serve */
export const WASM_FILES = [
  'brepjs_threaded.js',
  'brepjs_threaded.wasm',
  'brepjs_threaded.worker.js',
] as const;
