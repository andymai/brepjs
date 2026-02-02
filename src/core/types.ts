/**
 * Core type definitions for brepjs.
 * Vec3 tuples replace the old Vector class.
 * All operations on vectors are pure functions in vecOps.ts.
 */

/** 3D vector/point as a readonly tuple */
export type Vec3 = readonly [number, number, number];

/** 2D point as a readonly tuple */
export type Vec2 = readonly [number, number];

/**
 * Flexible point input — accepts various formats for convenience.
 * Use `toVec3()` to normalize to Vec3.
 */
export type PointInput =
  | Vec3
  | Vec2
  | readonly [number, number, number]
  | readonly [number, number];

/** Normalize any point input to Vec3 */
export function toVec3(p: PointInput): Vec3 {
  if (p.length === 2) return [p[0], p[1], 0];
  return [p[0], p[1], p[2]];
}

/** Normalize to Vec2 (drops z) */
export function toVec2(p: PointInput): Vec2 {
  return [p[0], p[1]];
}

/** Direction shorthand — named axis or explicit vector */
export type Direction = Vec3 | 'X' | 'Y' | 'Z';

const DIRECTIONS: Record<string, Vec3> = {
  X: [1, 0, 0],
  Y: [0, 1, 0],
  Z: [0, 0, 1],
};

/** Resolve a direction shorthand to a Vec3 */
export function resolveDirection(d: Direction): Vec3 {
  if (typeof d === 'string') {
    const dir = DIRECTIONS[d];
    if (!dir) throw new Error(`Unknown direction: ${d}`);
    return dir;
  }
  return d;
}
