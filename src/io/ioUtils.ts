/**
 * Shared mesh-to-solid sewing utilities for mesh importers.
 *
 * Builds triangular B-Rep faces from vertex/index data and sews them into one
 * solid per closed body, keeping any open body as a shell.
 */

import { getKernel } from '@/kernel/index.js';
import type { KernelShape } from '@/kernel/types.js';
import type { AnyShape, Dimension, Face, Shell, UnknownDimShape } from '@/core/shapeTypes.js';
import { castResultShape, isCompound, isShell, isSolid } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { ioError } from '@/core/errors.js';
import { HASH_CODE_MAX } from '@/core/constants.js';
import { getFaces, getShells, subShapeCount } from '@/topology/topologyQueryFns.js';
import { makeCompound } from '@/topology/solidBuilders.js';
import { type BodyOutline, carveCavities, shellOutline } from './meshNesting.js';
import { type MeshTopology, analyzeMesh, meshBodyOutline } from './meshTopology.js';

type Vec3 = [number, number, number];

/**
 * Sew faces into one solid per closed body.
 *
 * A single body comes back on its own: a `Solid` when closed, a `Shell` when
 * open. Several bodies come back as a `Compound` holding a `Solid` per closed
 * body, a `Shell` per open one, and any face that joined no shell. An
 * inward-facing closed shell inside another body is a cavity, cut from that
 * body. The caller keeps ownership of `faces`.
 *
 * Pass `mesh`, the {@link sewableTopology} of the triangles `faces` were built
 * from (face `i` from triangle `i`), to skip the kernel's orientation
 * repair, which is nearly all of the time: when the sewn faces have exactly the
 * vertices, edges, and shells it predicts, each closed body becomes a solid
 * straight from its shell.
 *
 * @throws When the kernel cannot sew the faces at all.
 */
