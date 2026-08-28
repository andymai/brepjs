/**
 * Rigid-body frame algebra for the families -> BIM placement fold. A `Frame` is
 * a column-major 4x4 (the same layout as {@link Mat4x4}): columns 0-2 are the
 * basis vectors (axisX, axisY, axisZ), column 3 is the translation, and the
 * bottom row is [0,0,0,1]. Every frame produced here is a proper rigid motion
 * (rotation + translation, no scale/shear), so it is fully described by its
 * origin + IFC axes and inverts by transpose.
 *
 * The adapter composes a families `TransformOp` chain into one frame, then reads
 * an element's IfcLocalPlacement off it: a local placement relative to a spatial
 * container is `decompose(inverse(containerFrame) . elementWorldFrame)`.
 */

import type { TransformOp } from 'brepjs-families';
import {
  decomposePlacement,
  type FrameInput,
  type Mat4x4,
  type Vec3,
  type WorldPlacement,
} from './import/placement.js';

export type Frame = Mat4x4;

export const IDENTITY_FRAME: Frame = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const DEFAULT_AXIS: Vec3 = [0, 0, 1];
const ORIGIN: Vec3 = [0, 0, 0];

/** Column-major 4x4 multiply: `a . b` (apply b first, then a). */
export function frameMul(a: Frame, b: Frame): Frame {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0);
      out[col * 4 + row] = sum;
    }
  }
  return out as unknown as Frame;
}

export function translationFrame(v: Vec3): Frame {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, v[0], v[1], v[2], 1];
}

function normalizeAxis(axis: Vec3): Vec3 {
  const len = Math.sqrt(axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]);
  if (len < 1e-12) return DEFAULT_AXIS;
  return [axis[0] / len, axis[1] / len, axis[2] / len];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Builds a frame from an authored `(origin, axisX, axisZ)` placement, using the
 * same IFC orthonormalization as `placementToMatrix`/`readAxis2Placement3D`:
 * z = normalize(axisZ); x = normalize(axisX projected perpendicular to z);
 * y = z x. Lets a civil node authored with explicit axis props enter the same
 * frame pipeline as a `tRotate` chain.
 */
export function frameFromPlacement(f: FrameInput): Frame {
  const z = normalizeAxis(f.axisZ);
  const dot = z[0] * f.axisX[0] + z[1] * f.axisX[1] + z[2] * f.axisX[2];
  const projX: Vec3 = [f.axisX[0] - dot * z[0], f.axisX[1] - dot * z[1], f.axisX[2] - dot * z[2]];
  const x = normalizeAxis(projX);
  const y = cross(z, x);
  return [
    x[0],
    x[1],
    x[2],
    0,
    y[0],
    y[1],
    y[2],
    0,
    z[0],
    z[1],
    z[2],
    0,
    f.origin[0],
    f.origin[1],
    f.origin[2],
    1,
  ];
}

/**
 * Rotation by `angleDeg` about `axis` (default +Z) through pivot `at` (default
 * origin), matching `csg.rotate` (Rodrigues; right-handed about the axis). With
 * a pivot the motion is `T(at) . R . T(-at)`, i.e. `p -> at + R(p - at)`.
 */
export function rotationFrame(
  angleDeg: number,
  axis: Vec3 = DEFAULT_AXIS,
  at: Vec3 = ORIGIN
): Frame {
  const [x, y, z] = normalizeAxis(axis);
  const t = (angleDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const C = 1 - c;
  // Row-major rotation matrix entries (standard Rodrigues form).
  const r00 = c + x * x * C;
  const r01 = x * y * C - z * s;
  const r02 = x * z * C + y * s;
  const r10 = y * x * C + z * s;
  const r11 = c + y * y * C;
  const r12 = y * z * C - x * s;
  const r20 = z * x * C - y * s;
  const r21 = z * y * C + x * s;
  const r22 = c + z * z * C;
  // Pivot: translation = at - R.at.
  const rat0 = r00 * at[0] + r01 * at[1] + r02 * at[2];
  const rat1 = r10 * at[0] + r11 * at[1] + r12 * at[2];
  const rat2 = r20 * at[0] + r21 * at[1] + r22 * at[2];
  // Column-major: columns are R.e0, R.e1, R.e2; translation in column 3.
  return [
    r00,
    r10,
    r20,
    0,
    r01,
    r11,
    r21,
    0,
    r02,
    r12,
    r22,
    0,
    at[0] - rat0,
    at[1] - rat1,
    at[2] - rat2,
    1,
  ];
}

function opFrame(op: TransformOp): Frame {
  if (op.op === 'translate') return translationFrame(op.v);
  return rotationFrame(op.angleDeg, op.axis ?? DEFAULT_AXIS, op.at ?? ORIGIN);
}

/**
 * Composes an authored `TransformOp` chain into one frame, matching families'
 * `applyOps`: `ops[0]` is innermost (applied first). For `[A, B]` the composed
 * motion is `B . A`, so a point transforms as `B(A(p))`.
 */
export function frameFromOps(ops: readonly TransformOp[]): Frame {
  let m: Frame = IDENTITY_FRAME;
  for (const op of ops) m = frameMul(opFrame(op), m);
  return m;
}

/** Rigid inverse of `[R | t]`: `[R^T | -R^T t]`. */
export function frameInverse(f: Frame): Frame {
  // Column-major: R column c is [f[c], f[4+c], f[8+c]]; transpose swaps to rows.
  const t0 = f[12] ?? 0;
  const t1 = f[13] ?? 0;
  const t2 = f[14] ?? 0;
  // -R^T t: row i of R^T is column i of R = [f[i], f[4+i], f[8+i]].
  const inv0 = -(f[0] * t0 + f[1] * t1 + f[2] * t2);
  const inv1 = -(f[4] * t0 + f[5] * t1 + f[6] * t2);
  const inv2 = -(f[8] * t0 + f[9] * t1 + f[10] * t2);
  return [f[0], f[4], f[8], 0, f[1], f[5], f[9], 0, f[2], f[6], f[10], 0, inv0, inv1, inv2, 1];
}

/** Decomposes a frame into origin (mm) + IFC axes (axisX, axisZ). */
export function decomposeFrame(f: Frame): WorldPlacement {
  return decomposePlacement(f);
}

/** Translation column of a frame. */
export function frameOrigin(f: Frame): Vec3 {
  return [f[12] ?? 0, f[13] ?? 0, f[14] ?? 0];
}

/** True when the rotation part is the identity (within tolerance): a pure
 *  translation, so the existing translation-only placement path suffices. */
export function isPureTranslation(f: Frame, eps = 1e-9): boolean {
  return (
    Math.abs((f[0] ?? 1) - 1) < eps &&
    Math.abs((f[5] ?? 1) - 1) < eps &&
    Math.abs((f[10] ?? 1) - 1) < eps &&
    Math.abs(f[1] ?? 0) < eps &&
    Math.abs(f[2] ?? 0) < eps &&
    Math.abs(f[4] ?? 0) < eps &&
    Math.abs(f[6] ?? 0) < eps &&
    Math.abs(f[8] ?? 0) < eps &&
    Math.abs(f[9] ?? 0) < eps
  );
}
