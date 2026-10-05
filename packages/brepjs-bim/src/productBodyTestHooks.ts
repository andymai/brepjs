import type { BimError } from './errors/bimError.js';
import type { Result, ValidSolid, measureVolume, getBounds } from 'brepjs';

export type BodyNativeStep = 'validate' | 'copy' | 'transform' | 'union' | 'measure' | 'bounds';

export interface BodyNativeEvent {
  readonly step: BodyNativeStep;
  readonly itemIndex: number;
}

export interface ProductBodyTestHooks {
  readonly before?: (event: BodyNativeEvent) => Result<void, BimError> | void;
  /** Called only after the new handle has been registered for failure cleanup. */
  readonly afterAllocate?: (
    event: BodyNativeEvent & { readonly solid: ValidSolid }
  ) => Result<void, BimError> | void;
  readonly measure?: typeof measureVolume;
  readonly bounds?: typeof getBounds;
}

let hooks: ProductBodyTestHooks | null = null;

/** Package-internal seam. Tests keep native geometry real and reset after each case. */
export function setProductBodyTestHooksForTesting(value: ProductBodyTestHooks | null): void {
  hooks = value;
}

export function productBodyTestHooks(): ProductBodyTestHooks | null {
  return hooks;
}
