/**
 * Backward-compatible setOC/getOC shim.
 * Delegates to the kernel singleton.
 */

import type { OpenCascadeInstance } from './kernel/types.js';
import { getKernel, initFromOC } from './kernel/index.js';

/**
 * Set the OpenCascade WASM instance (backward-compatible shim).
 *
 * @see {@link initFromOC} — the preferred kernel initialisation API.
 */
export const setOC = (oc: OpenCascadeInstance): void => {
  initFromOC(oc);
};

/**
 * Return the raw OpenCascade WASM instance (backward-compatible shim).
 *
 * @see {@link getKernel} — the preferred kernel access API.
 */
export const getOC = (): OpenCascadeInstance => {
  return getKernel().oc;
};
