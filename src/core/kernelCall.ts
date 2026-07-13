/**
 * Error handling helpers for kernel operations.
 *
 * Reduces boilerplate in *Fns.ts files by wrapping try/catch + castShape
 * into a single call.
 */

import type { KernelShape } from '@/kernel/types.js';
import type { AnyShape } from './shapeTypes.js';
import { castResultShape } from './shapeTypes.js';
import type { Result } from './result.js';
import { ok, err } from './result.js';
import type { BrepErrorKind, BrepError } from './errors.js';
import { translateKernelError, getSuggestionForCode } from './errors.js';
import { DisposalScope } from './disposal.js';

type ErrorFactory = (
  code: string,
  message: string,
  cause?: unknown,
  suggestion?: string
) => BrepError;

function buildError(
  kind: BrepErrorKind,
  code: string,
  message: string,
  cause?: unknown,
  suggestion?: string
): BrepError {
  const base: BrepError = { kind, code, message, cause };
  if (suggestion) return { ...base, suggestion };
  return base;
}

const errorFactories: Record<BrepErrorKind, ErrorFactory> = {
  KERNEL_OPERATION: (code, message, cause, suggestion) =>
    buildError('KERNEL_OPERATION', code, message, cause, suggestion),
  VALIDATION: (code, message, cause, suggestion) =>
    buildError('VALIDATION', code, message, cause, suggestion),
  TYPE_CAST: (code, message, cause, suggestion) =>
    buildError('TYPE_CAST', code, message, cause, suggestion),
  SKETCHER_STATE: (code, message, cause, suggestion) =>
    buildError('SKETCHER_STATE', code, message, cause, suggestion),
  MODULE_INIT: (code, message, cause, suggestion) =>
    buildError('MODULE_INIT', code, message, cause, suggestion),
  COMPUTATION: (code, message, cause, suggestion) =>
    buildError('COMPUTATION', code, message, cause, suggestion),
  IO: (code, message, cause, suggestion) => buildError('IO', code, message, cause, suggestion),
  QUERY: (code, message, cause, suggestion) =>
    buildError('QUERY', code, message, cause, suggestion),
  // NB: UNSUPPORTED exists for Record<BrepErrorKind> exhaustiveness.
  // Prefer explicit `return err(unsupportedError(...))` in adapter code (ADR-0006).
  UNSUPPORTED: (code, message, cause, suggestion) =>
    buildError('UNSUPPORTED', code, message, cause, suggestion),
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
    // castResultShape (not castShape): fn() returns a fresh kernel result the
    // caller owns, so release its orphaned pre-downcast slot on the occt-wasm
    // arena kernel. Identity-downcast kernels skip the release via the guard.
    return ok(castResultShape(fn()));
  } catch (e) {
    const rawMessage = e instanceof Error ? e.message : String(e);
    const translatedMessage =
      kind === 'KERNEL_OPERATION' ? translateKernelError(rawMessage) : rawMessage;
    const suggestion = getSuggestionForCode(code);
    return err(errorFactories[kind](code, `${message}: ${translatedMessage}`, e, suggestion));
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
    const suggestion = getSuggestionForCode(code);
    return err(errorFactories[kind](code, `${message}: ${translatedMessage}`, e, suggestion));
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
