/**
 * Resource disposal system using Symbol.dispose (TC39 Explicit Resource Management).
 *
 * All kernel handles are wrapped in disposable objects:
 *   using solid = createSolid(ocShape);
 *   // auto-disposed at end of scope
 *
 * FinalizationRegistry serves as a safety net for handles not explicitly disposed.
 */

import type { KernelShape } from '@/kernel/types.js';
import { getKernel } from '@/kernel/index.js';
import type { BrepError } from './errors.js';
import type { Result } from './result.js';

// ---------------------------------------------------------------------------
// Symbol.dispose polyfill — Safari and older browsers lack the well-known
// symbol. esbuild's `using` transform falls back to Symbol.for("Symbol.dispose"),
// but [Symbol.dispose]() property keys use the raw symbol. This polyfill
// bridges the gap so both resolve to the same key.  (#326)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- patching global Symbol
const S = Symbol as any;
S.dispose ??= Symbol.for('Symbol.dispose');
S.asyncDispose ??= Symbol.for('Symbol.asyncDispose');

// ---------------------------------------------------------------------------
// Deletable interface (same as before)
// ---------------------------------------------------------------------------

/** Any object that can be cleaned up by calling `delete()` (kernel WASM objects). */
export interface Deletable {
  delete: () => void;
}

// ---------------------------------------------------------------------------
// FinalizationRegistry safety net
// ---------------------------------------------------------------------------

interface GlobalWithRegistry {
  FinalizationRegistry?: typeof FinalizationRegistry;
}

const globalWithRegistry = globalThis as GlobalWithRegistry;

if (!globalWithRegistry.FinalizationRegistry) {
  console.warn('brepjs: FinalizationRegistry unavailable — garbage collection will not work');
  globalWithRegistry.FinalizationRegistry = class NoOpFinalizationRegistry {
    register(_target: object, _heldValue: unknown, _unregisterToken?: object): void {
      // no-op
    }

    unregister(_unregisterToken: object): boolean {
      return false;
    }
  } as unknown as typeof FinalizationRegistry;
}

// ---------------------------------------------------------------------------
// DisposalStats — lightweight resource tracking for debugging WASM leaks
// ---------------------------------------------------------------------------

/** Statistics about WASM handle lifecycle. Zero overhead when not queried. */
export interface DisposalStats {
  /** Number of handles currently alive (not disposed). */
  liveHandles: number;
  /** Peak number of simultaneously live handles. */
  peakHandles: number;
  /** Number of handles reclaimed by FinalizationRegistry (GC safety net). */
  gcCollected: number;
  /** Number of DisposalScope.enter() calls. */
  scopeEnters: number;
  /** Number of DisposalScope.dispose() calls. */
  scopeExits: number;
}

const _stats: DisposalStats = {
  liveHandles: 0,
  peakHandles: 0,
  gcCollected: 0,
  scopeEnters: 0,
  scopeExits: 0,
};

/** Get a snapshot of current disposal statistics. */
export function getDisposalStats(): Readonly<DisposalStats> {
  return { ..._stats };
}

/** Reset all disposal statistics to zero. */
export function resetDisposalStats(): void {
  _stats.liveHandles = 0;
  _stats.peakHandles = 0;
  _stats.gcCollected = 0;
  _stats.scopeEnters = 0;
  _stats.scopeExits = 0;
}

function trackHandleCreated(): void {
  _stats.liveHandles++;
  if (_stats.liveHandles > _stats.peakHandles) {
    _stats.peakHandles = _stats.liveHandles;
  }
}

function trackHandleDisposed(): void {
  _stats.liveHandles--;
}

function trackGcCollected(): void {
  _stats.gcCollected++;
  _stats.liveHandles--;
}

const registry = new FinalizationRegistry<Deletable>((heldValue) => {
  trackGcCollected();
  try {
    heldValue.delete();
  } catch {
    // Already deleted or invalid — ignore
  }
});

// ---------------------------------------------------------------------------
// Shape wrapper
// ---------------------------------------------------------------------------

/** A shape wrapper with Symbol.dispose for auto-cleanup. */
export interface ShapeHandle {
  /** The raw kernel shape handle */
  readonly wrapped: KernelShape;

  /** Manually dispose the kernel handle */
  [Symbol.dispose](): void;

  /** Alias for Symbol.dispose — required for Deletable compatibility. */
  delete(): void;

  /** Check if this handle has been disposed */
  readonly disposed: boolean;

  /**
   * Register a callback to run when this handle is disposed, before its kernel
   * slot is released. Used to release dependent resources tied to this shape's
   * lifetime (e.g. its cached sub-shape handles). Callbacks are invoked once,
   * in registration order; a callback that throws is swallowed. Registering on
   * an already-disposed handle runs the callback immediately.
   */
  onDispose(callback: () => void): void;
}

