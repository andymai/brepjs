/**
 * Core ShapeRef functions — capture hints, assign roles, create refs,
 * update roles through evolution, and resolve refs back to faces.
 */

import type { Face, Shape3D } from '@/core/shapeTypes.js';
import type { ShapeEvolution } from '@/kernel/types.js';
import { getKernel } from '@/kernel/index.js';
import { castShapeWithKnownType, disposeTransientSubShape } from '@/core/shapeTypes.js';
import { getFaces } from '@/topology/topologyQueryFns.js';
import { getHashCode } from '@/topology/shapeFns.js';
import { normalAt, faceCenter, faceGeomType } from '@/topology/faceFns.js';
import { measureArea } from '@/measurement/measureFns.js';
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

/** Axial cap name for a Z-axis primitive: 'top' (+Z) / 'bottom' (-Z). */
function axialCapName(prefix: string, face: Face): string | undefined {
  if (faceGeomType(face) !== 'PLANE') return undefined;
  const z = normalAt(face)[2];
  if (z > AXIS_THRESHOLD) return `${prefix}:top`;
  if (z < -AXIS_THRESHOLD) return `${prefix}:bottom`;
  return undefined;
}

/** Semantic role for a Z-axis cylinder face: top/bottom caps + lateral wall. */
function cylinderRole(face: Face): string | undefined {
  return faceGeomType(face) === 'CYLINDRE' ? 'cylinder:lateral' : axialCapName('cylinder', face);
}

/** Semantic role for a Z-axis cone/frustum face: top/bottom caps + lateral. */
function coneRole(face: Face): string | undefined {
  return faceGeomType(face) === 'CONE' ? 'cone:lateral' : axialCapName('cone', face);
}

/** Semantic role for a sphere's single spherical face. */
function sphereRole(face: Face): string | undefined {
  return faceGeomType(face) === 'SPHERE' ? 'sphere:surface' : undefined;
}

/** Per-primitive semantic face namers, keyed by operation type. */
const ROLE_ASSIGNERS: Record<string, (face: Face) => string | undefined> = {
  box: (face) => boxRoleFromNormal(normalAt(face)),
  cylinder: cylinderRole,
  cone: coneRole,
  sphere: sphereRole,
};

/**
 * Auto-assign role names to a shape's faces from its operation type.
 *
 * Known primitives get **semantic** names from face geometry — rebuild-stable
 * across parameter edits that preserve orientation:
 * - `box`: cardinal names by normal ('box:top'/'bottom'/'front'/'back'/'left'/'right').
 * - `cylinder`/`cone` (Z-axis): 'top'/'bottom' caps + 'lateral' wall.
 * - `sphere`: 'sphere:surface'.
 *
 * Faces a primitive namer doesn't recognize (a rotated box's non-cardinal faces),
 * and every face of any other operation type, fall back to positional names
 * ('opType:face_0', 'opType:face_1', ...) — so each face always gets a role.
 *
 * @returns Map from role name to its face hash codes (one at assignment time;
 *   a role accrues more hashes only later, when `updateRoles` tracks a split).
 */
