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

/**
 * Resolve a lineage ref against `shape` using a prepared role table (the robust
 * path — the table is maintained across edits via `updateRoles`). Returns the
 * live entity, or undefined when the ref can't be resolved.
 */
export function resolveLineageRef(
  ref: LineageRef,
  roles: RoleTable,
  shape: Shape3D
): ResolvedEntity | undefined {
  if (isDerivedFaceRef(ref)) {
    const r = resolveDerivedFaceRef(ref, roles, shape);
    return 'face' in r ? r.face : undefined;
  }
  if (isEdgeRef(ref)) {
    const r = resolveEdgeRef(ref, roles, shape);
    return 'edge' in r ? r.edge : undefined;
  }
  if (isVertexRef(ref)) {
    const r = resolveVertexRef(ref, roles, shape);
    return 'vertex' in r ? r.vertex : undefined;
  }
  const r = resolveRef(ref, roles, shape);
  return 'face' in r ? r.face : undefined;
}

/**
 * Resolve a lineage ref against a freshly rebuilt `shape` with no maintained
 * role table, re-deriving roles via `assignRoles(shape, ref.origin)`. The ref's
 * `origin` must therefore be the role-assignment scheme (e.g. `'box'`), and
 * stability is bounded by that scheme — `'box'` names faces semantically
 * (rebuild-stable); other schemes fall back to positional `face_N`.
 */
export function resolveRefIn(ref: LineageRef, shape: Shape3D): ResolvedEntity | undefined {
  const roles: RoleTable = new Map([[ref.origin, assignRoles(shape, ref.origin)]]);
  return resolveLineageRef(ref, roles, shape);
}

/**
 * Replace every lineage ref in an operation's params with the live entity it
 * resolves to in `shape` (refs that can't resolve are left as-is). Lets a replay
 * engine pass stable entity selections that survive upstream parameter edits.
 */
export function resolveRefParams(
  params: Readonly<Record<string, unknown>>,
  shape: Shape3D
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...params };
  for (const [key, value] of Object.entries(params)) {
    if (isLineageRef(value)) {
      const entity = resolveRefIn(value, shape);
      if (entity !== undefined) out[key] = entity;
    }
  }
  return out;
}
