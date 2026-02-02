import type { KernelAdapter, OpenCascadeInstance } from './types.js';
import { OCCTAdapter } from './occtAdapter.js';
import { bug } from '../core/errors.js';

let _kernel: KernelAdapter | null = null;

export function setKernel(kernel: KernelAdapter): void {
  _kernel = kernel;
}

export function getKernel(): KernelAdapter {
  if (!_kernel) {
    bug('kernel', 'Kernel has not been initialized. Call setKernel() or initFromOC() first.');
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
