/**
 * Inverse kinematics and motion trajectories for joint chains.
 *
 * `inverseKinematics` solves for the joint values that place an end-effector at
 * a target pose, using a damped-least-squares (Levenberg-Marquardt) update over
 * a numerically-differentiated Jacobian. Differentiating through
 * `forwardKinematics` keeps the solver agnostic to joint type — revolute,
 * prismatic, and the multi-DOF cylindrical/planar/spherical joints all
 * contribute their `dofs` uniformly — and respects each DOF's range by clamping
 * every iterate.
 *
 * `jointTrajectory` samples a straight-line path in joint space between two
 * configurations, returning the posed assembly (via forward kinematics) at each
 * step — the building block for animation and reachable-workspace sweeps.
 */

import type { Vec3 } from '@/core/types.js';
import { quatMultiply, quatRotate } from '@/utils/quaternion.js';
import type { AssemblyNode } from './assemblyFns.js';
import { walkAssembly } from './assemblyFns.js';
import { forwardKinematics, type Joint, type JointPose } from './jointFns.js';

type Quat = readonly [number, number, number, number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A target for the end-effector: a world position, optionally an orientation. */
export interface IKTarget {
  readonly position: Vec3;
  /** Target orientation `[w, x, y, z]`. Omit for position-only IK. */
  readonly rotation?: Quat;
}

export interface IKOptions {
  /** Maximum solver iterations. Default 200. */
  maxIterations?: number;
  /** Convergence threshold on the residual norm. Default 1e-5. */
  tolerance?: number;
  /** Damping factor λ for the least-squares step. Default 0.05. */
  damping?: number;
  /** Initial joint values, keyed by child node (number or per-DOF array). */
  seed?: Readonly<Record<string, number | readonly number[]>>;
  /** Local point on the end-effector node to drive to the target. Default origin. */
  tip?: Vec3;
}

export interface IKResult {
  /** Solved joint values, keyed by child node, one entry per DOF. */
  readonly values: Record<string, number[]>;
  readonly converged: boolean;
  readonly iterations: number;
  /** Final residual norm (position, plus orientation when targeted). */
  readonly error: number;
}

// ---------------------------------------------------------------------------
// Small vector / quaternion helpers
// ---------------------------------------------------------------------------

const IDENTITY_POSE: JointPose = { position: [0, 0, 0], rotation: [1, 0, 0, 0] };

function applyPose(pose: JointPose, p: Vec3): Vec3 {
  const r = quatRotate(pose.rotation, p);
  return [r[0] + pose.position[0], r[1] + pose.position[1], r[2] + pose.position[2]];
}

function quatConjugate(q: Quat): Quat {
  return [q[0], -q[1], -q[2], -q[3]];
}

/**
 * The rotation vector (axis · angle) taking orientation `from` to `to`, i.e. the
 * angular error that drives `from` toward `to`. Returns the zero vector when the
 * orientations coincide.
 */
function rotationError(from: Quat, to: Quat): Vec3 {
  const d = quatMultiply(to, quatConjugate(from));
  let [w, x, y, z] = d;
  const norm = Math.hypot(w, x, y, z) || 1;
  w /= norm;
  x /= norm;
  y /= norm;
  z /= norm;
  if (w < 0) {
    // Shortest path: q and -q represent the same rotation.
    w = -w;
    x = -x;
    y = -y;
    z = -z;
  }
  const s = Math.hypot(x, y, z);
  if (s < 1e-12) return [0, 0, 0];
  const angle = 2 * Math.atan2(s, w);
  const k = angle / s;
  return [x * k, y * k, z * k];
}

// ---------------------------------------------------------------------------
// Chain extraction
// ---------------------------------------------------------------------------

/** Joints from the root down to `endEffector`, in root→leaf order. */
function chainTo(assembly: AssemblyNode, endEffector: string): Joint[] {
  const joints: Joint[] = [];
  walkAssembly(assembly, (n) => {
    if (n.joints) joints.push(...(n.joints as readonly Joint[]));
  });
  const byChild = new Map<string, Joint>();
  for (const j of joints) byChild.set(j.child, j);

  const chain: Joint[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = endEffector;
  while (cur && byChild.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    const j = byChild.get(cur);
    if (!j) break;
    chain.push(j);
    cur = j.parent;
  }
  return chain.reverse();
}

// ---------------------------------------------------------------------------
// Linear algebra (small dense systems, Float64Array to avoid index-undefined)
// ---------------------------------------------------------------------------

/** Read a Float64Array element as a definite number (dense matrices are full). */
function el(a: Float64Array, i: number): number {
  return a[i] ?? 0;
}

/** Solve `A x = b` for an `n×n` system by Gauss-Jordan with partial pivoting. */
function solveLinear(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  const w = n + 1;
  const M = new Float64Array(n * w);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) M[r * w + c] = el(A, r * n + c);
    M[r * w + n] = el(b, r);
  }
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(el(M, r * w + col)) > Math.abs(el(M, piv * w + col))) piv = r;
    }
    if (Math.abs(el(M, piv * w + col)) < 1e-12) return null;
    if (piv !== col) {
      for (let k = col; k < w; k++) {
        const tmp = el(M, col * w + k);
        M[col * w + k] = el(M, piv * w + k);
        M[piv * w + k] = tmp;
      }
    }
    const d = el(M, col * w + col);
    for (let k = col; k < w; k++) M[col * w + k] = el(M, col * w + k) / d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = el(M, r * w + col);
      if (f === 0) continue;
      for (let k = col; k < w; k++) M[r * w + k] = el(M, r * w + k) - f * el(M, col * w + k);
    }
  }
  const x = new Float64Array(n);
  for (let r = 0; r < n; r++) x[r] = el(M, r * w + n);
  return x;
}

