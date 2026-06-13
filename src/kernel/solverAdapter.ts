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

/**
 * Point-point coincident/distance: place the dependent point on the reference
 * point (`extra` = 0) or at `extra` along the original separation direction.
 * If the points already coincide the direction is arbitrary (+X).
 */
function solvePointPair(refOrigin: Vec3, depOrigin: Vec3, extra: number): Pose {
  const sep = sub(depOrigin, refOrigin);
  const len = Math.hypot(sep[0], sep[1], sep[2]);
  const dir: Vec3 = len < 1e-9 ? [1, 0, 0] : scale(sep, 1 / len);
  const target = add(refOrigin, scale(dir, extra));
  return { position: sub(target, depOrigin), rotation: IDENTITY_ROTATION };
}

/**
 * Move the dependent plane (normal `depNormal`, at the origin) so its signed
 * distance from the reference point equals `extra` (the mirror of `solvePlanePair`
 * for a point reference and a plane dependent).
 */
function solvePlaneToPoint(depNormal: Vec3, refOrigin: Vec3, depOrigin: Vec3, extra: number): Pose {
  const n = normalize(depNormal);
  const t = dot(n, sub(refOrigin, depOrigin)) - extra;
  return { position: scale(n, t), rotation: IDENTITY_ROTATION };
}

/**
 * Reference axis, dependent point: drop the point onto the axis line
 * (`extra` = 0) or place it at radial distance `extra` from the line, keeping
 * its along-axis position. A point already on the axis gets an arbitrary radial.
 */
function solveAxisToPoint(ref: SolverEntity, depOrigin: Vec3, extra: number): Pose {
  const d = normalize(ref.direction ?? [0, 0, 1]);
  const foot = add(ref.origin, scale(d, dot(d, sub(depOrigin, ref.origin))));
  if (extra === 0) return { position: sub(foot, depOrigin), rotation: IDENTITY_ROTATION };
  const radial = sub(depOrigin, foot);
  const rlen = Math.hypot(radial[0], radial[1], radial[2]);
  const rdir = rlen < 1e-9 ? anyPerpendicular(d) : scale(radial, 1 / rlen);
  return { position: sub(add(foot, scale(rdir, extra)), depOrigin), rotation: IDENTITY_ROTATION };
}

/**
 * Reference point, dependent axis: translate the axis line so it passes through
 * the point (`extra` = 0) or lies at perpendicular distance `extra` from it.
 * Translation is purely perpendicular to the axis, so the line's direction and
 * along-axis parameterization are preserved.
 */
function solvePointToAxis(refOrigin: Vec3, dep: SolverEntity, extra: number): Pose {
  const d = normalize(dep.direction ?? [0, 0, 1]);
  const w = sub(dep.origin, refOrigin);
  const perp = sub(w, scale(d, dot(d, w)));
  const plen = Math.hypot(perp[0], perp[1], perp[2]);
  if (extra === 0) return { position: scale(perp, -1), rotation: IDENTITY_ROTATION };
  const pdir = plen < 1e-9 ? anyPerpendicular(d) : scale(perp, 1 / plen);
  return { position: sub(scale(pdir, extra), perp), rotation: IDENTITY_ROTATION };
}

/**
 * Axis-axis distance: align the dependent axis parallel to the reference, then
 * offset it to perpendicular distance `extra` (parallel pin-and-spacer). With
 * `extra` = 0 the axes become collinear, matching `concentric`.
 */
function solveAxisAxisDistance(ref: SolverEntity, dep: SolverEntity, extra: number): Pose {
  const dRef = normalize(ref.direction ?? [0, 0, 1]);
  const dDep = normalize(dep.direction ?? [0, 0, 1]);
  const rotation = quatFromTo(dDep, dRef);
  const depO = quatRotate(rotation, dep.origin);
  const w = sub(depO, ref.origin);
  const perp = sub(w, scale(dRef, dot(dRef, w)));
  const plen = Math.hypot(perp[0], perp[1], perp[2]);
  const pdir = plen < 1e-9 ? anyPerpendicular(dRef) : scale(perp, 1 / plen);
  return { position: sub(scale(pdir, extra), perp), rotation };
}

