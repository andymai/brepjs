/**
 * Standalone functions for Blueprint operations.
 *
 * Each function wraps the corresponding {@link Blueprint} class method as a
 * pure function, enabling a functional programming style.
 *
 * @see {@link Blueprint} for the OOP equivalent.
 */

import type { Point2D, BoundingBox2d } from '../lib/index.js';
import BlueprintClass from './Blueprint.js';
import type Blueprint from './Blueprint.js';
import type { PointInput } from '../../core/types.js';
import type { Plane, PlaneName } from '../../core/planeTypes.js';
import type { Face } from '../../core/shapeTypes.js';
import type { ScaleMode } from '../curves.js';

/**
 * Create a new Blueprint from an ordered array of 2D curves.
 *
 * @see {@link Blueprint} constructor.
 */
export function createBlueprint(curves: Blueprint['curves']): Blueprint {
  return new BlueprintClass(curves);
}

// ── Utility Functions (Clean 2D API) ──

/** Get the axis-aligned bounding box of a 2D blueprint. */
export function getBounds2D(bp: Blueprint): BoundingBox2d {
  return bp.boundingBox;
}

/** Get the winding direction of a 2D blueprint. */
export function getOrientation2D(bp: Blueprint): 'clockwise' | 'counterClockwise' {
  return bp.orientation;
}

/** Test whether a 2D point lies strictly inside a blueprint. */
export function isInside2D(bp: Blueprint, point: Point2D): boolean {
  return bp.isInside(point);
}

/** Convert a 2D blueprint to an SVG path d attribute string. */
export function toSVGPathD(bp: Blueprint): string {
  return bp.toSVGPathD();
}

// ── Transform Functions (Clean 2D API) ──

/** Translate a 2D blueprint by the given x and y distances. */
export function translate2D(bp: Blueprint, dx: number, dy: number): Blueprint {
  return bp.translate(dx, dy);
}

/** Rotate a 2D blueprint by the given angle in degrees. */
export function rotate2D(bp: Blueprint, angle: number, center?: Point2D): Blueprint {
  return bp.rotate(angle, center);
}

/** Uniformly scale a 2D blueprint by a factor around a center point. */
export function scale2D(bp: Blueprint, factor: number, center?: Point2D): Blueprint {
  return bp.scale(factor, center);
}

/** Mirror a 2D blueprint across a point or plane. */
export function mirror2D(
  bp: Blueprint,
  centerOrDirection: Point2D,
  origin?: Point2D,
  mode?: 'center' | 'plane'
): Blueprint {
  return bp.mirror(centerOrDirection, origin, mode);
}

/** Stretch a 2D blueprint along a direction by a given ratio. */
export function stretch2D(
  bp: Blueprint,
  ratio: number,
  direction: Point2D,
  origin?: Point2D
): Blueprint {
  return bp.stretch(ratio, direction, origin);
}

// ── Sketching Functions (Clean 2D API) ──

/** Project a blueprint onto a 3D plane, producing sketch data. */
export function sketch2DOnPlane(
  bp: Blueprint,
  inputPlane?: PlaneName | Plane,
  origin?: PointInput | number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sketch type not yet ported
): any {
  return bp.sketchOnPlane(inputPlane, origin);
}

/** Map a blueprint onto a 3D face's UV surface, producing sketch data. */
export function sketch2DOnFace(
  bp: Blueprint,
  face: Face,
  scaleMode?: ScaleMode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sketch types not yet ported
): any {
  return bp.sketchOnFace(face, scaleMode);
}

// ── Deprecated Verbose Names (Backward Compatibility) ──

/** @deprecated Use getBounds2D instead. Will be removed in v8.0.0. */
export function blueprintBoundingBox(bp: Blueprint): BoundingBox2d {
  return getBounds2D(bp);
}

/** @deprecated Use getOrientation2D instead. Will be removed in v8.0.0. */
export function blueprintOrientation(bp: Blueprint): 'clockwise' | 'counterClockwise' {
  return getOrientation2D(bp);
}

/** @deprecated Use translate2D instead. Will be removed in v8.0.0. */
export function translateBlueprint(bp: Blueprint, dx: number, dy: number): Blueprint {
  return translate2D(bp, dx, dy);
}

/** @deprecated Use rotate2D instead. Will be removed in v8.0.0. */
export function rotateBlueprint(bp: Blueprint, angle: number, center?: Point2D): Blueprint {
  return rotate2D(bp, angle, center);
}

/** @deprecated Use scale2D instead. Will be removed in v8.0.0. */
export function scaleBlueprint(bp: Blueprint, factor: number, center?: Point2D): Blueprint {
  return scale2D(bp, factor, center);
}

/** @deprecated Use mirror2D instead. Will be removed in v8.0.0. */
export function mirrorBlueprint(
  bp: Blueprint,
  centerOrDirection: Point2D,
  origin?: Point2D,
  mode?: 'center' | 'plane'
): Blueprint {
  return mirror2D(bp, centerOrDirection, origin, mode);
}

/** @deprecated Use stretch2D instead. Will be removed in v8.0.0. */
export function stretchBlueprint(
  bp: Blueprint,
  ratio: number,
  direction: Point2D,
  origin?: Point2D
): Blueprint {
  return stretch2D(bp, ratio, direction, origin);
}

/** @deprecated Use toSVGPathD instead. Will be removed in v8.0.0. */
export function blueprintToSVGPathD(bp: Blueprint): string {
  return toSVGPathD(bp);
}

/** @deprecated Use isInside2D instead. Will be removed in v8.0.0. */
export function blueprintIsInside(bp: Blueprint, point: Point2D): boolean {
  return isInside2D(bp, point);
}

/** @deprecated Use sketch2DOnPlane instead. Will be removed in v8.0.0. */
export function sketchBlueprintOnPlane(
  bp: Blueprint,
  inputPlane?: PlaneName | Plane,
  origin?: PointInput | number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sketch type not yet ported
): any {
  return sketch2DOnPlane(bp, inputPlane, origin);
}

/** @deprecated Use sketch2DOnFace instead. Will be removed in v8.0.0. */
export function sketchBlueprintOnFace(
  bp: Blueprint,
  face: Face,
  scaleMode?: ScaleMode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sketch types not yet ported
): any {
  return sketch2DOnFace(bp, face, scaleMode);
}
