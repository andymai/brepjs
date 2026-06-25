/**
 * Consumer-facing resolution for lineage references — the layer that turns the
 * capture/resolve primitives into a parametric-replay flow.
 *
 * A downstream op (fillet, offset, shell, ...) names the entity it acts on with
 * a lineage ref at author time. When an upstream parameter changes and the model
 * is rebuilt, these helpers re-resolve that ref to the live entity on the new
 * shape, so the op re-targets the *same* feature instead of a stale hash. One
 * unified dispatch covers all four ref kinds (face / edge / vertex / generated
 * face), since they share the `(ref, roles, shape)` resolve signature.
 */

import type { Edge, Face, Shape3D, Vertex } from '@/core/shapeTypes.js';
import { assignRoles, resolveRef } from './shapeRefFns.js';
import { resolveEdgeRef } from './edgeRefFns.js';
import { resolveVertexRef } from './vertexRefFns.js';
import { resolveDerivedFaceRef } from './derivedFaceRefFns.js';
import type { ShapeRef, EdgeRef, VertexRef, DerivedFaceRef, RoleTable } from './shapeRefTypes.js';

/** Any of the four lineage reference kinds. */
export type LineageRef = ShapeRef | EdgeRef | VertexRef | DerivedFaceRef;
/** The live entity a lineage ref resolves to. */
export type ResolvedEntity = Face | Edge | Vertex;

/** Why a lineage ref failed to resolve (preserved from the underlying resolver). */
export type BrokenReason = 'ambiguous' | 'not-found' | 'deleted';

/**
 * Outcome of resolving a lineage ref. Carries the failure `reason` (and any tied
 * `candidates`) rather than collapsing to undefined, so a replay engine can tell
 * "deleted by the edit" (expected — skip) from "ambiguous" (warn the author).
 */
export type LineageResolution =
  | { readonly ok: true; readonly entity: ResolvedEntity }
  | {
      readonly ok: false;
      readonly reason: BrokenReason;
      readonly candidates?: readonly ResolvedEntity[];
    };

function isRefObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && 'origin' in v;
}

/** A generated-face ref: carries the bridged roles + the op that made it. */
export function isDerivedFaceRef(v: unknown): v is DerivedFaceRef {
  return isRefObject(v) && 'betweenRoles' in v && 'op' in v;
}
/** An edge ref: exactly two adjacent face-roles. */
export function isEdgeRef(v: unknown): v is EdgeRef {
  return isRefObject(v) && Array.isArray(v['faceRoles']) && v['faceRoles'].length === 2;
}
/** A vertex ref: three or more adjacent face-roles. */
export function isVertexRef(v: unknown): v is VertexRef {
  return isRefObject(v) && Array.isArray(v['faceRoles']) && v['faceRoles'].length >= 3;
}
/** A face ref: a single role name. */
export function isFaceRef(v: unknown): v is ShapeRef {
  return isRefObject(v) && typeof v['role'] === 'string';
}
/** True for any of the four lineage reference kinds. */
export function isLineageRef(v: unknown): v is LineageRef {
  return isFaceRef(v) || isEdgeRef(v) || isVertexRef(v) || isDerivedFaceRef(v);
}

function brokenResolution(
  reason: BrokenReason,
  candidates?: readonly ResolvedEntity[]
): LineageResolution {
  return candidates === undefined ? { ok: false, reason } : { ok: false, reason, candidates };
}

/**
 * Resolve a lineage ref against `shape` using a prepared role table (the robust
 * path — the table is maintained across edits via `updateRoles`). Returns the
 * live entity on success, or the failure reason (and tied candidates) on failure.
 */
export function resolveLineageRef(
  ref: LineageRef,
  roles: RoleTable,
  shape: Shape3D
): LineageResolution {
  if (isDerivedFaceRef(ref)) {
    const r = resolveDerivedFaceRef(ref, roles, shape);
    return 'face' in r ? { ok: true, entity: r.face } : brokenResolution(r.reason, r.candidates);
  }
  if (isEdgeRef(ref)) {
    const r = resolveEdgeRef(ref, roles, shape);
    return 'edge' in r ? { ok: true, entity: r.edge } : brokenResolution(r.reason, r.candidates);
  }
  if (isVertexRef(ref)) {
    const r = resolveVertexRef(ref, roles, shape);
    return 'vertex' in r
      ? { ok: true, entity: r.vertex }
      : brokenResolution(r.reason, r.candidates);
  }
  const r = resolveRef(ref, roles, shape);
  return 'face' in r ? { ok: true, entity: r.face } : brokenResolution(r.reason, r.candidates);
}

/** Role table for a from-scratch rebuild, reusing a per-origin cache. */
function rolesFor(ref: LineageRef, shape: Shape3D, cache: Map<string, RoleTable>): RoleTable {
  const cached = cache.get(ref.origin);
  if (cached !== undefined) return cached;
  const roles: RoleTable = new Map([[ref.origin, assignRoles(shape, ref.origin)]]);
  cache.set(ref.origin, roles);
  return roles;
}

/**
 * Resolve a lineage ref against a freshly rebuilt `shape` with no maintained
 * role table, re-deriving roles via `assignRoles(shape, ref.origin)`. The ref's
 * `origin` must therefore be the role-assignment scheme (e.g. `'box'`), and
 * stability is bounded by that scheme — `'box'` names faces semantically
 * (rebuild-stable); other schemes fall back to positional `face_N`.
 */
export function resolveRefIn(ref: LineageRef, shape: Shape3D): LineageResolution {
  return resolveLineageRef(ref, rolesFor(ref, shape, new Map()), shape);
}

/**
 * Replace every lineage ref in an operation's params with the live entity it
 * resolves to in `shape`, recursing into arrays (multi-entity selections like a
 * fillet's edge list). Refs that can't resolve are left as-is. Role tables are
 * re-derived once per `origin` and reused across the whole params map. Lets a
 * replay engine pass stable entity selections that survive upstream edits.
 */
export function resolveRefParams(
  params: Readonly<Record<string, unknown>>,
  shape: Shape3D
): Record<string, unknown> {
  const roleCache = new Map<string, RoleTable>();
  const resolveValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(resolveValue);
    if (!isLineageRef(value)) return value;
    const res = resolveLineageRef(value, rolesFor(value, shape, roleCache), shape);
    return res.ok ? res.entity : value;
  };
  const out: Record<string, unknown> = { ...params };
  for (const [key, value] of Object.entries(params)) {
    out[key] = resolveValue(value);
  }
  return out;
}
