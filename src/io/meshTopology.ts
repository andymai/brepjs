/**
 * The structure of a triangle mesh, read from its coordinates before anything is
 * sewn: which triangles form each body, whether the body is closed, and which way
 * it faces. A mesh whose shared edges all run in opposite directions in their two
 * triangles sews into consistently oriented shells, so a closed one becomes a
 * solid without an orientation repair pass.
 */

import type { BodyOutline, Box } from './meshNesting.js';

/** Triangles joined edge to edge. */
export interface MeshBody {
  /** Indices of the body's triangles in the mesh. */
  readonly triangles: readonly number[];
  readonly vertexCount: number;
  readonly edgeCount: number;
  /** Every edge joins two of the body's triangles. */
  readonly closed: boolean;
  /** Enclosed volume, negative when the triangles face inward. Zero for an open body. */
  readonly volume: number;
}

export interface MeshTopology {
  readonly vertexCount: number;
  readonly edgeCount: number;
  readonly bodies: readonly MeshBody[];
  /** Welded vertex coordinates, three per vertex. */
  readonly vertices: Float64Array;
  /** Welded vertex indices, three per triangle in the mesh's order. */
  readonly corners: Uint32Array;
}

/**
 * The topology of the triangles in `positions` (nine coordinates per triangle),
 * welding vertices whose coordinates are identical.
 *
 * Returns `null` for a mesh that sewing might change rather than reproduce: a
 * non-finite coordinate, a triangle with a repeated vertex or no area, an edge
 * shared by more than two triangles, two triangles running the same direction
 * along their shared edge, or a closed body that encloses no volume.
 */
export function analyzeMesh(positions: ArrayLike<number>): MeshTopology | null {
  const welded = weld(positions);
  if (welded === null) return null;
  const { vertices, corners } = welded;
  const triangleCount = corners.length / 3;
  if (triangleCount === 0) return null;
  for (let t = 0; t < triangleCount; t++) {
    if (!hasArea(vertices, corners, t)) return null;
  }
  const edges = pairEdges(corners, vertices.length / 3);
  if (edges === null) return null;

  const bodies: MeshBody[] = [];
  const stamp = new Int32Array(vertices.length / 3).fill(-1);
  for (const triangles of edges.groups) {
    const body = describeBody(triangles, vertices, corners, edges.boundary, stamp, bodies.length);
    if (body === null) return null;
    bodies.push(body);
  }
  return {
    vertexCount: vertices.length / 3,
    edgeCount: edges.count,
    bodies,
    vertices,
    corners,
  };
}

/** What nesting needs to know about a closed body of `mesh`, read from its triangles. */
export function meshBodyOutline(mesh: MeshTopology, body: MeshBody): BodyOutline {
  const triangles = new Uint32Array(body.triangles.length * 3);
  body.triangles.forEach((t, i) => {
    triangles.set(mesh.corners.subarray(t * 3, t * 3 + 3), i * 3);
  });
  const box: Box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const v of triangles) {
    for (let axis = 0; axis < 3; axis++) {
      const c = mesh.vertices[v * 3 + axis] ?? 0;
      if (c < (box.min[axis] ?? 0)) box.min[axis] = c;
      if (c > (box.max[axis] ?? 0)) box.max[axis] = c;
    }
  }
  return {
    box: () => box,
    mesh: () => ({ vertices: mesh.vertices, triangles }),
    facesInward: () => body.volume < 0,
  };
}

function weld(
  positions: ArrayLike<number>
): { vertices: Float64Array; corners: Uint32Array } | null {
  if (positions.length % 9 !== 0) return null;
  const corners = new Uint32Array(positions.length / 3);
  const index = new Map<string, number>();
  const coords: number[] = [];
  for (let i = 0; i < corners.length; i++) {
    const x = positions[i * 3] ?? NaN;
    const y = positions[i * 3 + 1] ?? NaN;
    const z = positions[i * 3 + 2] ?? NaN;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    // Template literals print -0 as "0", so both zeros weld to one vertex.
    const key = `${x},${y},${z}`;
    let v = index.get(key);
    if (v === undefined) {
      v = index.size;
      index.set(key, v);
      coords.push(x, y, z);
    }
    corners[i] = v;
  }
  return { vertices: Float64Array.from(coords), corners };
}

function hasArea(vertices: Float64Array, corners: Uint32Array, t: number): boolean {
  const a = corners[t * 3] ?? 0;
  const b = corners[t * 3 + 1] ?? 0;
  const c = corners[t * 3 + 2] ?? 0;
  if (a === b || b === c || c === a) return false;
  const n = cross(
    sub(point(vertices, b), point(vertices, a)),
    sub(point(vertices, c), point(vertices, a))
  );
  return n[0] !== 0 || n[1] !== 0 || n[2] !== 0;
}

