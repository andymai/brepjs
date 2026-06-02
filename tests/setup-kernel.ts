/**
 * Kernel-agnostic test setup — delegates to helpers/kernelInit.ts.
 *
 * Reads `TEST_KERNEL` env var (`"occt"` | `"brepkit"` | `"occt-wasm"`, default
 * `"occt-wasm"` — the shipped default kernel) and initialises the corresponding
 * kernel as the default.
 */

import { defaultKernelId } from './helpers/kernelRegistry.js';

export { initKernel, initOCCT } from './helpers/kernelInit.js';

/** The active kernel id, derived from `TEST_KERNEL` env var (default `"occt-wasm"`). */
export const currentKernel: string = process.env['TEST_KERNEL'] ?? defaultKernelId();
