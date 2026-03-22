/**
 * brepjs/2d — 2D geometry: blueprints, curves, and boolean operations.
 *
 * @example
 * ```typescript
 * import { createBlueprint, fuse2D, Blueprint } from 'brepjs/2d';
 *
 * // Clean 2D API (recommended)
 * const translated = translate2D(bp, 10, 20);
 * const union = fuse2D(bp1, bp2);
 * ```
 */

// ── Blueprint classes ──

export { default as Blueprint } from './2d/blueprints/blueprint.js';
export { default as CompoundBlueprint } from './2d/blueprints/compoundBlueprint.js';
export { default as Blueprints } from './2d/blueprints/blueprints.js';

// ── Blueprint functions ──

export {
  createBlueprint,
  // Clean 2D aliases (recommended)
  getBounds2D,
  getOrientation2D,
  isInside2D,
  toSVGPathD,
  translate2D,
  rotate2D,
  scale2D,
  mirror2D,
  stretch2D,
  sketchOnPlane2D,
  sketchOnFace2D,
} from './2d/blueprints/blueprintFns.js';

// ── 2D booleans ──

export {
  fuseBlueprints,
  cutBlueprints,
  intersectBlueprints,
} from './2d/blueprints/booleanOperations.js';

export { fuse2D, cut2D, intersect2D, type Shape2D } from './2d/blueprints/boolean2D.js';

// ── 2D curves ──

export {
  reverseCurve,
  curve2dBoundingBox,
  curve2dFirstPoint,
  curve2dLastPoint,
  curve2dSplitAt,
  curve2dParameter,
  curve2dTangentAt,
  curve2dIsOnCurve,
  curve2dDistanceFrom,
} from './2d/lib/curve2dFns.js';

// ── 2D curve geometry (functional API) ──

export {
  line2d,
  circle2d,
  arc2d,
  arc2dTangent,
  ellipse2d,
  ellipseArc2d,
  bezier2d,
  bspline2d,
  translateCurve2d,
  rotateCurve2d,
  scaleCurve2d,
  mirrorCurve2d,
  mirrorCurve2dAcrossAxis,
  offsetCurve2d,
  evaluateCurve2d,
  tangentCurve2d,
  boundsCurve2d,
  typeCurve2d,
  intersectCurves2d,
  projectPointOnCurve2d,
  distanceBetweenCurves2d,
  liftCurve2dToPlane,
  extractCurve2dFromEdge,
  type Ellipse2dOptions,
  type BSpline2dOptions,
} from './2d/curve2dGeometryFns.js';

// ── Utilities ──

export { type Point2D, BoundingBox2d, Curve2D } from './2d/lib/index.js';
export { type Curve2DHandle, createCurve2DHandle } from './core/curve2dHandle.js';
export { organiseBlueprints } from './2d/blueprints/lib.js';
export { polysidesBlueprint, roundedRectangleBlueprint } from './2d/blueprints/cannedBlueprints.js';
export type { ScaleMode } from './2d/curves.js';
