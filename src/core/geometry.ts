/**
 * Core geometry — functional API.
 *
 * Primary exports are Vec3 tuples and pure functions.
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

export type { PlaneName } from './planeTypes.js';
