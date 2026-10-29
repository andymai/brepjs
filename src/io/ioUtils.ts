/**
 * Shared mesh-to-solid sewing utilities for mesh importers.
 *
 * Builds triangular B-Rep faces from vertex/index data and sews them into one
 * solid per closed body, keeping any open body as a shell.
 */

import { getKernel } from '@/kernel/index.js';
import type { KernelShape } from '@/kernel/types.js';
import type { AnyShape, Dimension, Face, Shell, UnknownDimShape } from '@/core/shapeTypes.js';
import { castResultShape, isSolid } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { ioError } from '@/core/errors.js';
import { HASH_CODE_MAX } from '@/core/constants.js';
import { getFaces, getShells, subShapeCount } from '@/topology/topologyQueryFns.js';
import { makeCompound } from '@/topology/solidBuilders.js';
import { carveCavities } from './meshNesting.js';

/**
 * Sew faces into one solid per closed body.
 *
 * A single body comes back on its own: a `Solid` when closed, a `Shell` when
 * open. Several bodies come back as a `Compound` holding a `Solid` per closed
 * body, a `Shell` per open one, and any face that joined no shell. An
 * inward-facing closed shell inside another body is a cavity, cut from that
 * body. The caller keeps ownership of `faces`.
 *
 * @throws When the kernel cannot sew the faces at all.
 */
export function sewFacesIntoSolids(faces: KernelShape[], tolerance: number): UnknownDimShape {
  const kernel = getKernel();
  const solid = solidify(faces, tolerance);
  if (solid !== null) return solid;
  const sewn = castResultShape(kernel.sew(faces, tolerance));
  const shells = getShells(sewn);
  const shellFaces = shells.reduce((n, shell) => n + subShapeCount(shell, 'face'), 0);
  const hasLooseFaces = shellFaces !== subShapeCount(sewn, 'face');
  if (shells.length === 0 || (shells.length === 1 && !hasLooseFaces)) return sewn;
  using _sewn = sewn;
  // Every shape built here is released on the way out, even when a step throws.
  const owned: AnyShape<Dimension>[] = [];
  try {
    const bodies = shells.map((shell) => {
      const body = solidifyShell(shell.wrapped, tolerance);
      owned.push(body);
      return body;
    });
    const parts = carveCavities(bodies, shells, owned);
    if (hasLooseFaces) {
      for (const face of facesOutsideShells(sewn, shells)) {
        const copy = castResultShape(kernel.copyShape(face.wrapped));
        owned.push(copy);
        parts.push(copy);
      }
    }
    return makeCompound(parts);
  } finally {
    for (const shape of owned) shape[Symbol.dispose]();
  }
}

function facesOutsideShells(sewn: AnyShape<Dimension>, shells: Shell[]): Face<Dimension>[] {
  const kernel = getKernel();
  const inShells = new Map<number, KernelShape[]>();
  for (const shell of shells) {
    for (const face of getFaces(shell)) {
      const hash = kernel.hashCode(face.wrapped, HASH_CODE_MAX);
      const bucket = inShells.get(hash);
      if (bucket) bucket.push(face.wrapped);
      else inShells.set(hash, [face.wrapped]);
    }
  }
  return getFaces(sewn).filter((face) => {
    const bucket = inShells.get(kernel.hashCode(face.wrapped, HASH_CODE_MAX));
    return !bucket?.some((other) => kernel.isSame(face.wrapped, other));
  });
}

/**
 * `sewAndSolidify` when it yields a single solid, else `null`. Kernels signal
 * "not one closed body" differently: occt-wasm's solid downcast throws (and
 * castResultShape releases the slot), while opencascade.js returns the sewn
 * shell or compound, so the result's type decides.
 */
function solidify(faces: KernelShape[], tolerance: number): AnyShape<Dimension> | null {
  let shape: AnyShape<Dimension>;
  try {
    shape = castResultShape(getKernel().sewAndSolidify(faces, tolerance));
  } catch {
    return null;
  }
  if (isSolid(shape)) return shape;
  shape[Symbol.dispose]();
  return null;
}

function solidifyShell(shell: KernelShape, tolerance: number): AnyShape<Dimension> {
  const kernel = getKernel();
  const faces = kernel.iterShapes(shell, 'face');
  try {
    return solidify(faces, tolerance) ?? castResultShape(kernel.copyShape(shell));
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
