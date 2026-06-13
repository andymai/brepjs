/**
 * Constraint solver adapter — analytical solver for simple assembly mates.
 */

import { quatRotate, quatFromAxisAngle, quatFromTo } from '@/utils/quaternion.js';

/** 3D vector (local alias to avoid cross-layer import). */
type Vec3 = readonly [number, number, number];

export interface SolverEntity {
  type: 'plane' | 'axis' | 'point';
  origin: Vec3;
  normal?: Vec3;
  direction?: Vec3;
}

export interface SolverConstraint {
  type: 'coincident' | 'concentric' | 'distance' | 'angle' | 'fixed';
  entityA?: { node: string; entity: SolverEntity };
  entityB?: { node: string; entity: SolverEntity };
  value?: number;
}

export interface SolverResult {
  transforms: Map<string, { position: Vec3; rotation: [number, number, number, number] }>;
  dof: number;
  converged: boolean;
  /** Constraint types that were passed in but not solved (not yet implemented). */
  unsupported: string[];
}

/**
 * Degrees of freedom each constraint leaves unresolved when it can't be applied
 * (entity-type mismatch or an unreachable reference). All four types now solve
 * for well-typed inputs; these counts only feed the diagnostic `dof` for the
 * unsupported cases.
 * coincident: 3 translational · concentric: 2 rotational + 2 translational = 4
 * distance: 1 translational · angle: 1 rotational
 */
const UNSUPPORTED_DOF: Readonly<Record<string, number>> = {
  coincident: 3,
  concentric: 4,
  distance: 1,
  angle: 1,
};

type Quat = [number, number, number, number];
type Pose = { position: Vec3; rotation: Quat };

const IDENTITY_ROTATION: Quat = [1, 0, 0, 0];

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** A unit vector perpendicular to `v` (for the parallel-normals degenerate case). */
function anyPerpendicular(v: Vec3): Vec3 {
  const ref: Vec3 = Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return normalize(cross(v, ref));
}

/** Apply a pose (rotate then translate) to an entity's origin and any directions. */
function transformEntity(e: SolverEntity, pose: Pose): SolverEntity {
  const origin = add(quatRotate(pose.rotation, e.origin), pose.position);
  return {
    type: e.type,
    origin,
    ...(e.normal ? { normal: quatRotate(pose.rotation, e.normal) } : {}),
    ...(e.direction ? { direction: quatRotate(pose.rotation, e.direction) } : {}),
  };
}

/**
 * Position a dependent plane against an already-placed reference plane.
 *
 * `ref` is the reference entity already in world space. The dependent is at the
 * origin (a node is only solved once, while unplaced), so the returned position
 * is its absolute translation along the reference normal. `extra` is the gap for
 * a distance mate (0 for coincident). Plane mates don't reorient the dependent.
 */
function solvePlanePair(ref: SolverEntity, dep: SolverEntity, extra: number): Pose {
  const n = ref.normal ?? [0, 0, 1];
  const offset = dot(n, sub(ref.origin, dep.origin)) + extra;
  return { position: scale(n, offset), rotation: IDENTITY_ROTATION };
}

/**
 * Concentric (axis-axis) mate: rotate the dependent so its axis is parallel to
 * the reference axis, then translate so the two axes are collinear (the
 * dependent's axis point is placed on the reference axis). `ref` is in world
 * space; the dependent is at the origin.
 */
function solveConcentric(ref: SolverEntity, dep: SolverEntity): Pose {
  const dRef = ref.direction ?? [0, 0, 1];
  const dDep = dep.direction ?? [0, 0, 1];
  const rotation = quatFromTo(dDep, dRef);
  const rotatedOrigin = quatRotate(rotation, dep.origin);
  return { position: sub(ref.origin, rotatedOrigin), rotation };
}

/**
 * Angle mate: rotate the dependent so the angle between its (plane) normal and
 * the reference normal equals `angleRad`. Orientation-only — position is left at
 * the origin. `ref` is in world space; the dependent is at the origin.
 */
function solveAngle(ref: SolverEntity, dep: SolverEntity, angleRad: number): Pose {
  const nRef = normalize(ref.normal ?? [0, 0, 1]);
  const nDep = normalize(dep.normal ?? [0, 0, 1]);
  const phi = Math.acos(Math.max(-1, Math.min(1, dot(nDep, nRef))));
  const c = cross(nDep, nRef);
  const axis = Math.hypot(c[0], c[1], c[2]) < 1e-9 ? anyPerpendicular(nDep) : c;
  // Rotating nDep about (nDep×nRef) by +phi aligns it with nRef; rotate by
  // (phi − angle) to leave exactly `angleRad` between them.
  return { position: [0, 0, 0], rotation: quatFromAxisAngle(axis, phi - angleRad) };
}

