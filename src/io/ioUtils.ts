/**
 * Shared mesh-to-solid sewing utilities for mesh importers.
 *
 * Builds triangular B-Rep faces from vertex/index data and sews them into
 * a solid, with a fallback to a shell when solidification fails.
 */

import { getKernel } from '../kernel/index.js';
import type { KernelShape } from '../kernel/types.js';
import type { UnknownDimShape } from '../core/shapeTypes.js';
import { castShape } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { ioError } from '../core/errors.js';

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
    return ok(castShape(kernel.sewAndSolidify(triFaces, tolerance)));
  } catch {
    // If sewing/solid fails, try sewing alone
    try {
      return ok(castShape(kernel.sew(triFaces, tolerance)));
    } catch {
      return err(ioError(errorCode, 'Failed to sew triangular faces'));
    }
  }
}
