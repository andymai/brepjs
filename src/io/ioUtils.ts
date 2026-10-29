/**
 * Shared mesh-to-solid sewing utilities for mesh importers.
 *
 * Builds triangular B-Rep faces from vertex/index data and sews them into one
 * solid per closed body, keeping any open body as a shell.
 */

import { getKernel } from '@/kernel/index.js';
import type { KernelShape } from '@/kernel/types.js';
import type { AnyShape, Dimension, UnknownDimShape } from '@/core/shapeTypes.js';
import { castResultShape } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { ioError } from '@/core/errors.js';
import { getShells, subShapeCount } from '@/topology/topologyQueryFns.js';
import { makeCompound } from '@/topology/solidBuilders.js';

/**
 * Sew faces into one solid per closed body.
 *
 * A single body comes back on its own: a `Solid` when closed, a `Shell` when
 * open. Several bodies come back as a `Compound` holding a `Solid` per closed
 * body and a `Shell` per open one. The caller keeps ownership of `faces`.
 *
 * @throws When the kernel cannot sew the faces at all.
 */
export function sewFacesIntoSolids(faces: KernelShape[], tolerance: number): UnknownDimShape {
  const kernel = getKernel();
  try {
    return castResultShape(kernel.sewAndSolidify(faces, tolerance));
  } catch {
    // Not one closed body: the orientation fix leaves an open shell or a
    // multi-body compound un-solidified, so the solid downcast throws (and
    // castResultShape releases the rejected slot). Split the bodies apart.
  }
  const sewn = castResultShape(kernel.sew(faces, tolerance));
  const shells = getShells(sewn);
  const shellFaces = shells.reduce((n, shell) => n + subShapeCount(shell, 'face'), 0);
  // Faces the sewing left outside every shell would be dropped by a per-shell rebuild.
  if (shells.length < 2 || shellFaces !== subShapeCount(sewn, 'face')) return sewn;
  using _sewn = sewn;
  const bodies = shells.map((shell) => solidifyShell(shell.wrapped, tolerance));
  const result = makeCompound(bodies);
  for (const body of bodies) body[Symbol.dispose]();
  return result;
}

function solidifyShell(shell: KernelShape, tolerance: number): AnyShape<Dimension> {
  const kernel = getKernel();
  const faces = kernel.iterShapes(shell, 'face');
  try {
    return castResultShape(kernel.sewAndSolidify(faces, tolerance));
  } catch {
    return castResultShape(kernel.copyShape(shell));
  } finally {
    for (const face of faces) kernel.dispose(face);
  }
}

/**
 * Build triangular B-Rep faces from vertex data and sew them into solids.
 *
 * For each triple of vertex coordinates, calls `kernel.buildTriFace` to create
 * a planar triangular face, then sews them with {@link sewFacesIntoSolids}.
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
    return ok(sewFacesIntoSolids(triFaces, tolerance));
  } catch (e) {
    return err(ioError(errorCode, 'Failed to sew triangular faces', e));
  } finally {
    for (const triFace of triFaces) kernel.dispose(triFace);
  }
}
