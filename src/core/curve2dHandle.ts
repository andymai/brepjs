/**
 * Branded 2D curve handle with disposal tracking.
 *
 * Wraps a raw kernel {@link Curve2dHandle} with:
 * - Phantom brand for type safety (prevents mixing with other kernel types)
 * - `Symbol.dispose` support via {@link createKernelHandle} infrastructure
 * - `DisposalStats` tracking and `FinalizationRegistry` safety net
 */

import type { KernelType } from '@/kernel/types.js';
import type { Deletable, KernelHandle } from './disposal.js';
import { createKernelHandle } from './disposal.js';

// ---------------------------------------------------------------------------
// Branded type
// ---------------------------------------------------------------------------

declare const __curve2d: unique symbol;

/**
 * A disposable handle to a 2D curve (Geom2d_Curve or similar).
 *
 * Created by 2D curve constructors (`line2d`, `circle2d`, etc.) and disposed
 * via `Symbol.dispose` / the `using` keyword.
 *
 * The `.raw` property accesses the underlying kernel handle for passing to
 * kernel methods. Throws if the handle has been disposed.
 */
export interface Curve2DHandle extends Disposable {
  readonly [__curve2d]: true;
  /** The underlying kernel handle. Throws if disposed. */
  readonly raw: KernelType;
  /** Whether this handle has been disposed. */
  readonly disposed: boolean;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Wrap a raw kernel 2D curve handle with brand + disposal tracking.
 *
 * Uses {@link createKernelHandle} internally for stats tracking,
 * `FinalizationRegistry` safety net, and double-dispose guards.
 */
export function createCurve2DHandle(rawHandle: KernelType): Curve2DHandle {
  // Some kernel types (brepkit arena handles) don't have delete()
  const deletable: Deletable =
    typeof rawHandle.delete === 'function'
      ? (rawHandle as Deletable)
      : {
          delete() {
            /* no-op for arena-based handles */
          },
        };

  // brepjs-patterns-disable: require-using-for-handles
  const inner: KernelHandle<Deletable> = createKernelHandle(deletable);

  // Brand is phantom (type-level only) — cast to add it, like shape types do.
  // We store rawHandle separately because inner.value may be a synthetic
  // Deletable wrapper (for brepkit arena handles that lack delete()).
  const handle = {
    get raw() {
      if (inner.disposed) throw new Error('Curve2DHandle has been disposed');
      return rawHandle;
    },

    get disposed() {
      return inner.disposed;
    },

    [Symbol.dispose]() {
      inner[Symbol.dispose]();
    },
  } as Curve2DHandle;

  return handle;
}
