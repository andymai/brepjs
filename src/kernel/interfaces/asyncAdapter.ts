/**
 * Async variant of KernelAdapter for off-main-thread kernel usage.
 *
 * Uses a mapped type (`Asyncify`) to wrap every method's return type in
 * `Promise<T>`, keeping the interface automatically in sync with the
 * synchronous KernelAdapter as it evolves.
 *
 * **Limitation:** TypeScript mapped types only capture the last overload
 * signature for overloaded methods. If KernelAdapter gains overloads,
 * those will lose their additional signatures in AsyncKernelAdapter.
 *
 * @module
 */

import type { KernelAdapter } from './index.js';

// ---------------------------------------------------------------------------
// Mapped type
// ---------------------------------------------------------------------------

/**
 * Transform an interface so that every method returns `Promise<R>`
 * instead of `R`. Non-function properties are preserved as-is.
 */
export type Asyncify<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<R> : T[K];
};

// ---------------------------------------------------------------------------
// AsyncKernelAdapter
// ---------------------------------------------------------------------------

/**
 * Async version of {@link KernelAdapter}, excluding the `oc` property
 * (the raw WASM instance lives in the worker and cannot be proxied).
 *
 * Every method that returns `T` on the sync adapter returns `Promise<T>` here.
 * The `kernelId` property is preserved as a plain string.
 */
export type AsyncKernelAdapter = Asyncify<Omit<KernelAdapter, 'oc'>> & {
  /** Kernel identifier (e.g., 'occt-wasm-worker'). */
  readonly kernelId: string;
};
