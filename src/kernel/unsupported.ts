/**
 * Shared error for "this kernel doesn't implement this operation" — a stubbed
 * adapter method (occt's brepkit-only stubs, occt-wasm's not-yet-implemented) or
 * a manifold op that needs an absent occt replay. Feature-detection recognises it
 * structurally via {@link isUnsupportedKernelOperationError} instead of matching
 * each adapter's message text, so a native-vs-fallback probe stays decoupled from
 * wording. Adapters keep their existing messages; this only adds the marker.
 */

const UNSUPPORTED_MARKER = Symbol.for('brepjs.kernel.unsupportedOperation');

/** Thrown by a kernel adapter asked to perform an operation it doesn't support. */
export class UnsupportedKernelOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedKernelOperationError';
    // Global-registry symbol, checked in place of `instanceof`, so the marker
    // still matches across a bundle boundary that loaded a second copy of this
    // class (e.g. a consumer bundling its own brepjs).
    Object.defineProperty(this, UNSUPPORTED_MARKER, { value: true });
  }
}

/** True if `error` is an {@link UnsupportedKernelOperationError} from any kernel adapter. */
export function isUnsupportedKernelOperationError(error: unknown): boolean {
  return error instanceof Error && Reflect.get(error, UNSUPPORTED_MARKER) === true;
}
