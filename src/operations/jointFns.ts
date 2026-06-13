/**
 * Drivable kinematic joints — built on the assembly tree. A joint connects a
 * `parent` (reference) body to a `child` (moving) body and carries one or more
 * drivable degrees of freedom (DOF), each clamped to its own range.
 *
 * Single-DOF joints (`revolute`, `prismatic`) are sugar over the Phase-1 mate
 * constraints — a revolute is concentric (axis alignment) plus an angle driver;
 * a prismatic is coincident plus a distance driver. Multi-DOF joints compose
 * several DOFs about a shared anchor: `cylindrical` (rotation + slide on one
 * axis, 2 DOF), `planar` (two in-plane translations + a rotation about the
 * normal, 3 DOF), and `spherical` (three rotations about a pivot, 3 DOF).
 *
 * The `dofs` array is the source of truth; `value`/`min`/`max`/`axis` mirror the
 * primary (first) DOF for single-DOF ergonomics and backward compatibility.
 * `joint.dofs` are the stored degrees of freedom, distinct from
 * `AssemblyNode.rotate` (a static structural transform).
 */

import type { Vec3 } from '@/core/types.js';
import { quatFromAxisAngle, quatRotate, quatMultiply } from '@/utils/quaternion.js';
import type { AssemblyNode } from './assemblyFns.js';
import { walkAssembly } from './assemblyFns.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A joint axis: a point on the axis line plus a direction. */
export interface JointAxis {
  readonly origin: Vec3;
  readonly direction: Vec3;
}

export type JointType = 'revolute' | 'prismatic' | 'cylindrical' | 'planar' | 'spherical';

/**
 * A single drivable degree of freedom. A `rotation` DOF turns about the joint's
 * anchor point along `axis` (degrees); a `translation` DOF slides along `axis`
 * (length units). `value` is always clamped to `[min, max]`.
 */
export interface JointDOF {
  readonly kind: 'rotation' | 'translation';
  readonly axis: Vec3;
  readonly min: number;
  readonly max: number;
  readonly value: number;
}

export interface Joint {
  readonly type: JointType;
  /** Reference body (stays put); the child moves relative to it. */
  readonly parent: string;
  readonly child: string;
  /** Primary axis; `origin` is the anchor every rotation DOF pivots about. */
  readonly axis: JointAxis;
  /** Primary-DOF range bounds (mirror of `dofs[0]`). */
  readonly min: number;
  readonly max: number;
  /** Primary-DOF value (mirror of `dofs[0]`), always clamped to `[min, max]`. */
  readonly value: number;
  /** All drivable degrees of freedom, in composition order. */
  readonly dofs: readonly JointDOF[];
}

/** A rigid transform: translation + quaternion rotation `[w, x, y, z]`. */
export interface JointPose {
  readonly position: Vec3;
  readonly rotation: [number, number, number, number];
}

export interface JointOptions {
  /** Range lower bound. Default: -180 (revolute) / 0 (prismatic). */
  min?: number;
  /** Range upper bound. Default: 180 (revolute) / 100 (prismatic). */
  max?: number;
  /** Initial value, clamped to the range. Default: 0. */
  value?: number;
}

/** Per-DOF ranges for a cylindrical joint (rotation about + slide along one axis). */
export interface CylindricalOptions {
  /** Rotation DOF (degrees). Default range -180..180. */
  rotation?: JointOptions;
  /** Translation DOF (length). Default range 0..100. */
  translation?: JointOptions;
}

/** Per-DOF ranges for a planar joint (two in-plane translations + a rotation). */
export interface PlanarOptions {
  /** Translation along the in-plane `uDirection`. Default range -100..100. */
  u?: JointOptions;
  /** Translation along `normal × u`. Default range -100..100. */
  v?: JointOptions;
  /** Rotation about the plane normal (degrees). Default range -180..180. */
  rotation?: JointOptions;
  /**
   * In-plane reference direction for the `u` translation. Projected onto the
   * plane and normalized; defaults to an arbitrary perpendicular of the normal.
   */
  uDirection?: Vec3;
}

