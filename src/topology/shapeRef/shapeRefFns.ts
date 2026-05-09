/**
 * Core ShapeRef functions — capture hints, assign roles, create refs,
 * update roles through evolution, and resolve refs back to faces.
 */

import type { Face, Shape3D } from '@/core/shapeTypes.js';
import type { ShapeEvolution } from '@/kernel/types.js';
import { getFaces } from '@/topology/topologyQueryFns.js';
import { getHashCode } from '@/topology/shapeFns.js';
import { normalAt, faceCenter, faceGeomType } from '@/topology/faceFns.js';
import { measureArea } from '@/measurement/measureFns.js';
import { wasmIndex } from '@/utils/vec3.js';
import type {
  GeometricHint,
  ShapeRef,
  RoleTable,
  ResolvedRef,
  BrokenRef,
} from './shapeRefTypes.js';
import { type FaceScorer, defaultScorer } from './scoring.js';

// ---------------------------------------------------------------------------
// captureHint — snapshot geometric properties of a face
// ---------------------------------------------------------------------------

/** Snapshot the geometric properties of a face for later matching. */
export function captureHint(face: Face): GeometricHint {
  const surfaceType = faceGeomType(face);
  const normal = normalAt(face);
  const centroid = faceCenter(face);

  const areaResult = measureArea(face);
  const area = areaResult.ok ? areaResult.value : undefined;

  return { entityType: 'face', surfaceType, normal, centroid, area };
}

// ---------------------------------------------------------------------------
// assignRoles — auto-name faces based on operation type
// ---------------------------------------------------------------------------

/** Threshold for dominant-axis detection (abs(component) > 0.9). */
const AXIS_THRESHOLD = 0.9;

/** Determine the cardinal role name for a box face from its outward normal. */
function boxRoleFromNormal(n: readonly [number, number, number]): string | undefined {
  if (n[2] > AXIS_THRESHOLD) return 'box:top';
  if (n[2] < -AXIS_THRESHOLD) return 'box:bottom';
  if (n[1] > AXIS_THRESHOLD) return 'box:back';
  if (n[1] < -AXIS_THRESHOLD) return 'box:front';
  if (n[0] > AXIS_THRESHOLD) return 'box:right';
  if (n[0] < -AXIS_THRESHOLD) return 'box:left';
  return undefined;
}

/**
 * Auto-assign role names to the faces of a shape based on operation type.
 *
 * For 'box': uses face normals to assign cardinal names
 * ('box:top', 'box:bottom', 'box:front', 'box:back', 'box:left', 'box:right').
 * **Note:** Box role detection assumes axis-aligned faces (normal within 0.9 of
 * a cardinal axis). Rotated boxes may receive fewer than 6 named roles; remaining
 * faces fall through to sequential naming.
 *
 * For other types: sequential naming ('opType:face_0', 'opType:face_1', ...).
 *
 * @returns Map from role name to face hash code
 */
export function assignRoles(shape: Shape3D, operationType: string): Map<string, number> {
  const faces = getFaces(shape);
  const roles = new Map<string, number>();

  if (operationType === 'box') {
    for (const face of faces) {
      const role = boxRoleFromNormal(normalAt(face));
      if (role !== undefined && !roles.has(role)) {
        roles.set(role, getHashCode(face));
      }
    }
    return roles;
  }

  let index = 0;
  for (const face of faces) {
    roles.set(`${operationType}:face_${index}`, getHashCode(face));
    index++;
  }
  return roles;
}

// ---------------------------------------------------------------------------
// createRef — factory for ShapeRef
// ---------------------------------------------------------------------------

/** Create a ShapeRef from an origin ID, role name, and face. */
export function createRef(origin: string, role: string, face: Face): ShapeRef {
  return { origin, role, hint: captureHint(face) };
}

// ---------------------------------------------------------------------------
// updateRoles — immutable role table update through evolution
// ---------------------------------------------------------------------------

