/**
 * brepjs/core — Core types, vectors, results, and plane operations.
 * Lightweight subpath export with no OCCT dependency.
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

export {
  ok,
  err,
  OK,
  isOk,
  isErr,
  map,
  mapErr,
  andThen,
  flatMap,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  unwrapErr,
  match,
  collect,
  tryCatch,
  tryCatchAsync,
  type Result,
  type Ok,
  type Err,
  type Unit,
} from './core/result.js';

export {
  type BrepError,
  type BrepErrorKind,
  occtError,
  validationError,
  typeCastError,
  sketcherStateError,
  moduleInitError,
  computationError,
  ioError,
  queryError,
  bug,
  BrepBugError,
} from './core/errors.js';

export { DEG2RAD, RAD2DEG, HASH_CODE_MAX } from './core/constants.js';

export type { Plane as FnPlane, PlaneName as FnPlaneName, PlaneInput } from './core/planeTypes.js';

export {
  createPlane,
  createNamedPlane,
  resolvePlane,
  translatePlane,
  pivotPlane,
} from './core/planeOps.js';

export type {
  ShapeKind,
  Vertex,
  Edge,
  Wire,
  Face,
  Shell,
  Solid,
  CompSolid,
  Compound,
  AnyShape,
  Shape1D,
  Shape3D,
} from './core/shapeTypes.js';

export {
  castShape,
  getShapeKind,
  isVertex,
  isEdge,
  isWire,
  isFace,
  isShell,
  isSolid,
  isCompound,
  isShape3D,
  isShape1D,
} from './core/shapeTypes.js';

export type { ShapeHandle, OcHandle } from './core/disposal.js';
export { createHandle, createOcHandle, DisposalScope, withScope } from './core/disposal.js';
