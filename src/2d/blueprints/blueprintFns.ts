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

/**
 * Get the axis-aligned bounding box of a blueprint.
 *
 * @see {@link Blueprint.boundingBox}
 */
export function blueprintBoundingBox(bp: Blueprint): BoundingBox2d {
  return bp.boundingBox;
}

/**
 * Get the winding direction of a blueprint (`'clockwise'` or `'counterClockwise'`).
 *
 * @see {@link Blueprint.orientation}
 */
export function blueprintOrientation(bp: Blueprint): 'clockwise' | 'counterClockwise' {
  return bp.orientation;
}

/**
 * Translate a blueprint by the given x and y distances.
 *
 * @returns A new translated Blueprint.
 * @see {@link Blueprint.translate}
 */
export function translateBlueprint(bp: Blueprint, dx: number, dy: number): Blueprint {
  return bp.translate(dx, dy);
}

/**
 * Rotate a blueprint by the given angle in degrees.
 *
 * @param center - Center of rotation (defaults to the origin).
 * @returns A new rotated Blueprint.
 * @see {@link Blueprint.rotate}
 */
export function rotateBlueprint(bp: Blueprint, angle: number, center?: Point2D): Blueprint {
  return bp.rotate(angle, center);
}

/**
 * Uniformly scale a blueprint by a factor around a center point.
 *
 * @param center - Center of scaling (defaults to the bounding box center).
 * @returns A new scaled Blueprint.
 * @see {@link Blueprint.scale}
 */
export function scaleBlueprint(bp: Blueprint, factor: number, center?: Point2D): Blueprint {
  return bp.scale(factor, center);
}

/**
 * Mirror a blueprint across a point or plane.
 *
 * @param mode - `'center'` for point symmetry, `'plane'` for reflection across an axis.
 * @returns A new mirrored Blueprint.
 * @see {@link Blueprint.mirror}
 */
export function mirrorBlueprint(
  bp: Blueprint,
  centerOrDirection: Point2D,
  origin?: Point2D,
  mode?: 'center' | 'plane'
): Blueprint {
  return bp.mirror(centerOrDirection, origin, mode);
}

/**
 * Stretch a blueprint along a direction by a given ratio.
 *
 * @returns A new stretched Blueprint.
 * @see {@link Blueprint.stretch}
 */
export function stretchBlueprint(
  bp: Blueprint,
  ratio: number,
  direction: Point2D,
  origin?: Point2D
): Blueprint {
  return bp.stretch(ratio, direction, origin);
}

/**
 * Convert a blueprint to an SVG path `d` attribute string.
 *
 * @see {@link Blueprint.toSVGPathD}
 */
export function blueprintToSVGPathD(bp: Blueprint): string {
  return bp.toSVGPathD();
}

/**
 * Test whether a 2D point lies strictly inside the blueprint.
 *
 * @returns `true` if the point is inside (boundary points return `false`).
 * @see {@link Blueprint.isInside}
 */
export function blueprintIsInside(bp: Blueprint, point: Point2D): boolean {
  return bp.isInside(point);
}

/**
 * Project a blueprint onto a 3D plane, producing sketch data.
 *
 * @see {@link Blueprint.sketchOnPlane}
 */
export function sketchBlueprintOnPlane(
  bp: Blueprint,
  inputPlane?: PlaneName | Plane,
  origin?: PointInput | number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sketch type not yet ported
): any {
  return bp.sketchOnPlane(inputPlane, origin);
}

/**
 * Map a blueprint onto a 3D face's UV surface, producing sketch data.
 *
 * @see {@link Blueprint.sketchOnFace}
 */
export function sketchBlueprintOnFace(
  bp: Blueprint,
  face: Face,
  scaleMode?: ScaleMode

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sketch types not yet ported
): any {
  return bp.sketchOnFace(face, scaleMode);
}