/**
 * Supported entity-type pairs for the translational mates (`coincident` /
 * `distance`), keyed `${entityA}-${entityB}`. Both orders are listed where the
 * solver handles them, so a user need not pre-order the entities.
 */
const TRANSLATIONAL_PAIRS = new Set([
  'plane-plane',
  'plane-point',
  'point-plane',
  'point-point',
  'axis-axis',
  'axis-point',
  'point-axis',
]);

/** Entity types the orientation/axis mates require of (entityA, entityB). */
const REQUIRED_ENTITIES: Readonly<Record<string, SolverEntity['type']>> = {
  angle: 'plane',
  concentric: 'axis',
};

const POSITIONING_TYPES = new Set(['coincident', 'distance', 'angle', 'concentric']);

/** Whether a positioning mate's entity pair is solvable. */
function isSupportedPair(type: string, a: SolverEntity['type'], b: SolverEntity['type']): boolean {
  const required = REQUIRED_ENTITIES[type];
  if (required) return a === required && b === required;
  // coincident / distance: dispatch by entity-type pair.
  return TRANSLATIONAL_PAIRS.has(`${a}-${b}`);
}

/**
 * Solve a `coincident` (extra = 0) or `distance` (extra = value) mate for any
 * supported entity-type pair. `ref` is already in world space; the dependent is
 * at the origin. Returns null only for an unsupported pair (filtered out
 * upstream by `isSupportedPair`).
 */
function solveTranslational(ref: SolverEntity, dep: SolverEntity, extra: number): Pose | null {
  const key = `${ref.type}-${dep.type}`;
  switch (key) {
    case 'plane-plane':
    case 'plane-point':
      // Both use the reference plane normal; a point dependent has no normal.
      return solvePlanePair(ref, dep, extra);
    case 'point-plane':
      return solvePlaneToPoint(dep.normal ?? [0, 0, 1], ref.origin, dep.origin, extra);
    case 'point-point':
      return solvePointPair(ref.origin, dep.origin, extra);
    case 'axis-axis':
      return extra === 0 ? solveConcentric(ref, dep) : solveAxisAxisDistance(ref, dep, extra);
    case 'axis-point':
      return solveAxisToPoint(ref, dep.origin, extra);
    case 'point-axis':
      return solvePointToAxis(ref.origin, dep, extra);
    default:
      return null;
  }
}

/** Dispatch a positioning mate to its solver. `ref` is already in world space. */
function solveMate(c: SolverConstraint, ref: SolverEntity, dep: SolverEntity): Pose {
  switch (c.type) {
    case 'concentric':
      return solveConcentric(ref, dep);
    case 'angle':
      return solveAngle(ref, dep, ((c.value ?? 0) * Math.PI) / 180);
    case 'distance':
      return solveTranslational(ref, dep, c.value ?? 0) ?? solvePlanePair(ref, dep, c.value ?? 0);
    default:
      return solveTranslational(ref, dep, 0) ?? solvePlanePair(ref, dep, 0);
  }
}

/**
 * Solve assembly constraints analytically.
 *
 * Handles: fixed, concentric (axis-axis), angle (plane-plane orientation), and
 * coincident/distance for any supported entity-type pair (plane-plane,
 * plane-point, point-point, axis-axis, axis-point, and both point orders — see
 * `TRANSLATIONAL_PAIRS`). For a positioning mate, entityA is the reference and
 * entityB the dependent. Chain roots (nodes never positioned by a
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
    const a = c.entityA.entity.type;
    const b = c.entityB.entity.type;
    if (!isSupportedPair(c.type, a, b)) {
      unsupported.push(`${c.type}(${a}-${b})`);
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
