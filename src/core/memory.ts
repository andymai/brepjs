/**
 * Memory management utilities.
 *
 * This module provides the new disposal system and backward-compatible
 * WrappingObj for classes being migrated.
 */

export type { Deletable } from './disposal.js';
export {
  createHandle,
  createOcHandle,
  DisposalScope,
  withScope,
  gcWithScope as GCWithScope,
  gcWithObject as GCWithObject,
  localGC,
  type ShapeHandle,
  type OcHandle,
} from './disposal.js';

// ---------------------------------------------------------------------------
// Legacy WrappingObj — kept during migration, will be removed
// ---------------------------------------------------------------------------

import type { OpenCascadeInstance } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import type { Deletable } from './disposal.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- FinalizationRegistry polyfill
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
const deletableRegistry = new (globalThis as any).FinalizationRegistry((heldValue: Deletable) => {
  try {
    heldValue.delete();
  } catch {
    // Already deleted
  }
});

// TODO(functional-rewrite): Replace with createHandle() + branded types
export class WrappingObj<Type extends Deletable> {
  protected oc: OpenCascadeInstance;
  private _wrapped: Type | null;

  constructor(wrapped: Type) {
    this.oc = getKernel().oc;
    if (wrapped) {
      deletableRegistry.register(this, wrapped, wrapped);
    }
    this._wrapped = wrapped;
  }

  get wrapped(): Type {
    if (this._wrapped === null) throw new Error('This object has been deleted');
    return this._wrapped;
  }

  set wrapped(newWrapped: Type) {
    if (this._wrapped) {
      deletableRegistry.unregister(this._wrapped);
      this._wrapped.delete();
    }

    deletableRegistry.register(this, newWrapped, newWrapped);
    this._wrapped = newWrapped;
  }

  delete(): void {
    if (this._wrapped) {
      deletableRegistry.unregister(this._wrapped);
      this._wrapped.delete();
      this._wrapped = null;
    }
  }
}
