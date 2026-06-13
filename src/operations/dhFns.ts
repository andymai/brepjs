/**
 * Denavit-Hartenberg interchange: build a brepjs joint chain from a standard
 * (distal) DH parameter table.
 *
 * Each DH row maps the previous link frame to the next via
 * `Rz(θ) · Tz(d) · Tx(a) · Rx(α)`, with one parameter the joint variable
 * (θ for revolute, d for prismatic) and the rest fixed link geometry. A row
 * becomes a single revolute/prismatic joint whose motion is the variable part
 * and whose fixed link geometry rides on the joint's post-motion `offset`
 * (see `Joint.offset`), so the chain composes correctly through
 * `forwardKinematics` and each row contributes exactly one DOF.
 */

import { quatFromAxisAngle, quatMultiply } from '@/utils/quaternion.js';
import { revoluteJoint, prismaticJoint, type Joint, type JointPose } from './jointFns.js';

const DEG2RAD = Math.PI / 180;

/** One row of a Denavit-Hartenberg table (angles in degrees). */
export interface DHRow {
  /** Link length: translation along the (rotated) x axis. */
  readonly a: number;
  /** Link twist: rotation about the x axis, in degrees. */
  readonly alpha: number;
  /** Link offset: translation along the z axis. For prismatic, the home offset. */
  readonly d: number;
  /** Joint angle about z, in degrees. For revolute, the home angle. */
  readonly theta: number;
  /** Which parameter is the joint variable. Default `'revolute'` (θ varies). */
  readonly type?: 'revolute' | 'prismatic';
  /** Joint range lower bound (degrees for revolute, length for prismatic). */
  readonly min?: number;
  /** Joint range upper bound. */
  readonly max?: number;
  /** Initial joint value (clamped to range). Default 0. */
  readonly value?: number;
  /** Child link name produced by this row. Default `link{i+1}`. */
  readonly name?: string;
}

export interface DHOptions {
  /** Name of the base (root) link. Default `'base'`. */
  base?: string;
}

/**
 * The fixed DH link transform `Rz(θ) · Tz(d) · Tx(a) · Rx(α)` as a pose.
 * Carries the constant link geometry that rides on the joint's `offset`.
 */
function linkOffset(thetaDeg: number, d: number, a: number, alphaDeg: number): JointPose {
  const theta = thetaDeg * DEG2RAD;
  const alpha = alphaDeg * DEG2RAD;
  const rotation = quatMultiply(
    quatFromAxisAngle([0, 0, 1], theta),
    quatFromAxisAngle([1, 0, 0], alpha)
  );
  // Translation of Rz(θ)·Tz(d)·Tx(a): a along the θ-rotated x, d along z.
  return { position: [a * Math.cos(theta), a * Math.sin(theta), d], rotation };
}

/**
 * Build a serial revolute/prismatic joint chain from a DH table. Joint `i`
 * connects the previous link to row `i`'s link; its motion is the variable
 * parameter (θ for revolute, d for prismatic) about/along +z, and its fixed
 * link geometry is carried on `Joint.offset`. The result drives correctly
 * through `forwardKinematics` and reports `rows.length` DOF via `mechanismDOF`.
 */
export function jointsFromDH(rows: readonly DHRow[], options: DHOptions = {}): Joint[] {
  const base = options.base ?? 'base';
  const names = rows.map((r, i) => r.name ?? `link${i + 1}`);

  return rows.map((row, i) => {
    const parent = i === 0 ? base : (names[i - 1] ?? `link${i}`);
    const child = names[i] ?? `link${i + 1}`;
    const offset = linkOffset(row.theta, row.d, row.a, row.alpha);
    const axis = { origin: [0, 0, 0] as const, direction: [0, 0, 1] as const };
    const opts = {
      ...(row.min !== undefined ? { min: row.min } : {}),
      ...(row.max !== undefined ? { max: row.max } : {}),
      ...(row.value !== undefined ? { value: row.value } : {}),
    };
    const joint =
      row.type === 'prismatic'
        ? prismaticJoint(parent, child, axis, opts)
        : revoluteJoint(parent, child, axis, opts);
    return { ...joint, offset };
  });
}
