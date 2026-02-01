/**
 * Backward-compatible setOC/getOC shim.
 * Delegates to the kernel singleton.
 */

import type { OpenCascadeInstance } from './kernel/types.js';
import { getKernel, initFromOC } from './kernel/index.js';

export const setOC = (oc: OpenCascadeInstance): void => {
  initFromOC(oc);
};

export const getOC = (): OpenCascadeInstance => {
  return getKernel().oc;
};