/**
 * Propagate a role table through a ShapeEvolution record.
 * Returns a new RoleTable with hashes updated according to the evolution.
 *
 * - Deleted faces: role removed
 * - Modified faces: hash updated to first result hash
 * - Unchanged faces: hash preserved
 *
 * **Limitation:** When a face splits (1→many in `evolution.modified`), only the
 * first successor hash is tracked. The geometric fallback in `resolveRef` handles
 * cases where this picks the "wrong" successor. A future version may return
 * multi-hash mappings for split-aware resolution.
 */
export function updateRoles(
  roles: RoleTable,
  origin: string,
  evolution: ShapeEvolution
): RoleTable {
  const originRoles = roles.get(origin);
  if (!originRoles) return roles;

  const updatedOriginRoles = new Map<string, number>();

  for (const [role, hash] of originRoles) {
    // Deleted → skip (role removed)
    if (evolution.deleted.has(hash)) continue;

    // Modified → use first result hash
    const modifiedHashes = evolution.modified.get(hash);
    if (modifiedHashes && modifiedHashes.length > 0) {
      updatedOriginRoles.set(role, wasmIndex(modifiedHashes, 0));
    } else {
      // Survived unchanged
      updatedOriginRoles.set(role, hash);
    }
  }

  // Build new RoleTable immutably
  const newRoles = new Map<string, ReadonlyMap<string, number>>();
  for (const [key, value] of roles) {
    if (key === origin) {
      newRoles.set(key, updatedOriginRoles);
    } else {
      newRoles.set(key, value);
    }
  }
  return newRoles;
}

// ---------------------------------------------------------------------------
// resolveRef — resolve a ShapeRef back to a face
// ---------------------------------------------------------------------------

/** Ambiguity threshold: if two scores are within this range, it's ambiguous. */
const AMBIGUITY_THRESHOLD = 0.1;
/** Minimum score for geometric fallback to accept a match. */
const MIN_SCORE = 0.5;

/**
 * Resolve a ShapeRef to a face in the current shape.
 *
 * Resolution strategy:
 * 1. Exact lookup via role table hash match
 * 2. Geometric fallback using scorer against all faces
 * 3. Ambiguous if multiple faces score within threshold
 * 4. Not-found if no match above minimum score
 */
export function resolveRef(
  ref: ShapeRef,
  roles: RoleTable,
  currentShape: Shape3D,
  scorer?: FaceScorer
): ResolvedRef | BrokenRef {
  const faces = getFaces(currentShape);
  const scoreFn = scorer ?? defaultScorer;

  // 1. Exact lookup via role table
  const originRoles = roles.get(ref.origin);
  const targetHash = originRoles?.get(ref.role);

  if (targetHash !== undefined) {
    for (const face of faces) {
      if (getHashCode(face) === targetHash) {
        return { face, confidence: 'exact' };
      }
    }
    // Hash was in table but not found in current shape → deleted
    return { ref, reason: 'deleted' };
  }

  // 2. Geometric fallback — cache scores to avoid double WASM calls
  let bestScore = -Infinity;
  let bestFace: Face | undefined;
  let secondBestScore = -Infinity;
  const scored: Array<[Face, number]> = [];

  for (const face of faces) {
    const score = scoreFn(ref.hint, face);
    if (score > MIN_SCORE) {
      scored.push([face, score]);
    }
    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      bestFace = face;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  // 3. Check for ambiguity
  if (bestFace !== undefined && bestScore > MIN_SCORE) {
    if (bestScore - secondBestScore < AMBIGUITY_THRESHOLD && scored.length > 1) {
      const competitive = scored
        .filter(([, s]) => s >= bestScore - AMBIGUITY_THRESHOLD)
        .map(([f]) => f);
      return { ref, reason: 'ambiguous', candidates: competitive };
    }
    return { face: bestFace, confidence: 'geometric-fallback' };
  }

  // 4. Not found
  return { ref, reason: 'not-found' };
}
