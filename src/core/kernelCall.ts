/**
 * Error handling helpers for kernel operations.
 *
 * Reduces boilerplate in *Fns.ts files by wrapping try/catch + castShape
 * into a single call.
 */

import type { KernelShape } from '../kernel/types.js';
import type { AnyShape } from './shapeTypes.js';
import { castShape } from './shapeTypes.js';
import type { Result } from './result.js';
import { ok, err } from './result.js';
import type { BrepErrorKind, BrepError } from './errors.js';
import { translateKernelError } from './errors.js';
import { DisposalScope } from './disposal.js';

type ErrorFactory = (code: string, message: string, cause?: unknown) => BrepError;

const errorFactories: Record<BrepErrorKind, ErrorFactory> = {
  KERNEL_OPERATION: (code, message, cause) => ({ kind: 'KERNEL_OPERATION', code, message, cause }),
  VALIDATION: (code, message, cause) => ({ kind: 'VALIDATION', code, message, cause }),
  TYPE_CAST: (code, message, cause) => ({ kind: 'TYPE_CAST', code, message, cause }),
  SKETCHER_STATE: (code, message, cause) => ({ kind: 'SKETCHER_STATE', code, message, cause }),
  MODULE_INIT: (code, message, cause) => ({ kind: 'MODULE_INIT', code, message, cause }),
  COMPUTATION: (code, message, cause) => ({ kind: 'COMPUTATION', code, message, cause }),
  IO: (code, message, cause) => ({ kind: 'IO', code, message, cause }),
  QUERY: (code, message, cause) => ({ kind: 'QUERY', code, message, cause }),
};

/**
 * Wrap a kernel call that returns an KernelShape, automatically casting
 * the result into a branded AnyShape. On exception, returns an Err
 * with the given error code and message.
 *
 * kernel error messages are automatically translated into user-friendly
 * explanations when the error kind is KERNEL_OPERATION.
 */
export function kernelCall(
  fn: () => KernelShape,
  code: string,
  message: string,
  kind: BrepErrorKind = 'KERNEL_OPERATION'
): Result<AnyShape> {
  try {
    return ok(castShape(fn()));
  } catch (e) {
    const rawMessage = e instanceof Error ? e.message : String(e);
    const translatedMessage =
      kind === 'KERNEL_OPERATION' ? translateKernelError(rawMessage) : rawMessage;
    return err(errorFactories[kind](code, `${message}: ${translatedMessage}`, e));
  }
}

/**
 * Wrap a kernel call that returns an arbitrary value. On exception,
 * returns an Err with the given error code and message.
 *
 * kernel error messages are automatically translated into user-friendly
 * explanations when the error kind is KERNEL_OPERATION.
 */
export function kernelCallRaw<T>(
  fn: () => T,
  code: string,
  message: string,
  kind: BrepErrorKind = 'KERNEL_OPERATION'
): Result<T> {
  try {
    return ok(fn());
  } catch (e) {
    const rawMessage = e instanceof Error ? e.message : String(e);
    const translatedMessage =
      kind === 'KERNEL_OPERATION' ? translateKernelError(rawMessage) : rawMessage;
    return err(errorFactories[kind](code, `${message}: ${translatedMessage}`, e));
  }
}

/**
 * Wrap a kernel call that needs intermediate kernel allocations.
 *
 * A DisposalScope is created and passed to fn. The scope is disposed
 * deterministically after fn returns or throws — ensuring no intermediate
 * handles are leaked even on error paths.
 *
 * ```ts
 * return kernelCallScoped(
 *   (scope) => {
 *     const axis = scope.register(makeKernelAx1(origin, dir));
 *     return getKernel().revolveVec(...) // was: oc.BRepBuilderAPI_MakeRevol_1(shape.wrapped, axis).Shape();
 *   },
 *   BrepErrorCode.REVOLUTION_NOT_3D,
 *   'Revolution failed'
 * );
 * ```
 */
export function kernelCallScoped(
  fn: (scope: DisposalScope) => KernelShape,
  code: string,
  message: string,
  kind: BrepErrorKind = 'KERNEL_OPERATION'
): Result<AnyShape> {
  using scope = new DisposalScope();
  return kernelCall(() => fn(scope), code, message, kind);
}