// ---------------------------------------------------------------------------
// Inverse kinematics
// ---------------------------------------------------------------------------

interface FlatChain {
  /** Joint segments in root→leaf order, each owning `count` consecutive DOFs. */
  readonly segments: ReadonlyArray<{ child: string; count: number }>;
  /** Current parameter vector (one entry per DOF). */
  readonly q: Float64Array;
  /** Per-DOF lower and upper bounds. */
  readonly lo: Float64Array;
  readonly hi: Float64Array;
}

/** Flatten a chain's DOFs into a parameter vector with bounds, applying the seed. */
function flattenChain(
  chain: readonly Joint[],
  seed?: Readonly<Record<string, number | readonly number[]>>
): FlatChain {
  const segments: Array<{ child: string; count: number }> = [];
  const q: number[] = [];
  const lo: number[] = [];
  const hi: number[] = [];
  for (const j of chain) {
    const s = seed?.[j.child];
    segments.push({ child: j.child, count: j.dofs.length });
    j.dofs.forEach((dof, i) => {
      const seeded = Array.isArray(s) ? s[i] : i === 0 ? (s as number | undefined) : undefined;
      const v = seeded ?? dof.value;
      q.push(Math.min(dof.max, Math.max(dof.min, v)));
      lo.push(dof.min);
      hi.push(dof.max);
    });
  }
  return {
    segments,
    q: Float64Array.from(q),
    lo: Float64Array.from(lo),
    hi: Float64Array.from(hi),
  };
}

/** Slice a parameter vector back into per-joint value arrays keyed by child. */
function overridesOf(segments: FlatChain['segments'], q: Float64Array): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  let i = 0;
  for (const seg of segments) {
    const vals: number[] = [];
    for (let k = 0; k < seg.count; k++) vals.push(el(q, i++));
    out[seg.child] = vals;
  }
  return out;
}

/** Residual twist `e` (target − current) for a pose; returns its norm. */
function residualTwist(
  out: Float64Array,
  pose: JointPose,
  target: IKTarget,
  tip: Vec3,
  m: number
): number {
  const pos = applyPose(pose, tip);
  out[0] = target.position[0] - pos[0];
  out[1] = target.position[1] - pos[1];
  out[2] = target.position[2] - pos[2];
  if (m === 6 && target.rotation) {
    const r = rotationError(pose.rotation, target.rotation);
    out[3] = r[0];
    out[4] = r[1];
    out[5] = r[2];
  }
  let s = 0;
  for (let i = 0; i < m; i++) s += el(out, i) ** 2;
  return Math.sqrt(s);
}

/**
 * Finite-difference Jacobian: column `j` is the end-effector twist from δq[j].
 * The probe steps *inward* from a bound — `forwardKinematics` clamps each DOF to
 * its range, so a forward `+eps` at the upper limit would yield a zero column and
 * trap the solver at the ceiling. Stepping `-eps` there (and dividing by the
 * signed step) keeps every column a true one-sided derivative.
 */
function fillJacobian(
  J: Float64Array,
  q: Float64Array,
  n: number,
  m: number,
  lo: Float64Array,
  hi: Float64Array,
  base: JointPose,
  tip: Vec3,
  eps: number,
  tipPose: (s: Float64Array) => JointPose
): void {
  const basePos = applyPose(base, tip);
  for (let j = 0; j < n; j++) {
    const saved = el(q, j);
    // Step away from whichever bound we're against so the perturbation isn't
    // clamped to a no-op; default forward.
    const h = saved + eps > el(hi, j) && saved - eps >= el(lo, j) ? -eps : eps;
    q[j] = saved + h;
    const p2 = tipPose(q);
    q[j] = saved;
    const pos2 = applyPose(p2, tip);
    J[j] = (pos2[0] - basePos[0]) / h;
    J[n + j] = (pos2[1] - basePos[1]) / h;
    J[2 * n + j] = (pos2[2] - basePos[2]) / h;
    if (m === 6) {
      const dr = rotationError(base.rotation, p2.rotation);
      J[3 * n + j] = dr[0] / h;
      J[4 * n + j] = dr[1] / h;
      J[5 * n + j] = dr[2] / h;
    }
  }
}

