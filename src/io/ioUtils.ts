/**
 * Shared mesh-to-solid sewing utilities for mesh importers.
 *
 * Builds triangular B-Rep faces from vertex/index data and sews them into
 * a solid, with a fallback to a shell when solidification fails.
 */

import { getKernel } from '@/kernel/index.js';
import type { KernelShape } from '@/kernel/types.js';
import type { UnknownDimShape } from '@/core/shapeTypes.js';
import { castShape, castResultShape } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { type BrepError, BrepErrorCode, ioError, unsupportedError } from '@/core/errors.js';
import { isUnsupportedKernelOperationError } from '@/kernel/unsupported.js';

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

/**
 * Build triangular B-Rep faces from vertex data and sew them into a solid.
 *
 * For each triple of vertex coordinates, calls `kernel.buildTriFace` to create
 * a planar triangular face, then attempts `sewAndSolidify`. If solidification
 * fails, falls back to `sew` (returning a shell or compound).
 *
 * @param triangles - Array of vertex triples, each triple being three [x,y,z] tuples.
 * @param errorCode - The error code to use in any returned errors.
 * @param tolerance - Sewing tolerance (default 1e-6).
 * @returns A `Result` wrapping the sewn shape, or an error.
 */
export function sewMeshToSolid(
  triangles: Array<[[number, number, number], [number, number, number], [number, number, number]]>,
  errorCode: string,
  tolerance: number = 1e-6
): Result<UnknownDimShape> {
  const kernel = getKernel();
  const triFaces: KernelShape[] = [];

  for (const [va, vb, vc] of triangles) {
    const triFace = kernel.buildTriFace(va, vb, vc);
    if (triFace !== null) {
      triFaces.push(triFace);
    }
  }

  if (triFaces.length === 0) {
    return err(ioError(errorCode, 'No valid triangular faces could be built'));
  }

  try {
    // sewAndSolidify copies the faces into a fresh solid, so the tri-face slots
    // can be released and the orphaned pre-downcast handle cast away.
    const solid = kernel.sewAndSolidify(triFaces, tolerance);
    const cast = castResultShape(solid);
    for (const triFace of triFaces) kernel.dispose(triFace);
    return ok(cast);
  } catch {
    // Open/degenerate surface: sew alone into a shell/compound. On arena kernels
    // the sewn shell shares the input face slots, so leave the tri-faces and the
    // pre-downcast handle untouched (castShape, no dispose) to avoid freeing them.
    try {
      return ok(castShape(kernel.sew(triFaces, tolerance)));
    } catch (e) {
      return err(ioError(errorCode, 'Failed to sew triangular faces', e));
    }
  }
}
