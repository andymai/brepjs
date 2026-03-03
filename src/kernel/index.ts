import type { KernelAdapter, KernelInstance } from './types.js';
import type { Kernel2DCapability } from './kernel2dTypes.js';
import { supportsKernel2D } from './kernel2dTypes.js';
import { DefaultAdapter } from './defaultAdapter.js';

// ---------------------------------------------------------------------------
// Kernel registry — supports multiple kernels for gradual migration
// ---------------------------------------------------------------------------

const _kernels = new Map<string, KernelAdapter>();
let _defaultKernelId: string | null = null;

/**
 * Register a kernel adapter under a unique identifier.
 * The first registered kernel becomes the default.
 */
export function registerKernel(id: string, adapter: KernelAdapter): void {
  _kernels.set(id, adapter);
  if (!_defaultKernelId) _defaultKernelId = id;
}

/**
 * Return a kernel adapter by id, or the default kernel if no id is given.
 *
 * @throws If no kernel has been registered via {@link registerKernel} or {@link initFromOC}.
 */
export function getKernel(id?: string): KernelAdapter {
  const targetId = id ?? _defaultKernelId;
  if (!targetId) {
    throw new Error(
      'brepjs kernel not initialized. Call initFromOC() or registerKernel() before using the library.'
    );
  }
  const kernel = _kernels.get(targetId);
  if (!kernel) {
    throw new Error(`brepjs: kernel '${targetId}' is not registered.`);
  }
  return kernel;
}

/**
 * Return the default kernel narrowed to {@link Kernel2DCapability}.
 *
 * @throws If the kernel does not support 2D operations.
 */
export function getKernel2D(id?: string): KernelAdapter & Kernel2DCapability {
  const kernel = getKernel(id);
  if (!supportsKernel2D(kernel)) {
    throw new Error('brepjs: current kernel does not support 2D operations.');
  }
  return kernel;
}

/**
 * Run a **synchronous** function with a specific kernel as the default,
 * then restore the previous default.
 *
 * **Warning**: Do NOT pass an async function — the kernel override is
 * restored synchronously in `finally`, so any `getKernel()` call after
 * the first `await` inside `fn` would observe the wrong kernel.
 */
export function withKernel<T extends Exclude<unknown, Promise<unknown>>>(
  id: string,
  fn: () => T
): T {
  const prev = _defaultKernelId;
  _defaultKernelId = id;
  try {
    return fn();
  } finally {
    _defaultKernelId = prev;
  }
}

/** Initialise the brepjs kernel from a loaded WASM instance. */
export function initFromOC(oc: KernelInstance): void {
  const adapter = new DefaultAdapter(oc);
  registerKernel('occt', adapter);
  _defaultKernelId = 'occt';
}

export type {
  KernelAdapter,
  KernelMeshResult,
  DistanceResult,
  KernelInstance,
  KernelInstance as OpenCascadeInstance,
  BooleanOptions,
  ShapeType,
  SurfaceType,
  ShapeOrientation,
  MeshOptions,
  KernelShape,
  KernelType,
  StepAssemblyPart,
  ShapeEvolution,
  OperationResult,
} from './types.js';

export { supportsProjection } from './types.js';
export type { ProjectionCapability } from './types.js';

export { supportsKernel2D } from './kernel2dTypes.js';
export type { Kernel2DCapability, Curve2dHandle, BBox2dHandle } from './kernel2dTypes.js';

export { BrepkitAdapter } from './brepkitAdapter.js';
export type { BrepkitHandle } from './brepkitAdapter.js';
