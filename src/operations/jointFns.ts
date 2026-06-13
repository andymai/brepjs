/**
 * Drivable kinematic joints — revolute and prismatic — built on the assembly
 * tree. A joint connects a `parent` (reference) body to a `child` (moving) body
 * about/along an axis, carrying a single drivable parameter clamped to a range.
 *
 * A joint is sugar over the Phase-1 mate constraints — a revolute is concentric
 * (axis alignment) plus an angle driver; a prismatic is coincident plus a
 * distance driver — but the *local* child transform for a given joint value is
 * computed directly here. Forward kinematics (composing these down a chain) is
 * Phase 3. `joint.value` is the stored degree of freedom, distinct from
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

export type JointType = 'revolute' | 'prismatic';

export interface Joint {
  readonly type: JointType;
  /** Reference body (stays put); the child moves relative to it. */
  readonly parent: string;
  readonly child: string;
  readonly axis: JointAxis;
  /** Range bounds — degrees for revolute, length units for prismatic. */
  readonly min: number;
  readonly max: number;
  /** Current drivable parameter, always clamped to `[min, max]`. */
  readonly value: number;
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

function makeJoint(
  type: JointType,
  parent: string,
  child: string,
  axis: JointAxis,
  opts: JointOptions,
  defMin: number,
  defMax: number
): Joint {
  // Normalize the range so an inverted (min > max) input can't break the
  // "value is always within [min, max]" invariant.
  const a = opts.min ?? defMin;
  const b = opts.max ?? defMax;
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return {
    type,
    parent,
    child,
    axis: { origin: axis.origin, direction: unit(axis.direction) },
    min,
    max,
    value: clamp(opts.value ?? 0, min, max),
  };
}

/** A revolute (hinge) joint — the child rotates about `axis` by `value` degrees. */
export function revoluteJoint(
  parent: string,
  child: string,
  axis: JointAxis,
  opts: JointOptions = {}
): Joint {
  return makeJoint('revolute', parent, child, axis, opts, -180, 180);
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
  return makeJoint('prismatic', parent, child, axis, opts, 0, 100);
}

/** Return a copy of `joint` with its drivable parameter set (clamped to range). */
export function setJointValue(joint: Joint, value: number): Joint {
  return { ...joint, value: clamp(value, joint.min, joint.max) };
}

// ---------------------------------------------------------------------------
// Kinematics
// ---------------------------------------------------------------------------

/**
 * The child's local rigid transform (relative to the parent) for a joint value.
 * Defaults to the joint's stored value; an explicit value is clamped to range.
 *
 * - **revolute**: rotation of `value` degrees about the axis line. Rotating
 *   about a line through `origin` is `p ↦ R·p + (origin − R·origin)`.
 * - **prismatic**: translation of `value` units along the axis direction.
 */
export function jointTransform(joint: Joint, value: number = joint.value): JointPose {
  const v = clamp(value, joint.min, joint.max);
  const dir = unit(joint.axis.direction);

  if (joint.type === 'prismatic') {
    return { position: [dir[0] * v, dir[1] * v, dir[2] * v], rotation: [1, 0, 0, 0] };
  }

  const rotation = quatFromAxisAngle(dir, v * DEG2RAD);
  const o = joint.axis.origin;
  const ro = quatRotate(rotation, o);
  return { position: [o[0] - ro[0], o[1] - ro[1], o[2] - ro[2]], rotation };
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
  jointValues: Readonly<Record<string, number>> = {}
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

const JOINT_FREEDOM: Readonly<Record<JointType, number>> = { revolute: 1, prismatic: 1 };

/**
 * Open-chain mobility — the number of independent degrees of freedom. Each
 * revolute/prismatic joint contributes 1, so for a serial chain this equals the
 * joint count. (Closed-loop Grübler/Kutzbach analysis is future work.)
 */
export function mechanismDOF(assembly: AssemblyNode): number {
  return collectJoints(assembly).reduce((sum, j) => sum + JOINT_FREEDOM[j.type], 0);
}
