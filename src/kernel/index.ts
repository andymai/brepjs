import type { KernelAdapter, OpenCascadeInstance } from './types.js';
import { OCCTAdapter } from './occtAdapter.js';

let _kernel: KernelAdapter | null = null;

export function getKernel(): KernelAdapter {
  if (!_kernel) {
    throw new Error(
      'brepjs kernel not initialized. Call initFromOC() or setOC() before using the library.'
    );
  }
  return _kernel;
}

export function initFromOC(oc: OpenCascadeInstance): void {
  _kernel = new OCCTAdapter(oc);
}

export type {
  KernelAdapter,
  KernelMeshResult,
  OpenCascadeInstance,
  BooleanOptions,
  ShapeType,
  MeshOptions,
  OcShape,
  OcType,
} from './types.js';
