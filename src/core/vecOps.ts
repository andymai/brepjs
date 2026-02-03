/**
 * Pure vector operations on Vec3 tuples.
 * Replaces the old Vector class methods.
 * Zero dependencies — pure math functions.
 */

import type { Vec3, Vec2 } from './types.js';

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

export function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vecSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vecScale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function vecNegate(v: Vec3): Vec3 {
  return [-v[0], -v[1], -v[2]];
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export function vecDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vecCross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

// ---------------------------------------------------------------------------
// Length / distance
// ---------------------------------------------------------------------------

export function vecLength(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

export function vecLengthSq(v: Vec3): number {
  return v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
}

export function vecDistance(a: Vec3, b: Vec3): number {
  return vecLength(vecSub(a, b));
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export function vecNormalize(v: Vec3): Vec3 {
  const len = vecLength(v);
  if (len < 1e-10) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export function vecEquals(a: Vec3, b: Vec3, tolerance = 1e-5): boolean {
  return (
    Math.abs(a[0] - b[0]) < tolerance &&
    Math.abs(a[1] - b[1]) < tolerance &&
    Math.abs(a[2] - b[2]) < tolerance
  );
}

export function vecIsZero(v: Vec3, tolerance = 1e-10): boolean {
  return vecLengthSq(v) < tolerance * tolerance;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export function vecAngle(a: Vec3, b: Vec3): number {
  const dot = vecDot(a, b);
  const lenA = vecLength(a);
  const lenB = vecLength(b);
  if (lenA === 0 || lenB === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot / (lenA * lenB)));
  return Math.acos(cosAngle);
}

/** Project vector onto plane defined by its normal */
export function vecProjectToPlane(v: Vec3, planeOrigin: Vec3, planeNormal: Vec3): Vec3 {
  const relative = vecSub(v, planeOrigin);
  const normalLen = vecLengthSq(planeNormal);
  if (normalLen === 0) return v;
  const projection = vecScale(planeNormal, vecDot(relative, planeNormal) / normalLen);
  return vecSub(v, projection);
}

/** Rotate vector around an axis by angle (radians) */
export function vecRotate(v: Vec3, axis: Vec3, angleRad: number): Vec3 {
  const n = vecNormalize(axis);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dot = vecDot(v, n);
  const cross = vecCross(n, v);

  return [
    v[0] * cos + cross[0] * sin + n[0] * dot * (1 - cos),
    v[1] * cos + cross[1] * sin + n[1] * dot * (1 - cos),
    v[2] * cos + cross[2] * sin + n[2] * dot * (1 - cos),
  ];
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

export function vecRepr(v: Vec3): string {
  return `x: ${round3(v[0])}, y: ${round3(v[1])}, z: ${round3(v[2])}`;
}

// ---------------------------------------------------------------------------
// 2D operations
// ---------------------------------------------------------------------------

export function vec2Add(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

export function vec2Sub(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

export function vec2Scale(v: Vec2, s: number): Vec2 {
  return [v[0] * s, v[1] * s];
}

export function vec2Length(v: Vec2): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1]);
}

export function vec2Distance(a: Vec2, b: Vec2): number {
  return vec2Length(vec2Sub(a, b));
}

export function vec2Normalize(v: Vec2): Vec2 {
  const len = vec2Length(v);
  if (len === 0) return [0, 0];
  return [v[0] / len, v[1] / len];
}

export function vec2Equals(a: Vec2, b: Vec2, tolerance = 1e-5): boolean {
  return Math.abs(a[0] - b[0]) < tolerance && Math.abs(a[1] - b[1]) < tolerance;
}
