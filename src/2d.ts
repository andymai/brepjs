/**
 * brepjs/2d — 2D geometry: blueprints, curves, and boolean operations.
 *
 * @example
 * ```typescript
 * import { createBlueprint, fuseBlueprint2D, Blueprint } from 'brepjs/2d';
 * ```
 */

// ── Blueprint classes ──

export { default as Blueprint } from './2d/blueprints/Blueprint.js';
export { default as CompoundBlueprint } from './2d/blueprints/CompoundBlueprint.js';
export { default as Blueprints } from './2d/blueprints/Blueprints.js';

// ── Blueprint functions ──

export {
  createBlueprint,
  blueprintBoundingBox,
  blueprintOrientation,
  translateBlueprint,
  rotateBlueprint,
  scaleBlueprint,
  mirrorBlueprint,
  stretchBlueprint,
  blueprintToSVGPathD,
  blueprintIsInside,
  sketchBlueprintOnPlane,
  sketchBlueprintOnFace,
} from './2d/blueprints/blueprintFns.js';

// ── 2D booleans ──

export {
  fuseBlueprint2D,
  cutBlueprint2D,
  intersectBlueprint2D,
} from './2d/blueprints/boolean2dFns.js';

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

// ── Utilities ──

export { type Point2D, BoundingBox2d, Curve2D, axis2d } from './2d/lib/index.js';
export { organiseBlueprints } from './2d/blueprints/lib.js';
export { polysidesBlueprint, roundedRectangleBlueprint } from './2d/blueprints/cannedBlueprints.js';
export type { ScaleMode } from './2d/curves.js';
