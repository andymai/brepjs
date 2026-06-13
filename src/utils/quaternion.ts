/**
 * Quaternion helpers for rigid rotations, shared by the constraint solver and
 * the joint/kinematics layer. Scalar-first convention: `[w, x, y, z]`.
 *
 * Layer 0 (utils): no internal imports — `Vec3` is declared locally.
 * @module
 */

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** A unit vector perpendicular to `v` (for the 180°/parallel degenerate cases). */
function anyPerpendicular(v: Vec3): Vec3 {
  const ref: Vec3 = Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return normalize(cross(v, ref));
}

// Returns are mutable tuples (readonly inputs) so callers that store rotations
// in mutable tuple fields can use them without readonly-assignment friction.

/** Rotate vector `v` by quaternion `q`. */
export function quatRotate(q: Quat, v: Vec3): [number, number, number] {
  const [w, x, y, z] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

/** Quaternion for a rotation of `angle` radians about (unit-normalized) `axis`. */
export function quatFromAxisAngle(axis: Vec3, angle: number): [number, number, number, number] {
  const h = angle / 2;
  const s = Math.sin(h);
  const u = normalize(axis);
  return [Math.cos(h), u[0] * s, u[1] * s, u[2] * s];
}

/** Shortest-arc quaternion rotating unit vector `from` onto unit vector `to`. */
export function quatFromTo(from: Vec3, to: Vec3): [number, number, number, number] {
  const a = normalize(from);
  const b = normalize(to);
  const d = dot(a, b);
  if (d >= 1 - 1e-9) return [1, 0, 0, 0];
  if (d <= -1 + 1e-9) return quatFromAxisAngle(anyPerpendicular(a), Math.PI);
  const c = cross(a, b);
  const len = Math.hypot(1 + d, c[0], c[1], c[2]) || 1;
  return [(1 + d) / len, c[0] / len, c[1] / len, c[2] / len];
}

/** Hamilton product `a ⊗ b` — the rotation that applies `b` first, then `a`. */
export function quatMultiply(a: Quat, b: Quat): [number, number, number, number] {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}