/** Create a disposable shape handle. */
export function createHandle(ocShape: KernelShape): ShapeHandle {
  // Capture the owning kernel now: on the occt-wasm arena kernel a shape's own
  // `delete()` is a no-op, so the slot is only reclaimed via `kernel.dispose()`
  // (→ `k.release(id)`). Routing disposal through the kernel makes `using` free
  // the slot on every kernel. Embind kernels keep their existing `.delete()`
  // behaviour (`kernel.dispose` falls through to it). `k.release` is idempotent,
  // so overlap with `disposeResultShape`/`disposeDowncastSource` is safe.
  const kernel = getKernel();
  let disposed = false;
  let onDisposeCallbacks: (() => void)[] | undefined;

  const runOnDispose = () => {
    if (!onDisposeCallbacks) return;
    for (const cb of onDisposeCallbacks) {
      try {
        cb();
      } catch {
        // A dependent-cleanup failure must not abort disposal.
      }
    }
    onDisposeCallbacks = undefined;
  };

  const dispose = () => {
    if (!disposed) {
      disposed = true;
      trackHandleDisposed();
      registry.unregister(handle);
      // Release dependents (e.g. cached sub-shapes) before this slot goes.
      runOnDispose();
      try {
        kernel.dispose(ocShape);
      } catch {
        // Already deleted — ignore
      }
    }
  };

  const handle: ShapeHandle = {
    get wrapped() {
      if (disposed) throw new Error('Shape handle has been disposed');
      return ocShape;
    },

    get disposed() {
      return disposed;
    },

    [Symbol.dispose]() {
      dispose();
    },

    delete() {
      dispose();
    },

    onDispose(callback: () => void) {
      if (disposed) {
        callback();
        return;
      }
      (onDisposeCallbacks ??= []).push(callback);
    },
  };

  trackHandleCreated();
  // GC safety net: route the finalizer through the kernel too, else arena slots
  // survive collection on occt-wasm. The closure holds `ocShape`/`kernel` (not
  // `handle`), so it never keeps the handle itself alive.
  registry.register(
    handle,
    {
      delete: () => {
        kernel.dispose(ocShape);
      },
    },
    handle
  );
  return handle;
}

// ---------------------------------------------------------------------------
// Generic kernel object wrapper
// ---------------------------------------------------------------------------

/** A disposable wrapper for any kernel object. */
export interface KernelHandle<T extends Deletable> {
  readonly value: T;
  readonly disposed: boolean;
  [Symbol.dispose](): void;
}

/** Create a disposable handle for any kernel object. */
export function createKernelHandle<T extends Deletable>(ocObj: T): KernelHandle<T> {
  let disposed = false;

  const handle: KernelHandle<T> = {
    get value() {
      if (disposed) throw new Error('kernel handle has been disposed');
      return ocObj;
    },

    get disposed() {
      return disposed;
    },

    [Symbol.dispose]() {
      if (!disposed) {
        disposed = true;
        trackHandleDisposed();
        registry.unregister(handle);
        try {
          ocObj.delete();
        } catch {
          // Already deleted
        }
      }
    },
  };

  trackHandleCreated();
  registry.register(handle, ocObj, handle);
  return handle;
}

// ---------------------------------------------------------------------------
// Scoped resource management
// ---------------------------------------------------------------------------

/** Scope for tracking multiple disposable resources. */
export class DisposalScope implements Disposable {
  private readonly handles: (() => void)[] = [];

  constructor() {
    _stats.scopeEnters++;
  }

  /** Register a resource for disposal when scope ends. */
  register<T extends Deletable>(resource: T): T {
    this.handles.push(() => {
      try {
        resource.delete();
      } catch {
        // Already deleted
      }
    });
    return resource;
  }

  /** Register a disposable for disposal when scope ends. */
  track<T extends Disposable>(disposable: T): T {
    this.handles.push(() => {
      try {
        disposable[Symbol.dispose]();
      } catch {
        // Already disposed or invalid — ignore
      }
    });
    return disposable;
  }

  [Symbol.dispose](): void {
    _stats.scopeExits++;
    // Dispose in reverse order (LIFO)
    for (let i = this.handles.length - 1; i >= 0; i--) {
      this.handles[i]?.();
    }
    this.handles.length = 0;
  }
}

/** Execute a function with a disposal scope. Resources registered with the scope
 *  are automatically cleaned up when the function returns. */
export function withScope<T>(fn: (scope: DisposalScope) => T): T {
  using scope = new DisposalScope();
  return fn(scope);
}

// ---------------------------------------------------------------------------
// FinalizationRegistry helpers for non-branded wrappers (e.g. Curve2D)
// ---------------------------------------------------------------------------

/** Register `deletable` for GC cleanup when `owner` is collected. */
export function registerForCleanup(owner: object, deletable: Deletable): void {
  registry.register(owner, deletable, deletable);
}

/** Unregister a previously-registered deletable (call before manual delete). */
export function unregisterFromCleanup(deletable: Deletable): void {
  registry.unregister(deletable);
}

// ---------------------------------------------------------------------------
// Result-aware scope helpers
// ---------------------------------------------------------------------------

/**
 * Run fn inside a DisposalScope. The scope is disposed on all exit paths:
 * Ok return, Err return, and throw. Use in any function that allocates
 * kernel objects and returns Result<T>.
 *
 * ```ts
 * return withScopeResult((scope) => {
 *   const axis = scope.register(makeKernelAx1(origin, dir));
 *   return ok(castShape(getKernel().makeSomething(axis)) as Solid);
 * });
 * ```
 */
export function withScopeResult<T, E = BrepError>(
  fn: (scope: DisposalScope) => Result<T, E>
): Result<T, E> {
  using scope = new DisposalScope();
  return fn(scope);
}

/**
 * Async variant of withScopeResult. The scope is disposed after the
 * returned promise settles (resolved or rejected).
 */
export async function withScopeResultAsync<T, E = BrepError>(
  fn: (scope: DisposalScope) => Promise<Result<T, E>>
): Promise<Result<T, E>> {
  using scope = new DisposalScope();
  return await fn(scope);
}

// ---------------------------------------------------------------------------
// Lifecycle guard
// ---------------------------------------------------------------------------

/**
 * Returns true if the handle has not been disposed.
 * Provides a named alternative to checking `.disposed` directly.
 *
 * ```ts
 * if (!isLive(handle)) return err(validationError('DISPOSED_HANDLE', '...'));
 * ```
 */
export function isLive(handle: ShapeHandle | KernelHandle<Deletable>): boolean {
  return !handle.disposed;
}
