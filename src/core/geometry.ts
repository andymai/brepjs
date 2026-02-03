/**
 * Core geometry — functional API.
 *
 * Primary exports are Vec3 tuples and pure functions.
 * Legacy class exports have been removed. Use:
 * - Vec3 tuples with vecOps functions instead of Vector class
 * - Plane interface from planeTypes.ts with planeOps functions instead of Plane class
 * - getBounds() from shapeFns.ts instead of BoundingBox class
 * - standalone transform functions from geometryHelpers.ts instead of Transformation class
 */

// ── Functional API re-exports ──

export { toVec3, toVec2, resolveDirection } from './types.js';
export type { Vec3, Vec2 } from './types.js';

export {
  vecAdd,
  vecSub,
  vecScale,
  vecNegate,
  vecDot,
  vecCross,
  vecLength,
  vecLengthSq,
  vecDistance,
  vecNormalize,
  vecEquals,
  vecIsZero,
  vecAngle,
  vecProjectToPlane,
  vecRotate,
  vecRepr,
  vec2Add,
  vec2Sub,
  vec2Scale,
  vec2Length,
  vec2Distance,
  vec2Normalize,
  vec2Equals,
} from './vecOps.js';

export {
  toOcVec,
  toOcPnt as toOcPntVec3,
  toOcDir as toOcDirVec3,
  fromOcVec,
  fromOcPnt,
  fromOcDir,
  withOcVec,
  withOcPnt,
  withOcDir,
  makeOcAx1 as makeOcAx1Vec3,
  makeOcAx2 as makeOcAx2Vec3,
  makeOcAx3 as makeOcAx3Vec3,
} from './occtBoundary.js';

// Re-export plane types for backward compatibility
export type { PlaneName } from './planeTypes.js';

// ---------------------------------------------------------------------------
// Legacy Point type (kept for backward compatibility)
// ---------------------------------------------------------------------------

export type SimplePoint = [number, number, number];

/**
 * Legacy Point type for backward compatibility.
 * Prefer using PointInput or Vec3 from types.ts.
 */
export type Point =
  | SimplePoint
  | [number, number]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT point-like objects
  | { XYZ: () => any; delete: () => void };

export function isPoint(p: unknown): p is Point {
  if (Array.isArray(p)) return p.length === 3 || p.length === 2;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT duck typing
  else if (p && typeof (p as any)?.XYZ === 'function') return true;
  return false;
}

// ---------------------------------------------------------------------------
// Direction helpers
// ---------------------------------------------------------------------------

type Direction = Point | 'X' | 'Y' | 'Z';

const DIRECTIONS: Record<string, Point> = {
  X: [1, 0, 0],
  Y: [0, 1, 0],
  Z: [0, 0, 1],
};

export function makeDirection(p: Direction): Point {
  if (p === 'X' || p === 'Y' || p === 'Z') {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return DIRECTIONS[p]!;
  }
  return p;
}
