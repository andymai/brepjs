import { getKernel } from '@/kernel/index.js';
import { isUnsupportedKernelOperationError } from '@/kernel/unsupported.js';
import { type BrepError, BrepErrorCode, unsupportedError } from '@/core/errors.js';

/**
 * The capability error for an IGES call on a kernel built without an IGES
 * translator (occt-wasm), or `null` when `cause` is any other failure.
 */
export function igesUnsupportedError(
  operation: 'importIGES' | 'exportIGES',
  cause: unknown
): BrepError | null {
  if (!isUnsupportedKernelOperationError(cause)) return null;
  const kernel = getKernel().kernelId;
  return unsupportedError(
    BrepErrorCode.UNSUPPORTED_CAPABILITY,
    `${operation}: the ${kernel} kernel has no IGES support`,
    cause,
    { kernel },
    'Exchange the model as STEP (importSTEP / exportSTEP) instead'
  );
}
