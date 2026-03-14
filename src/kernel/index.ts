import type { KernelAdapter, KernelInstance } from './types.js';
import type { Kernel2DCapability } from './kernel2dTypes.js';
import { supportsKernel2D } from './kernel2dTypes.js';
import { DefaultAdapter } from './defaultAdapter.js';
import { resetMeasureDetectionCache } from './measureOps.js';
import { resetTransformDetectionCache } from './transformOps.js';

// ---------------------------------------------------------------------------
// Kernel registry — supports multiple kernels for gradual migration
// ---------------------------------------------------------------------------

const _kernels = new Map<string, KernelAdapter>();
let _defaultKernelId: string | null = null;
let _cachedDefault: KernelAdapter | null = null;

/**
 * Register a kernel adapter under a unique identifier.
 * The first registered kernel becomes the default.
 */
export function registerKernel(id: string, adapter: KernelAdapter): void {
  _kernels.set(id, adapter);
  if (!_defaultKernelId) _defaultKernelId = id;
  if (id === _defaultKernelId) _cachedDefault = adapter;
}

/**
 * Return a kernel adapter by id, or the default kernel if no id is given.
 *
 * @throws If no kernel has been registered via {@link registerKernel} or {@link initFromOC}.
 */
export function getKernel(id?: string): KernelAdapter {
  if (!id && _cachedDefault) return _cachedDefault;

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
  _cachedDefault = _kernels.get(id) ?? null;
  try {
    const result = fn();
    if (result instanceof Promise) {
      throw new Error(
        'withKernel() callback returned a Promise. ' +
          'Async code must use getKernel(id) directly — ' +
          'the kernel override is restored synchronously in finally.'
      );
    }
    return result;
  } finally {
    _defaultKernelId = prev;
    // Re-lookup rather than restoring prevCached: a registerKernel() call
    // inside fn may have replaced the adapter for the original default id.
    _cachedDefault = prev ? (_kernels.get(prev) ?? null) : null;
  }
}

/** Initialise the brepjs kernel from a loaded WASM instance. */
export function initFromOC(oc: KernelInstance): void {
  resetMeasureDetectionCache();
  resetTransformDetectionCache();
  const adapter = new DefaultAdapter(oc);
  registerKernel('occt', adapter);
  _defaultKernelId = 'occt';
  _cachedDefault = adapter;
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

export { supportsProjection, supportsConstraintSketch } from './types.js';
export type { ProjectionCapability, ConstraintSketchCapability } from './types.js';

export type {
  KernelBooleanOps,
  KernelConstructionOps,
  KernelCore,
  KernelEvolutionOps,
  KernelGeometryOps,
  KernelIOOps,
  KernelMeasureOps,
  KernelMeshOps,
  KernelModifierOps,
  KernelRepairOps,
  KernelSweepOps,
  KernelTopologyOps,
  KernelTransformOps,
} from './interfaces/index.js';

export { supportsKernel2D } from './kernel2dTypes.js';
export type { Kernel2DCapability, Curve2dHandle, BBox2dHandle } from './kernel2dTypes.js';

export { BrepkitAdapter } from './brepkitAdapter.js';
export type { BrepkitHandle } from './brepkitAdapter.js';