/** One damped-least-squares step: `Δq = Jᵀ(JJᵀ + λ²I)⁻¹ e`. */
function dlsStep(
  J: Float64Array,
  e: Float64Array,
  n: number,
  m: number,
  lambda: number
): Float64Array | null {
  const A = new Float64Array(m * m);
  const lam2 = lambda * lambda;
  for (let r = 0; r < m; r++) {
    for (let c = 0; c < m; c++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += el(J, r * n + k) * el(J, c * n + k);
      A[r * m + c] = s + (r === c ? lam2 : 0);
    }
  }
  const y = solveLinear(A, e, m);
  if (!y) return null;
  const dq = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    let v = 0;
    for (let r = 0; r < m; r++) v += el(J, r * n + j) * el(y, r);
    dq[j] = v;
  }
  return dq;
}

/**
 * Solve for the joint values that place `endEffector` (offset by `tip`) at
 * `target`, by damped-least-squares descent on a numerical Jacobian. Joint
 * ranges are honored: every iterate is clamped to each DOF's `[min, max]`.
 *
 * Returns the solved per-DOF values keyed by child node (ready to pass to
 * `forwardKinematics`), whether it converged, the iteration count, and the final
 * residual norm. An end-effector with no driving joints, or an unreachable
 * target, returns `converged: false` with the best configuration found.
 */
export function inverseKinematics(
  assembly: AssemblyNode,
  endEffector: string,
  target: IKTarget,
  options: IKOptions = {}
): IKResult {
  const maxIterations = options.maxIterations ?? 200;
  const tolerance = options.tolerance ?? 1e-5;
  const lambda = options.damping ?? 0.05;
  const tip: Vec3 = options.tip ?? [0, 0, 0];
  const m = target.rotation !== undefined ? 6 : 3;
  const eps = 1e-6;

  const { segments, q, lo, hi } = flattenChain(chainTo(assembly, endEffector), options.seed);
  const n = q.length;

  const tipPose = (state: Float64Array): JointPose =>
    forwardKinematics(assembly, overridesOf(segments, state)).get(endEffector) ?? IDENTITY_POSE;

  const e = new Float64Array(m);
  const J = new Float64Array(m * n);

  let pose = tipPose(q);
  let err = residualTwist(e, pose, target, tip, m);
  let iter = 0;

  for (; iter < maxIterations && n > 0 && err > tolerance; iter++) {
    fillJacobian(J, q, n, m, lo, hi, pose, tip, eps, tipPose);
    const dq = dlsStep(J, e, n, m, lambda);
    if (!dq) break;
    for (let j = 0; j < n; j++) {
      const next = el(q, j) + el(dq, j);
      q[j] = Math.min(el(hi, j), Math.max(el(lo, j), next));
    }
    pose = tipPose(q);
    err = residualTwist(e, pose, target, tip, m);
  }

  return {
    values: overridesOf(segments, q),
    converged: err <= tolerance,
    iterations: iter,
    error: err,
  };
}

// ---------------------------------------------------------------------------
// Trajectories
// ---------------------------------------------------------------------------

export interface TrajectorySample {
  /** Normalized path parameter in `[0, 1]`. */
  readonly t: number;
  /** Interpolated joint values at this step, keyed by child node. */
  readonly values: Record<string, number[]>;
  /** Forward-kinematics world poses for every node at this step. */
  readonly poses: Map<string, JointPose>;
}

/** Resolve a value spec (number, array, or absent) to a per-DOF array. */
function valuesOf(joint: Joint, spec: number | readonly number[] | undefined): number[] {
  return joint.dofs.map((dof, i) => {
    const raw = Array.isArray(spec) ? spec[i] : i === 0 ? (spec as number | undefined) : undefined;
    const v = raw ?? dof.value;
    return Math.min(dof.max, Math.max(dof.min, v));
  });
}

/**
 * Sample a straight-line path in joint space from `from` to `to` over `steps`
 * segments, yielding `steps + 1` samples (inclusive of both endpoints). Each
 * sample carries the interpolated per-DOF values (clamped to range) and the
 * forward-kinematics poses of every node. Joints absent from `from`/`to` hold
 * their stored value at both ends.
 */
export function jointTrajectory(
  assembly: AssemblyNode,
  from: Readonly<Record<string, number | readonly number[]>>,
  to: Readonly<Record<string, number | readonly number[]>>,
  steps: number
): TrajectorySample[] {
  const joints: Joint[] = [];
  walkAssembly(assembly, (n) => {
    if (n.joints) joints.push(...(n.joints as readonly Joint[]));
  });

  const ends = joints.map((j) => ({
    child: j.child,
    a: valuesOf(j, from[j.child]),
    b: valuesOf(j, to[j.child]),
  }));

  const count = Math.max(1, Math.floor(steps));
  const samples: TrajectorySample[] = [];
  for (let s = 0; s <= count; s++) {
    const t = s / count;
    const values: Record<string, number[]> = {};
    for (const end of ends) {
      values[end.child] = end.a.map((a, i) => a + ((end.b[i] ?? a) - a) * t);
    }
    samples.push({ t, values, poses: forwardKinematics(assembly, values) });
  }
  return samples;
}
