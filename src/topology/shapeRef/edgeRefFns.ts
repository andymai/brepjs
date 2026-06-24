/**
 * Lineage-based edge references. An edge's stable identity is the pair of roles
 * of its two adjacent faces — "an edge is the intersection of its two faces."
 * Capture snapshots those two face-roles (`facesOfEdge` + reverse role lookup);
 * resolution finds the edge shared by the current faces of those roles
 * (`sharedEdges`). Because identity rides on the (separately-resolved, split-
 * aware) face roles, an edge ref survives edits that re-hash the edge, and it
 * never touches the kernel's unreliable `generated`-face hashes.
 */

import type { Edge, Face, Shape3D, Vertex } from '@/core/shapeTypes.js';
import type { Vec3 } from '@/core/types.js';
import { getFaces, vertexPosition } from '@/topology/topologyQueryFns.js';
import { getHashCode } from '@/topology/shapeFns.js';
import { facesOfEdge, sharedEdges, verticesOfEdge } from '@/topology/adjacencyFns.js';
import { measureLength } from '@/measurement/measureFns.js';
import type {
  EdgeHint,
  EdgeRef,
  ResolvedEdgeRef,
  BrokenEdgeRef,
  RoleTable,
} from './shapeRefTypes.js';

// ---------------------------------------------------------------------------
// Geometry helpers (hint capture + tiebreaking)
// ---------------------------------------------------------------------------

/** Midpoint of an edge's endpoint vertices (a closed edge collapses to one). */
function endpointMidpoint(verts: readonly Vertex[]): Vec3 | undefined {
  if (verts.length === 0) return undefined;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const v of verts) {
    const p = vertexPosition(v);
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = verts.length;
  return [x / n, y / n, z / n];
}

function distance(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function captureEdgeHint(edge: Edge): EdgeHint {
  const lengthResult = measureLength(edge);
  return {
    entityType: 'edge',
    length: lengthResult.ok ? lengthResult.value : undefined,
    midpoint: endpointMidpoint(verticesOfEdge(edge)),
  };
}

// ---------------------------------------------------------------------------
// Role lookups
// ---------------------------------------------------------------------------

/** Reverse the role table: the role whose tracked hashes include this face. */
function roleOfFace(face: Face, origin: string, roles: RoleTable): string | undefined {
  const originRoles = roles.get(origin);
  if (!originRoles) return undefined;
  const hash = getHashCode(face);
  for (const [role, hashes] of originRoles) {
    if (hashes.includes(hash)) return role;
  }
  return undefined;
}

/** Current faces a role resolves to (its tracked successors present in `shape`). */
function facesForRole(shape: Shape3D, origin: string, role: string, roles: RoleTable): Face[] {
  const hashes = roles.get(origin)?.get(role);
  if (hashes === undefined || hashes.length === 0) return [];
  return getFaces(shape).filter((f) => hashes.includes(getHashCode(f)));
}

function dedupeEdges(edges: readonly Edge[]): Edge[] {
  const seen = new Set<number>();
  const out: Edge[] = [];
  for (const e of edges) {
    const h = getHashCode(e);
    if (!seen.has(h)) {
      seen.add(h);
      out.push(e);
    }
  }
  return out;
}

/** Hint scores closer than this are treated as indistinguishable (→ ambiguous). */
const HINT_MARGIN = 1e-6;

/**
 * Pick the candidate edge closest to the hint (length + endpoint midpoint).
 * Returns undefined when it genuinely can't discriminate — the hint carries no
 * signal, or the two best candidates score within {@link HINT_MARGIN} — so the
 * caller can report `ambiguous` rather than committing to an arbitrary edge.
 */
function bestByHint(candidates: readonly Edge[], hint: EdgeHint): Edge | undefined {
  if (hint.length === undefined && hint.midpoint === undefined) return undefined;
  let best: Edge | undefined;
  let bestScore = Infinity;
  let secondScore = Infinity;
  for (const edge of candidates) {
    let score = 0;
    if (hint.length !== undefined) {
      const len = measureLength(edge);
      if (len.ok) score += Math.abs(len.value - hint.length);
    }
    if (hint.midpoint !== undefined) {
      const mid = endpointMidpoint(verticesOfEdge(edge));
      if (mid !== undefined) score += distance(hint.midpoint, mid);
    }
    if (score < bestScore) {
      secondScore = bestScore;
      bestScore = score;
      best = edge;
    } else if (score < secondScore) {
      secondScore = score;
    }
  }
  if (best === undefined || secondScore - bestScore < HINT_MARGIN) return undefined;
  return best;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Capture a lineage-based reference to `edge`: its two adjacent faces' roles
 * plus a geometric hint. Returns undefined when the edge doesn't bound two faces
 * (a boundary/degenerate edge) or when either bounding face has no role yet.
 */
export function createEdgeRef(
  origin: string,
  edge: Edge,
  shape: Shape3D,
  roles: RoleTable
): EdgeRef | undefined {
  const [faceA, faceB] = facesOfEdge(shape, edge);
  if (faceA === undefined || faceB === undefined) return undefined;
  const roleA = roleOfFace(faceA, origin, roles);
  const roleB = roleOfFace(faceB, origin, roles);
  if (roleA === undefined || roleB === undefined) return undefined;
  return { origin, faceRoles: [roleA, roleB], hint: captureEdgeHint(edge) };
}

/**
 * Resolve an EdgeRef in `shape`: resolve its two face-roles to current faces,
 * then return the edge they share. One shared edge → exact; several (the two
 * faces meet along more than one edge) → disambiguate by hint; none, or a
 * missing bounding face → broken.
 */
export function resolveEdgeRef(
  ref: EdgeRef,
  roles: RoleTable,
  shape: Shape3D
): ResolvedEdgeRef | BrokenEdgeRef {
  const [roleA, roleB] = ref.faceRoles;
  const facesA = facesForRole(shape, ref.origin, roleA, roles);
  const facesB = facesForRole(shape, ref.origin, roleB, roles);
  if (facesA.length === 0 || facesB.length === 0) {
    return { ref, reason: 'not-found' };
  }

  const candidates: Edge[] = [];
  for (const a of facesA) {
    for (const b of facesB) candidates.push(...sharedEdges(a, b));
  }
  const unique = dedupeEdges(candidates);

  if (unique.length === 1) {
    const [only] = unique;
    if (only !== undefined) return { edge: only, confidence: 'exact' };
  }
  if (unique.length > 1) {
    const best = bestByHint(unique, ref.hint);
    if (best !== undefined) return { edge: best, confidence: 'geometric-fallback' };
    return { ref, reason: 'ambiguous', candidates: unique };
  }
  return { ref, reason: 'not-found' };
}
