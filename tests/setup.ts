/**
 * Vitest setup — re-exports from setup-kernel.ts.
 *
 * Backward-compatible: `initOC` is an alias for `initOCCT`.
 */

export { initKernel, initOCCT, initOCCT as initOC } from './setup-kernel.js';