export function sewFacesIntoSolids(
  faces: KernelShape[],
  tolerance: number,
  mesh?: MeshTopology | null
): UnknownDimShape {
  if (mesh) {
    const sewn = sewKnownMesh(faces, tolerance, mesh);
    if (sewn !== null) return sewn;
  }
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
    const bodies: AnyShape<Dimension>[] = [];
    const outlines: BodyOutline[] = [];
    for (const shell of shells) {
      const body = solidifyShell(shell.wrapped, tolerance);
      owned.push(body);
      bodies.push(body);
      outlines.push(shellOutline(body, shell));
    }
    const parts = carveCavities(bodies, outlines, owned);
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

/**
 * {@link sewFacesIntoSolids} for a mesh whose topology is known, or `null` when
 * the kernel's sewing doesn't reproduce it exactly (say, it merged two vertices
 * within tolerance, or a triangle built no face), leaving the caller to repair.
 */
function sewKnownMesh(
  faces: KernelShape[],
  tolerance: number,
  mesh: MeshTopology
): UnknownDimShape | null {
  if (faces.length !== mesh.corners.length / 3) return null;
  const sewn = castResultShape(getKernel().sew(faces, tolerance));
  const shellBodies = mesh.bodies.filter((body) => body.triangles.length > 1);
  if (
    !hasTopology(sewn, mesh.vertexCount, mesh.edgeCount, faces.length) ||
    getShells(sewn).length !== shellBodies.length
  ) {
    sewn[Symbol.dispose]();
    return null;
  }
  const [single, ...more] = mesh.bodies;
  if (single === undefined || shellBodies.length === 0) return sewn;
  if (more.length > 0) {
    using _sewn = sewn;
    return sewBodies(faces, tolerance, mesh);
  }
  if (!single.closed) return sewn;
  using shell = sewn;
  return isShell(shell) ? outwardSolid(shell, single.volume) : null;
}

/** Each body of `mesh` sewn on its own, so its triangles say which way it faces. */
function sewBodies(
  faces: KernelShape[],
  tolerance: number,
  mesh: MeshTopology
): UnknownDimShape | null {
  const kernel = getKernel();
  // Every shape built here is released on the way out, even when a step throws.
  const owned: AnyShape<Dimension>[] = [];
  try {
    const bodies: AnyShape<Dimension>[] = [];
    const outlines: Array<BodyOutline | undefined> = [];
    const looseFaces: AnyShape<Dimension>[] = [];
    for (const body of mesh.bodies) {
      const own = body.triangles.flatMap((t) => faces[t] ?? []);
      const [face] = own;
      if (own.length === 1 && face !== undefined) {
        const copy = castResultShape(kernel.copyShape(face));
        owned.push(copy);
        looseFaces.push(copy);
        continue;
      }
      const shell = castResultShape(kernel.sew(own, tolerance));
      owned.push(shell);
      if (!isShell(shell) || !hasTopology(shell, body.vertexCount, body.edgeCount, own.length)) {
        return null;
      }
      if (!body.closed) {
        bodies.push(shell);
        outlines.push(undefined);
        continue;
      }
      const solid = outwardSolid(shell, body.volume);
      owned.push(solid);
      bodies.push(solid);
      outlines.push(meshBodyOutline(mesh, body));
    }
    return makeCompound([...carveCavities(bodies, outlines, owned), ...looseFaces]);
  } finally {
    for (const shape of owned) shape[Symbol.dispose]();
  }
}

function hasTopology(
  shape: AnyShape<Dimension>,
  vertices: number,
  edges: number,
  faces: number
): boolean {
  return (
    subShapeCount(shape, 'face') === faces &&
    subShapeCount(shape, 'edge') === edges &&
    subShapeCount(shape, 'vertex') === vertices
  );
}

/**
 * The solid bounded by a consistently oriented closed shell, turned outward when
 * the shell's triangles face in (`volume` negative).
 */
function outwardSolid(shell: Shell, volume: number): AnyShape<Dimension> {
  const kernel = getKernel();
  if (volume > 0) return castResultShape(kernel.solidFromShell(shell.wrapped));
  using reversed = castResultShape(kernel.reverseShape(shell.wrapped));
  return castResultShape(kernel.solidFromShell(reversed.wrapped));
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
 * A compound of one face per triangle, in order, sharing vertices and edges so
 * that sewing it is cheap. The kernel's STL reader is the only way to build
 * faces that share them; a text STL carries every coordinate exactly, because a
 * number prints as the shortest decimal that parses back to it. `null` when the
 * kernel returns anything else (some read an STL straight into a solid).
 */
function readerFacets(triangles: Array<[Vec3, Vec3, Vec3]>): AnyShape<Dimension> | null {
  const lines = ['solid mesh'];
  for (const [a, b, c] of triangles) {
    lines.push(
      'facet normal 0 0 0',
      'outer loop',
      `vertex ${a[0]} ${a[1]} ${a[2]}`,
      `vertex ${b[0]} ${b[1]} ${b[2]}`,
      `vertex ${c[0]} ${c[1]} ${c[2]}`,
      'endloop',
      'endfacet'
    );
  }
  lines.push('endsolid mesh', '');
  let facets: AnyShape<Dimension>;
  try {
    facets = castResultShape(getKernel().importSTL(lines.join('\n')));
  } catch {
    return null;
  }
  if (isCompound(facets) && subShapeCount(facets, 'face') === triangles.length) return facets;
  facets[Symbol.dispose]();
  return null;
}

/**
 * The {@link analyzeMesh} topology of the triangles in `positions` (nine
 * coordinates per triangle) for {@link sewFacesIntoSolids}, or `null` when the
 * mesh fails the analysis or the kernel's sewing may reorient faces.
 */
export function sewableTopology(positions: ArrayLike<number> | null): MeshTopology | null {
  if (positions === null || getKernel().capabilities.sewKeepsOrientation !== true) return null;
  return analyzeMesh(positions);
}

/** {@link sewableTopology} of `triangles`, without copying them on a kernel that can't use it. */
function sewableTriangles(triangles: Array<[Vec3, Vec3, Vec3]>): MeshTopology | null {
  if (getKernel().capabilities.sewKeepsOrientation !== true) return null;
  return sewableTopology(trianglePositions(triangles));
}

function trianglePositions(triangles: Array<[Vec3, Vec3, Vec3]>): Float64Array {
  const positions = new Float64Array(triangles.length * 9);
  triangles.forEach((triangle, t) => {
    triangle.forEach((vertex, k) => {
      positions.set(vertex, t * 9 + k * 3);
    });
  });
  return positions;
}

/**
 * Build triangular B-Rep faces from vertex data and sew them into solids with
 * {@link sewFacesIntoSolids}.
 *
 * A mesh with a {@link sewableTopology} gets its faces from the kernel's STL
 * reader, already sharing edges, when the kernel reads an STL into faces.
 * Otherwise `kernel.buildTriFace` builds a planar face per triangle.
 *
 * @param triangles - Array of vertex triples, each triple being three [x,y,z] tuples.
 * @param errorCode - The error code to use in any returned errors.
 * @param tolerance - Sewing tolerance (default 1e-6).
 * @param mesh - The triangles' {@link sewableTopology}, when the caller already has it.
 * @returns A `Result` wrapping the sewn shape, or an error.
 */
export function sewMeshToSolid(
  triangles: Array<[Vec3, Vec3, Vec3]>,
  errorCode: string,
  tolerance: number = 1e-6,
  mesh: MeshTopology | null = sewableTriangles(triangles)
): Result<UnknownDimShape> {
  const facets = mesh ? readerFacets(triangles) : null;
  if (facets !== null) {
    using _facets = facets;
    try {
      return ok(
        sewFacesIntoSolids(
          getFaces(facets).map((face) => face.wrapped),
          tolerance,
          mesh
        )
      );
    } catch (e) {
      return err(ioError(errorCode, 'Failed to sew triangular faces', e));
    }
  }

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
    return ok(sewFacesIntoSolids(triFaces, tolerance, mesh));
  } catch (e) {
    return err(ioError(errorCode, 'Failed to sew triangular faces', e));
  } finally {
    for (const triFace of triFaces) kernel.dispose(triFace);
  }
}
