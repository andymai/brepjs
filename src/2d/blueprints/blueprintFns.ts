/**
 * Standalone functions for Blueprint operations.
 * Wraps Blueprint class methods as pure functions.
 */

import type { Point2D, BoundingBox2d } from '../lib/index.js';
import BlueprintClass from './Blueprint.js';
import type Blueprint from './Blueprint.js';
import type { PointInput } from '../../core/types.js';
import type { Plane, PlaneName } from '../../core/planeTypes.js';
import type { Face } from '../../topology/shapes.js';
import type { ScaleMode } from '../curves.js';

/** Create a new Blueprint from curves. */
export function createBlueprint(curves: Blueprint['curves']): Blueprint {
  return new BlueprintClass(curves);
}

/** Get the bounding box of a blueprint. */
export function blueprintBoundingBox(bp: Blueprint): BoundingBox2d {
  return bp.boundingBox;
}

/** Get the orientation (winding direction) of a blueprint. */
export function blueprintOrientation(bp: Blueprint): 'clockwise' | 'counterClockwise' {
  return bp.orientation;
}

/** Translate a blueprint by (dx, dy). Returns a new Blueprint. */
export function translateBlueprint(bp: Blueprint, dx: number, dy: number): Blueprint {
  return bp.translate(dx, dy);
}

/** Rotate a blueprint by angle degrees around an optional center. Returns a new Blueprint. */
export function rotateBlueprint(bp: Blueprint, angle: number, center?: Point2D): Blueprint {
  return bp.rotate(angle, center);
}

/** Scale a blueprint by a factor around an optional center. Returns a new Blueprint. */
export function scaleBlueprint(bp: Blueprint, factor: number, center?: Point2D): Blueprint {
  return bp.scale(factor, center);
}

/** Mirror a blueprint. Returns a new Blueprint. */
export function mirrorBlueprint(
  bp: Blueprint,
  centerOrDirection: Point2D,
  origin?: Point2D,
  mode?: 'center' | 'plane'
): Blueprint {
  return bp.mirror(centerOrDirection, origin, mode);
}

/** Stretch a blueprint. Returns a new Blueprint. */
export function stretchBlueprint(
  bp: Blueprint,
  ratio: number,
  direction: Point2D,
  origin?: Point2D
): Blueprint {
  return bp.stretch(ratio, direction, origin);
}

/** Convert a blueprint to an SVG path data string. */
export function blueprintToSVGPathD(bp: Blueprint): string {
  return bp.toSVGPathD();
}

/** Check if a 2D point is inside the blueprint. */
export function blueprintIsInside(bp: Blueprint, point: Point2D): boolean {
  return bp.isInside(point);
}

/** Sketch a blueprint on a plane. */

export function sketchBlueprintOnPlane(
  bp: Blueprint,
  inputPlane?: PlaneName | Plane,
  origin?: PointInput | number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sketch type not yet ported
): any {
  return bp.sketchOnPlane(inputPlane, origin);
}

/** Sketch a blueprint on a face. */
export function sketchBlueprintOnFace(
  bp: Blueprint,
  face: Face,
  scaleMode?: ScaleMode

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sketch types not yet ported
): any {
  return bp.sketchOnFace(face, scaleMode);
}
