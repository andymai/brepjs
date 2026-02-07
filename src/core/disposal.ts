/**
 * Resource disposal system using Symbol.dispose (TC39 Explicit Resource Management).
 * Replaces the old WrappingObj class hierarchy.
 *
 * All OCCT handles are wrapped in disposable objects:
 *   using solid = createSolid(ocShape);
 *   // auto-disposed at end of scope
 *
 * FinalizationRegistry serves as a safety net for handles not explicitly disposed.
 */

import type { OcShape } from '../kernel/types.js';

// ---------------------------------------------------------------------------
// Deletable interface (same as before)
// ---------------------------------------------------------------------------

/** Any object that can be cleaned up by calling `delete()` (OCCT WASM objects). */
export interface Deletable {
  delete: () => void;
}

// ---------------------------------------------------------------------------
// FinalizationRegistry safety net
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- FinalizationRegistry polyfill for environments without it
if (!(globalThis as any).FinalizationRegistry) {
  console.warn('brepjs: FinalizationRegistry unavailable — garbage collection will not work');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- polyfill shim
  (globalThis as any).FinalizationRegistry = (() => ({
    register: () => null,
    unregister: () => null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- polyfill shim
  })) as any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- FinalizationRegistry generic typing
const registry = new (globalThis as any).FinalizationRegistry((heldValue: Deletable) => {
  try {
    heldValue.delete();
  } catch {
    // Already deleted or invalid — ignore
  }
});

// ---------------------------------------------------------------------------
// Shape wrapper (replaces WrappingObj for shapes)
// ---------------------------------------------------------------------------

/** A shape wrapper with Symbol.dispose for auto-cleanup. */
export interface ShapeHandle {
  /** The raw OCCT shape handle */
  readonly wrapped: OcShape;

  /** Manually dispose the OCCT handle */
  [Symbol.dispose](): void;

  /** Alias for Symbol.dispose — required for localGC / Deletable compatibility. */
  delete(): void;

  /** Check if this handle has been disposed */
  readonly disposed: boolean;
}

/** Create a disposable shape handle. */
export function createHandle(ocShape: OcShape): ShapeHandle {
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
// Generic OCCT object wrapper
// ---------------------------------------------------------------------------

/** A disposable wrapper for any OCCT object. */
export interface OcHandle<T extends Deletable> {
  readonly value: T;
  readonly disposed: boolean;
  [Symbol.dispose](): void;
}

/** Create a disposable handle for any OCCT object. */
export function createOcHandle<T extends Deletable>(ocObj: T): OcHandle<T> {
  let disposed = false;

  const handle: OcHandle<T> = {
    get value() {
      if (disposed) throw new Error('OCCT handle has been disposed');
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
      disposable[Symbol.dispose]();
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
// GC helpers (backwards-compatible)
// ---------------------------------------------------------------------------

/** Register a deletable value for GC when the scope function is collected. */
export function gcWithScope(): <T extends Deletable>(value: T) => T {
  function gc<T extends Deletable>(value: T): T {
    registry.register(gc, value);
    return value;
  }
  return gc;
}

/** Register a deletable value for GC when the given object is collected. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- obj can be any reference holder
export function gcWithObject(obj: any): <T extends Deletable>(value: T) => T {
  function registerForGC<T extends Deletable>(value: T): T {
    registry.register(obj, value);
    return value;
  }
  return registerForGC;
}

/** Create a local GC scope. Returns [register, cleanup, debugSet?]. */
export function localGC(
  debug?: boolean
): [<T extends Deletable>(v: T) => T, () => void, Set<Deletable> | undefined] {
  const cleaner = new Set<Deletable>();

  return [
    <T extends Deletable>(v: T): T => {
      cleaner.add(v);
      return v;
    },
    () => {
      cleaner.forEach((d) => {
        d.delete();
      });
      cleaner.clear();
    },
    debug ? cleaner : undefined,
  ];
}
