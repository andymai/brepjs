import type { KernelAdapter, OpenCascadeInstance } from './types.js';
import { OCCTAdapter } from './occtAdapter.js';

let _kernel: KernelAdapter | null = null;

/**
 * Return the singleton kernel adapter.
 *
 * @throws If the kernel has not been initialised via {@link initFromOC}.
 */
export function getKernel(): KernelAdapter {
  if (!_kernel) {
    throw new Error(
      'brepjs kernel not initialized. Call initFromOC() or setOC() before using the library.'
    );
  }
  return _kernel;
}

/** Initialise the brepjs kernel from a loaded OpenCascade WASM instance. */
export function initFromOC(oc: OpenCascadeInstance): void {
  _kernel = new OCCTAdapter(oc);
}

export type {
  KernelAdapter,
  KernelMeshResult,
  DistanceResult,
  OpenCascadeInstance,
  BooleanOptions,
  ShapeType,
  MeshOptions,
  OcShape,
  OcType,
} from './types.js';
