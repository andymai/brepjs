import type { KernelAdapter, KernelInstance } from './types.js';
import type { Kernel2DCapability } from './kernel2dTypes.js';
import { supportsKernel2D } from './kernel2dTypes.js';
import { DefaultAdapter } from './occt/defaultAdapter.js';
import { BrepkitAdapter } from './brepkit/brepkitAdapter.js';
import { resetMeasureDetectionCache } from './occt/measureOps.js';
import { resetTransformDetectionCache } from './occt/transformOps.js';
import { resetBooleanBatchDetectionCache } from './occt/booleanBatchOps.js';
import { resetLoftBatchDetectionCache, resetExtrudeBatchDetectionCache } from './occt/sweepOps.js';
import {
  resetShellBatchDetectionCache,
  resetFilletBatchDetectionCache,
} from './occt/modifierOps.js';
// resetPerformanceStats is exported but not called in initFromOC — users control their own stats lifecycle

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
/**
 * Return the id of the currently active default kernel, or `null` if none is
 * registered yet. Useful for code that needs a stable identifier (e.g.
 * cache keys) but doesn't want to ship the actual adapter.
 */
export function getActiveKernelId(): string | null {
  return _defaultKernelId;
}

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
  resetBooleanBatchDetectionCache();
  resetLoftBatchDetectionCache();
  resetExtrudeBatchDetectionCache();
  resetShellBatchDetectionCache();
  resetFilletBatchDetectionCache();
  const adapter = new DefaultAdapter(oc);
  registerKernel('occt', adapter);
  _defaultKernelId = 'occt';
  _cachedDefault = adapter;
}

/**
 * Trigger OCCT's deferred internal initialization by performing a trivial
 * geometry operation. The first OCCT call in a WASM session incurs a ~400-900ms
 * JIT penalty; calling `prewarm()` during idle time (e.g., after `init()` resolves
 * but before user interaction) moves this cost off the critical path.
 *
 * Safe to call multiple times — only the first call does work.
 *
 * @example
 * ```ts
 * await init();
 * prewarm(); // fire-and-forget during idle time
 * ```
 */
export function prewarm(): void {
  const kernel = getKernel();
  // A trivial box triggers OCCT's global constructors and JIT compilation
  // of the core geometry modules without producing visible side effects.
  const shape = kernel.makeBox(1, 1, 1);
  try {
    kernel.dispose(shape);
  } catch {
    // Swallow — prewarm is best-effort, never fail visibly
  }
}

/**
 * Auto-detect and initialise the best available kernel.
 *
 * Tries `brepjs-opencascade` (OCCT) first, then falls back to `brepkit-wasm`.
 * For `occt-wasm`, use {@link registerKernel} directly (see tests/helpers/kernelInit.ts).
 *
 * Idempotent — calling it again after a kernel is registered is a no-op that
 * returns the current kernel ID immediately.
 *
 * @returns The kernel ID that was initialised (`'occt'` or `'brepkit'`).
 * @throws If no kernel package can be imported.
 *
 * @example
 * ```ts
 * import { init, box } from 'brepjs';
 *
 * await init();
 * const myBox = box(10, 10, 10);
 * ```
 */
export async function init(): Promise<string> {
  if (_defaultKernelId) return _defaultKernelId;

  // Try OpenCascade first
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic import
    const mod = (await import(/* @vite-ignore */ 'brepjs-opencascade')) as any;
    const oc = await mod.default();
    initFromOC(oc);
    return 'occt';
  } catch {
    // OCCT not available, try brepkit
  }

  // Try brepkit
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic import
    const bk = (await import(/* @vite-ignore */ 'brepkit-wasm')) as any;
    if (typeof bk.default === 'function') await bk.default();
    registerKernel('brepkit', new BrepkitAdapter(new bk.BrepKernel()));
    return 'brepkit';
  } catch {
    // brepkit not available either
  }

  // occt-wasm is supported but requires explicit registration via
  // registerKernel() because its WASM loading uses Node.js APIs
  // (import.meta.resolve, node:path) that cannot be auto-detected
  // in all environments. See tests/helpers/kernelInit.ts for the pattern.

  throw new Error(
    'brepjs: no kernel package found. Install one of:\n' +
      '  npm install brepjs-opencascade   (recommended)\n' +
      '  npm install brepkit-wasm\n' +
      '  npm install occt-wasm            (requires manual registerKernel)'
  );
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
  KernelBuilderOps,
  KernelCore,
  KernelCurveOps,
  KernelEvolutionOps,
  KernelIOOps,
  KernelMeasureOps,
  KernelMeshOps,
  KernelModifierOps,
  KernelPrimitiveOps,
  KernelRepairOps,
  KernelSurfaceOps,
  KernelSweepOps,
  KernelTopologyOps,
  KernelTransformOps,
} from './interfaces/index.js';

export { supportsKernel2D } from './kernel2dTypes.js';
export type { Kernel2DCapability, Curve2dHandle, BBox2dHandle } from './kernel2dTypes.js';

export { BrepkitAdapter } from './brepkit/brepkitAdapter.js';
export type { BrepkitHandle } from './brepkit/helpers.js';

export { OcctWasmAdapter } from './occtWasm/occtWasmAdapter.js';
export type { OcctWasmHandle } from './occtWasm/occtWasmTypes.js';
export type { OcctWasmModule, OcctKernelWasm } from './occtWasm/occtWasmTypes.js';

export { getPerformanceStats, resetPerformanceStats, perfTimer } from './perfStats.js';
export type { PerfCategory, PerformanceStats } from './perfStats.js';
