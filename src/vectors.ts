/**
 * brepjs/vectors — Vec3/Vec2 math, plane geometry, and angle constants.
 * Focused sub-path for spatial math without pulling in Result, errors, or shapes.
 */

export type { Vec3, Vec2, PointInput, Direction as DirectionInput } from './core/types.js';
export { toVec3, toVec2, resolveDirection } from './core/types.js';

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
} from './core/vecOps.js';

export type { Plane as FnPlane, PlaneName as FnPlaneName, PlaneInput } from './core/planeTypes.js';

export {
  createPlane,
  createNamedPlane,
  resolvePlane,
  translatePlane,
  pivotPlane,
} from './core/planeOps.js';

export { DEG2RAD, RAD2DEG } from './core/constants.js';
