/**
 * Cavities in sewn mesh bodies.
 *
 * A hollow mesh is an outer shell plus inward-facing inner shells, and sewing makes
 * each of them a closed body of its own. A cavity is a shell whose triangles face
 * inward (negative signed volume, read before solidifying reorients it) that lies
 * inside another body; it is cut from the innermost body around it. An outward-facing
 * shell inside another is a separate part and stays one. Containment comes from ray
 * casts against each body's triangles, because no kernel here can classify a point
 * against a solid.
 */

import { getKernel } from '@/kernel/index.js';
import type { AnyShape, Dimension, Shell } from '@/core/shapeTypes.js';
import { castResultShape, isSolid } from '@/core/shapeTypes.js';

type Body = AnyShape<Dimension>;
type Vec3 = [number, number, number];
export interface Box {
  min: Vec3;
  max: Vec3;
}

/** Triangles as vertex coordinates (three per vertex) and vertex indices (three per triangle). */
interface Triangles {
  vertices: ArrayLike<number>;
  triangles: ArrayLike<number>;
}

/** What nesting needs to know about a closed body. */
export interface BodyOutline {
  box(): Box;
  /** The body's boundary as triangles. */
  mesh(): Triangles;
  /** Whether the body's triangles faced inward before it was solidified. */
  facesInward(): boolean;
}

/** The outline of `body`, read from the kernel; `shell` is the sewn shell it was built from. */
export function shellOutline(body: Body, shell: Shell): BodyOutline {
  let box: Box | undefined;
  let mesh: Triangles | undefined;
  const boxOf = (): Box => (box ??= getKernel().boundingBox(body.wrapped));
  return {
    box: boxOf,
    mesh: () => (mesh ??= meshShape(body, boxOf())),
    facesInward: () => facesInward(shell, boxOf()),
  };
}

// Off every axis and diagonal, so a ray from a mesh vertex rarely grazes an edge.
const RAY_LENGTH = Math.hypot(0.5389, 0.6213, 0.5689);
const RAY: Vec3 = [0.5389 / RAY_LENGTH, 0.6213 / RAY_LENGTH, 0.5689 / RAY_LENGTH];

/**
 * The parts to keep: `bodies` (each described by the same-index entry of
 * `outlines`) with every cavity cut from the body around it and left out. Cut
 * results are pushed to `owned` for the caller to dispose; no input is disposed
 * here.
 *
 * @throws When meshing or a cut fails, rather than leave a cavity filled.
 */
export function carveCavities(
  bodies: Body[],
  outlines: Array<BodyOutline | undefined>,
  owned: Body[]
): Body[] {
  const solids = bodies.flatMap((body, i) => {
    const outline = outlines[i];
    return isSolid(body) && outline !== undefined ? [{ body, outline }] : [];
  });
  if (solids.length < 2) return [...bodies];
  const voids = findVoids(solids);

  const carved = new Map<Body, Body>();
  for (const [body, inner] of voids) {
    const result = cutVoids(body, inner);
    owned.push(result);
    carved.set(body, result);
  }
  const consumed = new Set([...carved.keys()].flatMap((body) => voids.get(body) ?? []));
  return bodies.filter((body) => !consumed.has(body)).map((body) => carved.get(body) ?? body);
}

/** The cavities of each body that has any, keyed by that body. */
function findVoids(solids: Array<{ body: Body; outline: BodyOutline }>): Map<Body, Body[]> {
  const boxes = solids.map(({ outline }) => outline.box());
  const meshOf = (i: number): Triangles => (solids[i] as { outline: BodyOutline }).outline.mesh();
  const containers = solids.map((_inner, j) =>
    solids
      .map((_outer, i) => i)
      .filter(
        (i) =>
          i !== j &&
          boxInside(boxes[j] as Box, boxes[i] as Box) &&
          insideMesh(firstVertex(meshOf(j)), meshOf(i))
      )
  );

  const isVoid = containers.map(
    (around, j) => around.length > 0 && solids[j]?.outline.facesInward() === true
  );
  const voids = new Map<Body, Body[]>();
  containers.forEach((around, j) => {
    if (!isVoid[j]) return;
    // The innermost body around the cavity is the one nested deepest itself.
    const bodiesAround = around.filter((i) => !isVoid[i]);
    if (bodiesAround.length === 0) return;
    const parent = bodiesAround.reduce((a, b) =>
      (containers[b]?.length ?? 0) > (containers[a]?.length ?? 0) ? b : a
    );
    const body = (solids[parent] as { body: Body }).body;
    voids.set(body, [...(voids.get(body) ?? []), (solids[j] as { body: Body }).body]);
  });
  return voids;
}

/** Whether a closed shell's triangles face inward, by the sign of its enclosed volume. */
function facesInward(shell: Shell, box: Box): boolean {
  const mesh = meshShape(shell, box);
  const t = mesh.triangles;
  let volume = 0;
  for (let i = 0; i + 2 < t.length; i += 3) {
    const a = vertexAt(mesh, t[i]);
    volume += dot(a, cross(vertexAt(mesh, t[i + 1]), vertexAt(mesh, t[i + 2])));
  }
  return volume < 0;
}

function cutVoids(body: Body, voids: Body[]): Body {
  const kernel = getKernel();
  let current = body;
  for (const inner of voids) {
    try {
      const next = castResultShape(kernel.cut(current.wrapped, inner.wrapped));
      if (current !== body) current[Symbol.dispose]();
      current = next;
    } catch (e) {
      if (current !== body) current[Symbol.dispose]();
      throw e;
    }
  }
  return current;
}

function meshShape(shape: Body, box: Box): Triangles {
  const diagonal = Math.hypot(...box.max.map((v, i) => v - (box.min[i] ?? 0)));
  return getKernel().mesh(shape.wrapped, {
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

function firstVertex(mesh: Triangles): Vec3 {
  return vertexAt(mesh, mesh.triangles[0]);
}

function vertexAt(mesh: Triangles, index: number | undefined): Vec3 {
  const i = (index ?? 0) * 3;
  return [mesh.vertices[i] ?? 0, mesh.vertices[i + 1] ?? 0, mesh.vertices[i + 2] ?? 0];
}

/** Whether `p` is inside the closed mesh, by the parity of a ray's crossings. */
function insideMesh(p: Vec3, mesh: Triangles): boolean {
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
