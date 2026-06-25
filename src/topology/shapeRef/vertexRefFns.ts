/**
 * Lineage-based vertex references. A solid corner is where ≥3 faces meet at a
 * point, so a vertex's stable identity is the SET of its adjacent face-roles
 * (two faces meet along an edge with two endpoints → ambiguous; three pin a
 * point). Capture snapshots those roles (`facesOfVertex` + reverse lookup);
 * resolution finds the vertex common to the current faces of those roles
 * (`verticesOfFace` intersection). Rides the split-aware role table, and — like
 * edges — never touches the kernel's unreliable `generated` hashes.
 */

import type { Face, Shape3D, Vertex } from '@/core/shapeTypes.js';
import { vertexPosition } from '@/topology/topologyQueryFns.js';
import { getHashCode } from '@/topology/shapeFns.js';
import { facesOfVertex, verticesOfFace } from '@/topology/adjacencyFns.js';
import { distance, facesForRole, roleOfFace } from './roleLookup.js';
import type {
  VertexHint,
  VertexRef,
  ResolvedVertexRef,
  BrokenVertexRef,
  RoleTable,
} from './shapeRefTypes.js';

/** A corner needs at least this many faces to pin a unique point. */
const MIN_VERTEX_FACES = 3;
/** Hint distances closer than this are indistinguishable (→ ambiguous). */
const HINT_MARGIN = 1e-6;

/** Hashes of all vertices across `faces`, recording one handle per hash. */
function vertexHashes(faces: readonly Face[], handles: Map<number, Vertex>): Set<number> {
  const hashes = new Set<number>();
  for (const f of faces) {
    for (const v of verticesOfFace(f)) {
      const h = getHashCode(v);
      hashes.add(h);
      if (!handles.has(h)) handles.set(h, v);
    }
  }
  return hashes;
}

function intersect(a: Set<number>, b: Set<number>): Set<number> {
  const out = new Set<number>();
  for (const h of a) if (b.has(h)) out.add(h);
  return out;
}

/** Vertices present in (a face of) every face-set — the shared corner(s). */
function commonVertices(faceSets: readonly Face[][]): Vertex[] {
  const handles = new Map<number, Vertex>();
  let common: Set<number> | undefined;
  for (const faces of faceSets) {
    const hashes = vertexHashes(faces, handles);
    common = common === undefined ? hashes : intersect(common, hashes);
  }
  if (common === undefined) return [];
  const result: Vertex[] = [];
  for (const h of common) {
    const v = handles.get(h);
    if (v !== undefined) result.push(v);
  }
  return result;
}

/** Nearest candidate to the hint position; undefined if no signal or a tie. */
function nearestToHint(vertices: readonly Vertex[], hint: VertexHint): Vertex | undefined {
  if (hint.position === undefined) return undefined;
  let best: Vertex | undefined;
  let bestDist = Infinity;
  let secondDist = Infinity;
  for (const v of vertices) {
    const d = distance(vertexPosition(v), hint.position);
    if (d < bestDist) {
      secondDist = bestDist;
      bestDist = d;
      best = v;
    } else if (d < secondDist) {
      secondDist = d;
    }
  }
  if (best === undefined || secondDist - bestDist < HINT_MARGIN) return undefined;
  return best;
}

/**
 * Capture a lineage-based reference to `vertex`: the roles of the ≥3 faces
 * meeting at it, plus a position hint. Returns undefined when fewer than three
 * named faces meet there (a 2-face "vertex" is ambiguous — an edge has two).
 */
export function createVertexRef(
  origin: string,
  vertex: Vertex,
  shape: Shape3D,
  roles: RoleTable
): VertexRef | undefined {
  const faces = facesOfVertex(shape, vertex);
  if (faces.length < MIN_VERTEX_FACES) return undefined;
  const roleSet = new Set<string>();
  for (const f of faces) {
    const role = roleOfFace(f, origin, roles);
    if (role !== undefined) roleSet.add(role);
  }
  if (roleSet.size < MIN_VERTEX_FACES) return undefined;
  return {
    origin,
    faceRoles: [...roleSet].sort(),
    hint: { entityType: 'vertex', position: vertexPosition(vertex) },
  };
}

/**
 * Resolve a VertexRef in `shape`: gather the current faces of each role, then
 * return the vertex common to all of them. One common vertex → exact; several →
 * disambiguate by hint position; none, or a missing role → broken.
 */
export function resolveVertexRef(
  ref: VertexRef,
  roles: RoleTable,
  shape: Shape3D
): ResolvedVertexRef | BrokenVertexRef {
  const faceSets: Face[][] = [];
  for (const role of ref.faceRoles) {
    const faces = facesForRole(shape, ref.origin, role, roles);
    if (faces.length === 0) return { ref, reason: 'not-found' };
    faceSets.push(faces);
  }

  const common = commonVertices(faceSets);
  if (common.length === 1) {
    const [only] = common;
    if (only !== undefined) return { vertex: only, confidence: 'exact' };
  }
  if (common.length > 1) {
    const best = nearestToHint(common, ref.hint);
    if (best !== undefined) return { vertex: best, confidence: 'geometric-fallback' };
    return { ref, reason: 'ambiguous', candidates: common };
  }
  return { ref, reason: 'not-found' };
}
