/**
 * Memory management utilities for OCCT wrappers.
 * Ported from replicad's register.ts.
 */

import type { OpenCascadeInstance } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';

export interface Deletable {
  delete: () => void;
}

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
const deletableRegistry = new (globalThis as any).FinalizationRegistry((heldValue: Deletable) => {
  try {
    heldValue.delete();
  } catch (e) {
    console.error(e);
  }
});

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
    deletableRegistry.unregister(this.wrapped);
    this.wrapped?.delete();
    this._wrapped = null;
  }
}

export const GCWithScope = (): (<Type extends Deletable>(value: Type) => Type) => {
  function gcWithScope<Type extends Deletable>(value: Type): Type {
    deletableRegistry.register(gcWithScope, value);
    return value;
  }

  return gcWithScope;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- obj can be any reference holder
export const GCWithObject = (obj: any): (<Type extends Deletable>(value: Type) => Type) => {
  function registerForGC<Type extends Deletable>(value: Type): Type {
    deletableRegistry.register(obj, value);
    return value;
  }

  return registerForGC;
};

export const localGC = (
  debug?: boolean
): [<T extends Deletable>(v: T) => T, () => void, Set<Deletable> | undefined] => {
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
};