export function assignRoles(shape: Shape3D, operationType: string): Map<string, number[]> {
  const roles = new Map<string, number[]>();
  const assigner = ROLE_ASSIGNERS[operationType];
  const kernel = getKernel();
  let index = 0;
  // Iterate transient faces rather than the cached getFaces(): only the hash
  // and geometric role are read, so each face's arena slot is released here
  // instead of being retained for the shape's whole lifetime.
  for (const raw of kernel.iterShapes(shape.wrapped, 'face')) {
    const face = castShapeWithKnownType(raw, 'face') as Face;
    try {
      const semantic = assigner?.(face);
      const role =
        semantic !== undefined && !roles.has(semantic)
          ? semantic
          : `${operationType}:face_${index}`;
      roles.set(role, [getHashCode(face)]);
      index++;
    } finally {
      disposeTransientSubShape(face, raw);
    }
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
 * Advance a role's face hashes through one evolution: drop deleted faces,
 * replace a modified face with *all* its successors (a 1→many split keeps every
 * fragment), and keep unchanged faces. Deduped so a shared successor isn't
 * doubled.
 */
function nextHashes(hashes: readonly number[], evolution: ShapeEvolution): number[] {
  const successors: number[] = [];
  for (const hash of hashes) {
    if (evolution.deleted.has(hash)) continue;
    const modified = evolution.modified.get(hash);
    const targets = modified && modified.length > 0 ? modified : [hash];
    for (const h of targets) if (!successors.includes(h)) successors.push(h);
  }
  return successors;
}

/**
 * Propagate a role table through a ShapeEvolution record.
 * Returns a new RoleTable with hashes updated according to the evolution.
 *
 * - Deleted faces: hash dropped (role removed once all its hashes are gone).
 * - Modified faces: hash replaced by **all** successor hashes — so a 1→many
 *   split keeps every fragment, and `resolveRef` disambiguates among them.
 * - Unchanged faces: hash preserved.
 *
 * Note: `evolution.generated` is intentionally not consumed here — on the OCCT
 * kernels its hashes refer to an intermediate shape, not the final result, so
 * naming generated faces produces roles that never resolve (verified: 0 live
 * generated hashes across cut/fuse on occt-wasm). Stable names for generated
 * geometry (fillet rounds, boolean seams) need history-fidelity work tracked
 * separately.
 */
export function updateRoles(
  roles: RoleTable,
  origin: string,
  evolution: ShapeEvolution
): RoleTable {
  const originRoles = roles.get(origin);
  if (!originRoles) return roles;

  const updatedOriginRoles = new Map<string, number[]>();

  // Carry each role's faces forward through deleted/modified/unchanged.
  for (const [role, hashes] of originRoles) {
    const successors = nextHashes(hashes, evolution);
    if (successors.length > 0) updatedOriginRoles.set(role, successors);
  }

  // Build new RoleTable immutably
  const newRoles = new Map<string, ReadonlyMap<string, readonly number[]>>();
  for (const [key, value] of roles) {
    newRoles.set(key, key === origin ? updatedOriginRoles : value);
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

/** Outcome of scoring a candidate face set against a hint. */
type ScoreOutcome =
  { kind: 'match'; face: Face } | { kind: 'ambiguous'; candidates: Face[] } | { kind: 'none' };

/**
 * Score `candidates` against `hint`, returning the best match, a tie within
 * {@link AMBIGUITY_THRESHOLD}, or nothing above {@link MIN_SCORE}. Scoping the
 * candidates to a role's tracked successors (rather than every face) is what
 * makes split-face disambiguation reliable — the fragments compete only with
 * each other, not with unrelated geometry.
 */
function scoreFaces(
  hint: GeometricHint,
  candidates: readonly Face[],
  scoreFn: FaceScorer
): ScoreOutcome {
  let bestScore = -Infinity;
  let bestFace: Face | undefined;
  let secondBestScore = -Infinity;
  const scored: Array<[Face, number]> = [];

  for (const face of candidates) {
    const score = scoreFn(hint, face);
    if (score > MIN_SCORE) scored.push([face, score]);
    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      bestFace = face;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  if (bestFace !== undefined && bestScore > MIN_SCORE) {
    if (bestScore - secondBestScore < AMBIGUITY_THRESHOLD && scored.length > 1) {
      const competitive = scored
        .filter(([, s]) => s >= bestScore - AMBIGUITY_THRESHOLD)
        .map(([f]) => f);
      return { kind: 'ambiguous', candidates: competitive };
    }
    return { kind: 'match', face: bestFace };
  }
  return { kind: 'none' };
}

/**
 * Resolve a ShapeRef to a face in the current shape.
 *
 * Resolution strategy:
 * 1. Exact: the role's tracked successor hashes. One survivor → exact match;
 *    several survivors (a face that split) → disambiguate among *only those*
 *    fragments; none survive → deleted.
 * 2. Geometric fallback over the whole shape when the role isn't tracked (or a
 *    scoped score turned up nothing): best-scoring face, else ambiguous /
 *    not-found.
 */
export function resolveRef(
  ref: ShapeRef,
  roles: RoleTable,
  currentShape: Shape3D,
  scorer?: FaceScorer
): ResolvedRef | BrokenRef {
  const faces = getFaces(currentShape);
  const scoreFn = scorer ?? defaultScorer;

  // 1. Exact lookup, scoped to the role's tracked successor hashes.
  const targetHashes = roles.get(ref.origin)?.get(ref.role);
  if (targetHashes !== undefined && targetHashes.length > 0) {
    const survivors = faces.filter((f) => targetHashes.includes(getHashCode(f)));
    if (survivors.length === 1) {
      const [only] = survivors;
      if (only !== undefined) return { face: only, confidence: 'exact' };
    } else if (survivors.length === 0) {
      return { ref, reason: 'deleted' };
    } else {
      // A face that split — pick the right fragment from the tracked set only.
      const outcome = scoreFaces(ref.hint, survivors, scoreFn);
      if (outcome.kind === 'match') return { face: outcome.face, confidence: 'geometric-fallback' };
      if (outcome.kind === 'ambiguous') {
        return { ref, reason: 'ambiguous', candidates: outcome.candidates };
      }
      // 'none' → fall through to the whole-shape geometric fallback.
    }
  }

  // 2. Geometric fallback over all faces.
  const outcome = scoreFaces(ref.hint, faces, scoreFn);
  if (outcome.kind === 'match') return { face: outcome.face, confidence: 'geometric-fallback' };
  if (outcome.kind === 'ambiguous')
    return { ref, reason: 'ambiguous', candidates: outcome.candidates };
  return { ref, reason: 'not-found' };
}
