/**
 * Cavities in sewn mesh bodies.
 *
 * A hollow mesh is an outer shell plus inward-facing inner shells, and sewing makes
 * each of them a closed body of its own. Nesting depth tells them apart: a body
 * inside an odd number of others is a void in its innermost container, while one
 * inside an even number (an island in a void) stays a body of its own. Depth comes
 * from ray casts against each body's tessellation, because no kernel here can
 * classify a point against a solid.
 */

import { getKernel } from '@/kernel/index.js';
import type { KernelMeshResult } from '@/kernel/types.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { castResultShape, isSolid } from '@/core/shapeTypes.js';

type Body = AnyShape<Dimension>;
type Vec3 = [number, number, number];
interface Box {
  min: Vec3;
  max: Vec3;
}

// Off every axis and diagonal, so a ray from a mesh vertex rarely grazes an edge.
const RAY_LENGTH = Math.hypot(0.5389, 0.6213, 0.5689);
const RAY: Vec3 = [0.5389 / RAY_LENGTH, 0.6213 / RAY_LENGTH, 0.5689 / RAY_LENGTH];

/**
 * Cut every void out of the body that holds it. The voids leave the list, and
 * the bodies they are cut from are replaced; both are disposed. A body whose cut
 * fails keeps its voids as separate bodies.
 */
export function carveCavities(bodies: Body[]): Body[] {
  const solids = bodies.filter((body) => isSolid(body));
  if (solids.length < 2) return bodies;
  const voids = findVoids(solids);
  if (voids.size === 0) return bodies;

  const carved = new Map<Body, Body>();
  for (const [body, inner] of voids) {
    const result = cutVoids(body, inner);
    if (result !== null) carved.set(body, result);
  }
  const consumed = new Set([...carved.keys()].flatMap((body) => voids.get(body) ?? []));
  const kept: Body[] = [];
  for (const body of bodies) {
    const result = carved.get(body);
    if (result !== undefined) {
      kept.push(result);
      body[Symbol.dispose]();
    } else if (consumed.has(body)) {
      body[Symbol.dispose]();
    } else {
      kept.push(body);
    }
  }
  return kept;
}

/** The voids of each body that has any, keyed by that body. */
function findVoids(solids: Body[]): Map<Body, Body[]> {
  const kernel = getKernel();
  const boxes = solids.map((solid) => kernel.boundingBox(solid.wrapped));
  const meshes = new Map<number, KernelMeshResult>();
  const meshOf = (i: number): KernelMeshResult => {
    let mesh = meshes.get(i);
    if (mesh === undefined) {
      mesh = meshSolid(solids[i] as Body, boxes[i] as Box);
      meshes.set(i, mesh);
    }
    return mesh;
  };
  const containers = solids.map((_, j) =>
    solids
      .map((_outer, i) => i)
      .filter(
        (i) =>
          i !== j &&
          boxInside(boxes[j] as Box, boxes[i] as Box) &&
          insideMesh(firstVertex(meshOf(j)), meshOf(i))
      )
  );

  const voids = new Map<Body, Body[]>();
  containers.forEach((around, j) => {
    if (around.length % 2 === 0) return;
    // The innermost container is the one nested deepest itself.
    const parent = around.reduce((a, b) =>
      (containers[b]?.length ?? 0) > (containers[a]?.length ?? 0) ? b : a
    );
    const body = solids[parent] as Body;
    voids.set(body, [...(voids.get(body) ?? []), solids[j] as Body]);
  });
  return voids;
}

function cutVoids(body: Body, voids: Body[]): Body | null {
  const kernel = getKernel();
  let current = body;
  for (const inner of voids) {
    let next: Body;
    try {
      next = castResultShape(kernel.cut(current.wrapped, inner.wrapped));
    } catch {
      if (current !== body) current[Symbol.dispose]();
      return null;
    }
    if (current !== body) current[Symbol.dispose]();
    current = next;
  }
  return current;
}

function meshSolid(solid: Body, box: Box): KernelMeshResult {
  const diagonal = Math.hypot(...box.max.map((v, i) => v - (box.min[i] ?? 0)));
  return getKernel().mesh(solid.wrapped, {
    tolerance: Math.max(diagonal * 1e-3, 1e-6),
    angularTolerance: 0.5,
    skipNormals: true,
  });
}

function boxInside(inner: Box, outer: Box): boolean {
  return inner.min.every(
    (v, i) => v >= (outer.min[i] ?? 0) && (inner.max[i] ?? 0) <= (outer.max[i] ?? 0)
  );
}

function firstVertex(mesh: KernelMeshResult): Vec3 {
  return [mesh.vertices[0] ?? 0, mesh.vertices[1] ?? 0, mesh.vertices[2] ?? 0];
}

function vertexAt(mesh: KernelMeshResult, index: number | undefined): Vec3 {
  const i = (index ?? 0) * 3;
  return [mesh.vertices[i] ?? 0, mesh.vertices[i + 1] ?? 0, mesh.vertices[i + 2] ?? 0];
}

/** Whether `p` is inside the closed mesh, by the parity of a ray's crossings. */
function insideMesh(p: Vec3, mesh: KernelMeshResult): boolean {
  const t = mesh.triangles;
  let crossings = 0;
  for (let i = 0; i + 2 < t.length; i += 3) {
    if (rayHits(p, vertexAt(mesh, t[i]), vertexAt(mesh, t[i + 1]), vertexAt(mesh, t[i + 2]))) {
      crossings++;
    }
  }
  return crossings % 2 === 1;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Moller-Trumbore: does the ray from `p` along RAY cross triangle abc ahead of `p`? */
function rayHits(p: Vec3, a: Vec3, b: Vec3, c: Vec3): boolean {
  const e1 = sub(b, a);
  const e2 = sub(c, a);
  const h = cross(RAY, e2);
  const det = dot(e1, h);
  if (det === 0) return false;
  const s = sub(p, a);
  const u = dot(s, h) / det;
  if (u < 0 || u > 1) return false;
  const q = cross(s, e1);
  const v = dot(RAY, q) / det;
  if (v < 0 || u + v > 1) return false;
  return dot(e2, q) / det > 0;
}