/** Entity types each positioning constraint requires of (entityA, entityB). */
const REQUIRED_ENTITIES: Readonly<Record<string, SolverEntity['type']>> = {
  coincident: 'plane',
  distance: 'plane',
  angle: 'plane',
  concentric: 'axis',
};

const POSITIONING_TYPES = new Set(['coincident', 'distance', 'angle', 'concentric']);

/** Dispatch a positioning mate to its solver. `ref` is already in world space. */
function solveMate(c: SolverConstraint, ref: SolverEntity, dep: SolverEntity): Pose {
  switch (c.type) {
    case 'concentric':
      return solveConcentric(ref, dep);
    case 'angle':
      return solveAngle(ref, dep, ((c.value ?? 0) * Math.PI) / 180);
    case 'distance':
      return solvePlanePair(ref, dep, c.value ?? 0);
    default:
      return solvePlanePair(ref, dep, 0);
  }
}

/**
 * Solve assembly constraints analytically.
 *
 * Handles: fixed, coincident/distance (plane-plane), concentric (axis-axis), and
 * angle (plane-plane orientation). For a positioning mate, entityA is the
 * reference and entityB the dependent. Chain roots (nodes never positioned by a
 * mate) and explicit `fixed` nodes anchor at the origin; constraints then resolve
 * in topological order — each places its dependent against the reference's solved
 * pose (rotation included), so multi-body chains compose. Returns
 * `converged: false` with details for entity-type mismatches and any constraint
 * whose reference never resolves.
 */
export function solveConstraints(nodes: string[], constraints: SolverConstraint[]): SolverResult {
  const transforms = new Map<string, Pose>();

  // Initialize all nodes at origin
  for (const node of nodes) {
    transforms.set(node, { position: [0, 0, 0], rotation: IDENTITY_ROTATION });
  }

  const unsupported: string[] = [];

  // For positioning mates, entityA is the reference and entityB the dependent.
  const positioning = constraints.filter(
    (c) => POSITIONING_TYPES.has(c.type) && c.entityA && c.entityB
  );
  const dependents = new Set<string>();
  for (const c of positioning) if (c.entityB) dependents.add(c.entityB.node);

  // Anchors are placed at the origin: any node never positioned by a mate (a
  // chain root), plus any explicit `fixed` node.
  const placed = new Set<string>();
  for (const node of nodes) if (!dependents.has(node)) placed.add(node);
  for (const c of constraints) if (c.type === 'fixed' && c.entityA) placed.add(c.entityA.node);

  // Entity-type mismatches are unsupported regardless of order; report them
  // eagerly and keep only well-typed mates for topological resolution. A node
  // left unplaced by such a mate (it's a dependent, so not a root) will cause
  // any downstream mate that references it to end up `(unanchored)` — intended:
  // an unsolved reference can't compose, so the chain doesn't converge.
  const pending: SolverConstraint[] = [];
  for (const c of positioning) {
    if (!c.entityA || !c.entityB) continue;
    const required = REQUIRED_ENTITIES[c.type];
    if (c.entityA.entity.type !== required || c.entityB.entity.type !== required) {
      unsupported.push(`${c.type}(${c.entityA.entity.type}-${c.entityB.entity.type})`);
      continue;
    }
    pending.push(c);
  }

  // Resolve in topological rounds: a mate solves once its reference (entityA) is
  // placed, positioning the dependent (entityB) against the reference's solved
  // world-space pose so multi-body chains compose.
  let progress = true;
  while (progress && pending.length > 0) {
    progress = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const c = pending[i];
      if (!c?.entityA || !c.entityB) continue;
      const ref = c.entityA;
      const dep = c.entityB;
      if (!placed.has(ref.node)) continue; // reference not solved yet — defer

      pending.splice(i, 1);
      progress = true;
      if (placed.has(dep.node)) continue; // dependent already anchored (fixed) — redundant

      const refPose = transforms.get(ref.node) ?? {
        position: [0, 0, 0],
        rotation: IDENTITY_ROTATION,
      };
      const refWorld = transformEntity(ref.entity, refPose);
      transforms.set(dep.node, solveMate(c, refWorld, dep.entity));
      placed.add(dep.node);
    }
  }

  // Anything still pending has a reference that never resolved (e.g. a cycle).
  for (const c of pending) unsupported.push(`${c.type}(unanchored)`);

  const dof = unsupported.reduce((sum, type) => {
    // Look up by exact key first, then by base type (before parenthesis)
    const baseDof = UNSUPPORTED_DOF[type] ?? UNSUPPORTED_DOF[type.split('(')[0] ?? ''] ?? 0;
    return sum + baseDof;
  }, 0);

  return { transforms, dof, converged: unsupported.length === 0, unsupported };
}
