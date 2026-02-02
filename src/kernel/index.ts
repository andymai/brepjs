import type { KernelAdapter, OpenCascadeInstance } from './types.js';
import { OCCTAdapter } from './occtAdapter.js';
import { bug } from '../utils/bug.js';

let _kernel: KernelAdapter | null = null;

export function getKernel(): KernelAdapter {
  if (!_kernel) {
    bug('kernel', 'Kernel has not been initialized. Call initFromOC() first.');
  }
  return _kernel;
}

export function initFromOC(oc: OpenCascadeInstance): void {
  _kernel = new OCCTAdapter(oc);
}

export type {
  KernelAdapter,
  OpenCascadeInstance,
  BooleanOptions,
  ShapeType,
  MeshOptions,
  OcShape,
  OcType,
} from './types.js';
