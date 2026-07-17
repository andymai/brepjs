/**
 * Lineage references for *generated* faces — fillet rounds and chamfer bevels.
 *
 * A generated face has no stable hash: it doesn't exist until the op runs, and
 * fillet/chamfer evolution is empty on the OCCT kernels (so even the role table
 * can't track the faces it bridges). It's named instead by the two faces it
 * bridges and resolved geometrically: re-find those two faces (by their captured
 * outward normals), then take the face adjacent to *both* whose normal blends
 * both. The flanking faces are also adjacent to both, but their normals are
 * orthogonal to the bridged pair, so the blend filter rejects them. This is the
 * lineage-by-neighbors approach applied to geometry the referencing edit creates.
 */

import type { Edge, Face, Shape3D } from '@/core/shapeTypes.js';
import type { Vec3 } from '@/core/types.js';
import { getFaces } from '@/topology/topologyQueryFns.js';
import { getHashCode } from '@/topology/shapeFns.js';
import { adjacentFaceHashes, facesOfEdge, verticesOfEdge } from '@/topology/adjacencyFns.js';
import { normalAt, faceCenter } from '@/topology/faceFns.js';
import { distance, facesForRole, roleOfFace, vertexCentroid } from './roleLookup.js';
import type {
  DerivedFaceRef,
  ResolvedDerivedFaceRef,
  BrokenDerivedFaceRef,
  RoleTable,
} from './shapeRefTypes.js';

/** A face re-derives a bridged face when its normal is nearly identical. */
const NORMAL_MATCH = 0.99;
/** A generated face's normal has a positive component along BOTH bridged normals. */
const BLEND_THRESHOLD = 0.1;
/** Tiebreak distances closer than this are indistinguishable (→ ambiguous). */
const HINT_MARGIN = 1e-6;

function normalDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Faces whose outward normal nearly matches `normal` (re-derives a bridged face). */
function facesByNormal(shape: Shape3D, normal: Vec3): Face[] {
  return getFaces(shape).filter((f) => normalDot(normalAt(f), normal) > NORMAL_MATCH);
}

/**
 * Faces adjacent to BOTH face sets, excluding the sets themselves. Works purely
 * in face-hash space via `adjacentFaceHashes` (kernel-native adjacency where
 * available, no per-call edge extraction), then maps the surviving hashes back to
 * the parent's borrowed cache faces — so the returned handles keep the same
 * borrowed lifetime (freed with `shape`) the resolution path already assumes.
 */
function betweenFaces(shape: Shape3D, aFaces: readonly Face[], bFaces: readonly Face[]): Face[] {
  const exclude = new Set([...aFaces, ...bFaces].map(getHashCode));
  const adjacentToA = new Set<number>();
  for (const a of aFaces) for (const h of adjacentFaceHashes(shape, a)) adjacentToA.add(h);

  const betweenHashes: number[] = [];
  const seen = new Set<number>();
  for (const b of bFaces) {
    for (const h of adjacentFaceHashes(shape, b)) {
      if (exclude.has(h) || seen.has(h) || !adjacentToA.has(h)) continue;
      seen.add(h);
      betweenHashes.push(h);
    }
  }

  if (betweenHashes.length === 0) return [];
  const byHash = new Map<number, Face>(getFaces(shape).map((f) => [getHashCode(f), f]));
  return betweenHashes.map((h) => byHash.get(h)).filter((f): f is Face => f !== undefined);
}

/** Face whose center is nearest `point`; undefined on a tie (→ ambiguous). */
function nearestFace(faces: readonly Face[], point: Vec3): Face | undefined {
  let best: Face | undefined;
  let bestDist = Infinity;
  let secondDist = Infinity;
  for (const f of faces) {
    const d = distance(faceCenter(f), point);
    if (d < bestDist) {
      secondDist = bestDist;
      bestDist = d;
      best = f;
    } else if (d < secondDist) {
      secondDist = d;
    }
  }
  if (best === undefined || secondDist - bestDist < HINT_MARGIN) return undefined;
  return best;
}

/**
 * Capture a reference to the face an `op` (fillet/chamfer) will generate across
 * `edge`: the roles of the edge's two faces, their outward normals, and the edge
 * midpoint. Call this on the PRE-op shape. Returns undefined when the edge
 * doesn't bound two named faces.
 */
export function createDerivedFaceRef(
  origin: string,
  op: 'fillet' | 'chamfer',
  edge: Edge,
  preShape: Shape3D,
  roles: RoleTable
): DerivedFaceRef | undefined {
  const [faceA, faceB] = facesOfEdge(preShape, edge);
  if (faceA === undefined || faceB === undefined) return undefined;
  const roleA = roleOfFace(faceA, origin, roles);
  const roleB = roleOfFace(faceB, origin, roles);
  if (roleA === undefined || roleB === undefined) return undefined;
  return {
    origin,
    op,
    betweenRoles: [roleA, roleB],
    hint: {
      entityType: 'derived-face',
      normalA: normalAt(faceA),
      normalB: normalAt(faceB),
      edgeMidpoint: vertexCentroid(verticesOfEdge(edge)),
    },
  };
}

/**
 * Resolve a DerivedFaceRef in the post-op `shape`: re-derive the two bridged
 * faces (role table, else by captured normal), then return the face adjacent to
 * both whose normal blends both. One survivor → resolved; several →
 * nearest-to-edge-midpoint; none → broken.
 */
export function resolveDerivedFaceRef(
  ref: DerivedFaceRef,
  roles: RoleTable,
  shape: Shape3D
): ResolvedDerivedFaceRef | BrokenDerivedFaceRef {
  let aFaces = facesForRole(shape, ref.origin, ref.betweenRoles[0], roles);
  if (aFaces.length === 0) aFaces = facesByNormal(shape, ref.hint.normalA);
  let bFaces = facesForRole(shape, ref.origin, ref.betweenRoles[1], roles);
  if (bFaces.length === 0) bFaces = facesByNormal(shape, ref.hint.normalB);
  if (aFaces.length === 0 || bFaces.length === 0) return { ref, reason: 'not-found' };

  const blended = betweenFaces(shape, aFaces, bFaces).filter(
    (f) =>
      normalDot(normalAt(f), ref.hint.normalA) > BLEND_THRESHOLD &&
      normalDot(normalAt(f), ref.hint.normalB) > BLEND_THRESHOLD
  );

  if (blended.length === 1) {
    const [only] = blended;
    if (only !== undefined) return { face: only, confidence: 'geometric-fallback' };
  }
  if (blended.length > 1) {
    const best = ref.hint.edgeMidpoint && nearestFace(blended, ref.hint.edgeMidpoint);
    if (best) return { face: best, confidence: 'geometric-fallback' };
    return { ref, reason: 'ambiguous', candidates: blended };
  }
  return { ref, reason: 'not-found' };
}