/** Per-DOF ranges for a spherical joint (three rotations about a pivot). */
export interface SphericalOptions {
  /** Rotation about local X through the pivot (degrees). Default range -180..180. */
  x?: JointOptions;
  /** Rotation about local Y through the pivot (degrees). Default range -180..180. */
  y?: JointOptions;
  /** Rotation about local Z through the pivot (degrees). Default range -180..180. */
  z?: JointOptions;
}

const DEG2RAD = Math.PI / 180;

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function unit(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** A unit vector perpendicular to `v` (for the unspecified-reference case). */
function anyPerpendicular(v: Vec3): Vec3 {
  const ref: Vec3 = Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return unit(cross(v, ref));
}

/** Build one DOF, normalizing an inverted range and clamping the initial value. */
function makeDof(
  kind: JointDOF['kind'],
  axis: Vec3,
  opts: JointOptions,
  defMin: number,
  defMax: number
): JointDOF {
  // Normalize the range so an inverted (min > max) input can't break the
  // "value is always within [min, max]" invariant.
  const a = opts.min ?? defMin;
  const b = opts.max ?? defMax;
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return { kind, axis: unit(axis), min, max, value: clamp(opts.value ?? 0, min, max) };
}

/** Assemble a Joint from its DOFs, mirroring the primary DOF into the top level. */
function buildJoint(
  type: JointType,
  parent: string,
  child: string,
  axis: JointAxis,
  dofs: readonly JointDOF[]
): Joint {
  const primary = dofs[0] ?? { kind: 'rotation', axis: [0, 0, 1], min: 0, max: 0, value: 0 };
  return {
    type,
    parent,
    child,
    axis: { origin: axis.origin, direction: unit(axis.direction) },
    min: primary.min,
    max: primary.max,
    value: primary.value,
    dofs,
  };
}

/** A revolute (hinge) joint — the child rotates about `axis` by `value` degrees. */
export function revoluteJoint(
  parent: string,
  child: string,
  axis: JointAxis,
  opts: JointOptions = {}
): Joint {
  return buildJoint('revolute', parent, child, axis, [
    makeDof('rotation', axis.direction, opts, -180, 180),
  ]);
}

/**
 * A prismatic (slider) joint — the child translates along `axis` by `value`
 * units. Only `axis.direction` is used; `axis.origin` is ignored (a pure
 * translation has no anchor point), unlike a revolute joint which rotates about
 * the axis line through `origin`.
 */
export function prismaticJoint(
  parent: string,
  child: string,
  axis: JointAxis,
  opts: JointOptions = {}
): Joint {
  return buildJoint('prismatic', parent, child, axis, [
    makeDof('translation', axis.direction, opts, 0, 100),
  ]);
}

/**
 * A cylindrical joint — the child both rotates about and slides along a single
 * `axis` (2 DOF). DOF order: `[rotation, translation]`. The two motions share
 * the axis, so they commute; rotation pivots about `axis.origin`.
 */
export function cylindricalJoint(
  parent: string,
  child: string,
  axis: JointAxis,
  opts: CylindricalOptions = {}
): Joint {
  return buildJoint('cylindrical', parent, child, axis, [
    makeDof('rotation', axis.direction, opts.rotation ?? {}, -180, 180),
    makeDof('translation', axis.direction, opts.translation ?? {}, 0, 100),
  ]);
}

/**
 * A planar joint — the child translates within a plane and rotates about its
 * normal (3 DOF). `plane.direction` is the normal; `plane.origin` the rotation
 * anchor. DOF order: `[u-translation, v-translation, rotation]`, where the
 * translations are applied in the plane frame (independent of the rotation).
 */
export function planarJoint(
  parent: string,
  child: string,
  plane: JointAxis,
  opts: PlanarOptions = {}
): Joint {
  const normal = unit(plane.direction);
  // Project a requested u-direction onto the plane; fall back to an arbitrary
  // in-plane axis. v completes a right-handed in-plane basis.
  let u: Vec3;
  if (opts.uDirection) {
    const d = opts.uDirection;
    const proj = d[0] * normal[0] + d[1] * normal[1] + d[2] * normal[2];
    const inPlane: Vec3 = [
      d[0] - proj * normal[0],
      d[1] - proj * normal[1],
      d[2] - proj * normal[2],
    ];
    u =
      Math.hypot(inPlane[0], inPlane[1], inPlane[2]) < 1e-9
        ? anyPerpendicular(normal)
        : unit(inPlane);
  } else {
    u = anyPerpendicular(normal);
  }
  const v = unit(cross(normal, u));
  return buildJoint('planar', parent, child, { origin: plane.origin, direction: normal }, [
    makeDof('translation', u, opts.u ?? {}, -100, 100),
    makeDof('translation', v, opts.v ?? {}, -100, 100),
    makeDof('rotation', normal, opts.rotation ?? {}, -180, 180),
  ]);
}

/**
 * A spherical (ball) joint — the child rotates freely about a pivot point
 * (3 DOF). DOF order: `[x, y, z]` rotations about the local axes through
 * `pivot`, composed as `Rx · Ry · Rz`.
 */
export function sphericalJoint(
  parent: string,
  child: string,
  pivot: Vec3,
  opts: SphericalOptions = {}
): Joint {
  return buildJoint('spherical', parent, child, { origin: pivot, direction: [0, 0, 1] }, [
    makeDof('rotation', [1, 0, 0], opts.x ?? {}, -180, 180),
    makeDof('rotation', [0, 1, 0], opts.y ?? {}, -180, 180),
    makeDof('rotation', [0, 0, 1], opts.z ?? {}, -180, 180),
  ]);
}

/**
 * Return a copy of `joint` with per-DOF values set (each clamped to its range).
 * Values are positional, matching `joint.dofs`; omitted entries keep their
 * stored value. The primary mirror (`value`) is kept in sync with `dofs[0]`.
 */
export function setJointValues(joint: Joint, values: readonly number[]): Joint {
  const dofs = joint.dofs.map((d, i) => {
    const v = values[i];
    return v === undefined ? d : { ...d, value: clamp(v, d.min, d.max) };
  });
  const primary = dofs[0];
  return primary ? { ...joint, dofs, value: primary.value } : { ...joint, dofs };
}

/** Return a copy of `joint` with its primary DOF set (clamped to range). */
export function setJointValue(joint: Joint, value: number): Joint {
  return setJointValues(joint, [value]);
}

// ---------------------------------------------------------------------------
// Kinematics
// ---------------------------------------------------------------------------

/** The local rigid transform contributed by a single DOF at `value`. */
function dofPose(origin: Vec3, dof: JointDOF, value: number): JointPose {
  if (dof.kind === 'translation') {
    return {
      position: [dof.axis[0] * value, dof.axis[1] * value, dof.axis[2] * value],
      rotation: [1, 0, 0, 0],
    };
  }
  // Rotation about the axis line through `origin`: p ↦ R·p + (origin − R·origin).
  const rotation = quatFromAxisAngle(dof.axis, value * DEG2RAD);
  const ro = quatRotate(rotation, origin);
  return { position: [origin[0] - ro[0], origin[1] - ro[1], origin[2] - ro[2]], rotation };
}

/**
 * The child's local rigid transform (relative to the parent) for given DOF
 * values. Defaults to each DOF's stored value. A single `number` overrides only
 * the primary DOF (single-DOF ergonomics); an array overrides positionally,
 * with omitted entries keeping their stored value. Each value is clamped to its
 * DOF range.
 *
 * DOFs are folded in array order via frame composition. For same-anchor
 * rotations (e.g. spherical) this composes to a single rotation about the pivot;
 * for a cylindrical axis the rotation and slide commute.
 */
export function jointTransform(
  joint: Joint,
  value: number | readonly number[] = joint.value
): JointPose {
  const overrides = Array.isArray(value) ? (value as readonly number[]) : undefined;
  const primary = overrides ? undefined : (value as number);
  const origin = joint.axis.origin;

  let pose = IDENTITY_POSE;
  for (let i = 0; i < joint.dofs.length; i++) {
    const dof = joint.dofs[i];
    if (!dof) continue;
    const raw = overrides
      ? (overrides[i] ?? dof.value)
      : i === 0
        ? (primary ?? dof.value)
        : dof.value;
    pose = composePose(pose, dofPose(origin, dof, clamp(raw, dof.min, dof.max)));
  }
  return pose;
}

// ---------------------------------------------------------------------------
// Assembly integration
// ---------------------------------------------------------------------------

/** Attach a joint to an assembly node. Returns a new node (immutable). */
export function addJoint(assembly: AssemblyNode, joint: Joint): AssemblyNode {
  const existing = (assembly.joints ?? []) as readonly Joint[];
  return { ...assembly, joints: [...existing, joint] };
}

// ---------------------------------------------------------------------------
// Forward kinematics
// ---------------------------------------------------------------------------

const IDENTITY_POSE: JointPose = { position: [0, 0, 0], rotation: [1, 0, 0, 0] };

/** Compose two poses: the result applies `b` in `a`'s frame (`a ∘ b`). */
function composePose(a: JointPose, b: JointPose): JointPose {
  const rb = quatRotate(a.rotation, b.position);
  return {
    position: [a.position[0] + rb[0], a.position[1] + rb[1], a.position[2] + rb[2]],
    rotation: quatMultiply(a.rotation, b.rotation),
  };
}

/** Collect every joint attached anywhere in the assembly tree. */
function collectJoints(assembly: AssemblyNode): Joint[] {
  const joints: Joint[] = [];
  walkAssembly(assembly, (node) => {
    if (node.joints) joints.push(...(node.joints as readonly Joint[]));
  });
  return joints;
}

/**
 * Forward kinematics: set joint values and propagate world poses down the
 * kinematic chain. Each joint's axis is interpreted in its **parent's** frame,
 * so a child's world pose is `parentWorld ∘ jointTransform(joint, value)`.
 *
 * Bodies not driven by a joint (chain roots) start at the origin. `jointValues`
 * overrides a joint's stored value, keyed by the **child** node name; omitted
 * joints use `joint.value`. Resolution is topological (reuses the Phase-0
 * ordering), so chains of any depth compose. Returns a world pose for every node.
 */
export function forwardKinematics(
  assembly: AssemblyNode,
  jointValues: Readonly<Record<string, number | readonly number[]>> = {}
): Map<string, JointPose> {
  // Single pass: gather joints and node names together.
  const joints: Joint[] = [];
  const names = new Set<string>();
  walkAssembly(assembly, (node) => {
    names.add(node.name);
    if (node.joints) joints.push(...(node.joints as readonly Joint[]));
  });
  const byChild = new Map<string, Joint>();
  for (const j of joints) {
    byChild.set(j.child, j);
    names.add(j.parent);
    names.add(j.child);
  }

  const poses = new Map<string, JointPose>();
  // Roots: any node not driven by a joint sits at the origin.
  for (const name of names) if (!byChild.has(name)) poses.set(name, IDENTITY_POSE);

  // Propagate down the joint graph: a joint resolves once its parent is placed.
  const pending = [...joints];
  let progress = true;
  while (progress && pending.length > 0) {
    progress = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const j = pending[i];
      if (!j) continue;
      const parentPose = poses.get(j.parent);
      if (!parentPose) continue; // parent not placed yet — defer
      pending.splice(i, 1);
      progress = true;
      if (poses.has(j.child)) continue; // already placed (duplicate/cycle) — skip
      const value = jointValues[j.child] ?? j.value;
      poses.set(j.child, composePose(parentPose, jointTransform(j, value)));
    }
  }
  // A joint whose parent never resolved (cycle/dangling) still gets an entry so
  // the map covers every node.
  for (const j of pending) if (!poses.has(j.child)) poses.set(j.child, IDENTITY_POSE);

  return poses;
}

/**
 * Open-chain mobility — the number of independent degrees of freedom, summing
 * each joint's DOF count (revolute/prismatic 1, cylindrical 2, planar/spherical
 * 3). For a serial chain this equals the total DOF. (Closed-loop
 * Grübler/Kutzbach analysis is future work.)
 */
export function mechanismDOF(assembly: AssemblyNode): number {
  return collectJoints(assembly).reduce((sum, j) => sum + j.dofs.length, 0);
}