/**
 * Match every edge with the triangle on its other side. Groups triangles joined
 * by shared edges, and counts each triangle's unshared (boundary) edges.
 */
function pairEdges(
  corners: Uint32Array,
  vertexCount: number
): { count: number; groups: number[][]; boundary: Uint8Array } | null {
  const triangleCount = corners.length / 3;
  const parent = new Int32Array(triangleCount).map((_, i) => i);
  const find = (t: number): number => {
    let root = t;
    while (parent[root] !== root) root = parent[root] ?? root;
    while (parent[t] !== root) {
      const next = parent[t] ?? root;
      parent[t] = root;
      t = next;
    }
    return root;
  };
  // Keyed by the edge's vertices (lower first); the value is the first triangle
  // to use it, plus one, negated when that triangle runs it high to low. Zero
  // once a second triangle has joined.
  const open = new Map<number, number>();
  for (let t = 0; t < triangleCount; t++) {
    for (let k = 0; k < 3; k++) {
      const a = corners[t * 3 + k] ?? 0;
      const b = corners[t * 3 + ((k + 1) % 3)] ?? 0;
      const forward = a < b;
      const key = forward ? a * vertexCount + b : b * vertexCount + a;
      const first = open.get(key);
      if (first === undefined) {
        open.set(key, forward ? t + 1 : -(t + 1));
        continue;
      }
      const firstRanForward = first > 0;
      if (first === 0 || firstRanForward === forward) return null;
      parent[find(t)] = find(Math.abs(first) - 1);
      open.set(key, 0);
    }
  }

  const boundary = new Uint8Array(triangleCount);
  for (const first of open.values()) {
    const t = Math.abs(first) - 1;
    if (first !== 0) boundary[t] = (boundary[t] ?? 0) + 1;
  }
  const groupOf = new Map<number, number[]>();
  for (let t = 0; t < triangleCount; t++) {
    const root = find(t);
    const group = groupOf.get(root);
    if (group) group.push(t);
    else groupOf.set(root, [t]);
  }
  return { count: open.size, groups: [...groupOf.values()], boundary };
}

function describeBody(
  triangles: number[],
  vertices: Float64Array,
  corners: Uint32Array,
  boundary: Uint8Array,
  stamp: Int32Array,
  id: number
): MeshBody | null {
  let vertexCount = 0;
  let boundaryEdges = 0;
  for (const t of triangles) {
    boundaryEdges += boundary[t] ?? 0;
    for (let k = 0; k < 3; k++) {
      const v = corners[t * 3 + k] ?? 0;
      if (stamp[v] !== id) {
        stamp[v] = id;
        vertexCount++;
      }
    }
  }
  const closed = boundaryEdges === 0;
  let volume = 0;
  if (closed) {
    const enclosed = enclosedVolume(triangles, vertices, corners);
    if (Math.abs(enclosed.value) <= FLAT_VOLUME * enclosed.size ** 3) return null;
    volume = enclosed.value;
  }
  return {
    triangles,
    vertexCount,
    edgeCount: (triangles.length * 3 + boundaryEdges) / 2,
    closed,
    volume,
  };
}

/** Below this fraction of its size cubed, a closed body is a flat sheet with no inside. */
const FLAT_VOLUME = 1e-12;

/**
 * Signed volume by the divergence theorem, measured from the body's first vertex
 * so a body far from the origin keeps its precision, and the body's size: its
 * farthest coordinate offset from that vertex.
 */
function enclosedVolume(
  triangles: number[],
  vertices: Float64Array,
  corners: Uint32Array
): { value: number; size: number } {
  const origin = point(vertices, corners[(triangles[0] ?? 0) * 3] ?? 0);
  let sum = 0;
  let size = 0;
  for (const t of triangles) {
    const a = sub(point(vertices, corners[t * 3] ?? 0), origin);
    const b = sub(point(vertices, corners[t * 3 + 1] ?? 0), origin);
    const c = sub(point(vertices, corners[t * 3 + 2] ?? 0), origin);
    const n = cross(b, c);
    sum += a[0] * n[0] + a[1] * n[1] + a[2] * n[2];
    size = Math.max(size, Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2]));
  }
  return { value: sum / 6, size };
}

type Vec3 = [number, number, number];

function point(vertices: Float64Array, v: number): Vec3 {
  return [vertices[v * 3] ?? 0, vertices[v * 3 + 1] ?? 0, vertices[v * 3 + 2] ?? 0];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
