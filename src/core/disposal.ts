/**
 * Resource disposal system using Symbol.dispose (TC39 Explicit Resource Management).
 *
 * All kernel handles are wrapped in disposable objects:
 *   using solid = createSolid(ocShape);
 *   // auto-disposed at end of scope
 *
 * FinalizationRegistry serves as a safety net for handles not explicitly disposed.
 */

import type { KernelShape } from '../kernel/types.js';
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

const registry = new FinalizationRegistry<Deletable>((heldValue) => {
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

  /** Alias for Symbol.dispose — required for localGC / Deletable compatibility. */
  delete(): void;

  /** Check if this handle has been disposed */
  readonly disposed: boolean;
}

/** Create a disposable shape handle. */
export function createHandle(ocShape: KernelShape): ShapeHandle {
  let disposed = false;

  const dispose = () => {
    if (!disposed) {
      disposed = true;
      registry.unregister(handle);
      try {
        ocShape.delete();
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
  };

  registry.register(handle, ocShape, handle);
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
        registry.unregister(handle);
        try {
          ocObj.delete();
        } catch {
          // Already deleted
        }
      }
    },
  };

  registry.register(handle, ocObj, handle);
  return handle;
}

// ---------------------------------------------------------------------------
// Scoped resource management
// ---------------------------------------------------------------------------

/** Scope for tracking multiple disposable resources. */
export class DisposalScope implements Disposable {
  private readonly handles: (() => void)[] = [];

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
// GC helpers
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `using scope = new DisposalScope()` + `scope.register()` instead.
 * DisposalScope provides deterministic cleanup on all exit paths including throws.
 * @see DisposalScope
 */
export function gcWithScope(): <T extends Deletable>(value: T) => T {
  function gc<T extends Deletable>(value: T): T {
    registry.register(gc, value);
    return value;
  }
  return gc;
}

/**
 * @deprecated Use `using scope = new DisposalScope()` + `scope.register()` instead.
 * DisposalScope provides deterministic cleanup on all exit paths including throws.
 * @see DisposalScope
 */
export function gcWithObject(obj: object): <T extends Deletable>(value: T) => T {
  function registerForGC<T extends Deletable>(value: T): T {
    registry.register(obj, value);
    return value;
  }
  return registerForGC;
}

/**
 * @deprecated Use `using scope = new DisposalScope()` + `scope.register()` instead.
 * DisposalScope provides deterministic cleanup on all exit paths including throws.
 * @see DisposalScope
 */
export function localGC(
  debug?: boolean
): [<T extends Deletable>(v: T) => T, () => void, Set<Deletable> | undefined] {
  const cleaner = new Set<Deletable>();

  const register = <T extends Deletable>(v: T): T => {
    cleaner.add(v);
    return v;
  };

  const cleanup = () => {
    for (const d of cleaner) {
      try {
        d.delete();
      } catch {
        // Already deleted or invalid — ignore
      }
    }
    cleaner.clear();
  };

  return [register, cleanup, debug ? cleaner : undefined];
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
