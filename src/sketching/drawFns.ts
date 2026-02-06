/**
 * Standalone functions for Drawing operations.
 * Wraps Drawing class methods as pure functions.
 */

import type { Point2D } from '../2d/lib/definitions.js';
import type { Drawing } from './draw.js';
import type { CornerFinder } from '../query/cornerFinder.js';
import type { PointInput } from '../core/types.js';
import type { Plane, PlaneName } from '../core/planeTypes.js';

/**
 * Sketch a drawing onto a 3D plane, producing a Sketch or Sketches.
 *
 * @param drawing - The 2D drawing to project.
 * @param inputPlane - Named plane or Plane object.
 * @param origin - Origin offset on the plane.
 * @returns A Sketch (single profile) or Sketches (multiple profiles).
 *
 * @see {@link Drawing.sketchOnPlane} for the OOP equivalent.
 */
export function drawingToSketchOnPlane(
  drawing: Drawing,
  inputPlane?: PlaneName | Plane,
  origin?: PointInput | number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sketch types
): any {
  if (origin !== undefined) {
    return drawing.sketchOnPlane(inputPlane as PlaneName, origin);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- overloaded call
  return drawing.sketchOnPlane(inputPlane as any);
}

/**
 * Fuse two drawings with a Boolean union.
 *
 * @param a - First drawing.
 * @param b - Second drawing to merge.
 * @returns A new Drawing containing the fused shape.
 *
 * @see {@link Drawing.fuse} for the OOP equivalent.
 */
export function drawingFuse(a: Drawing, b: Drawing): Drawing {
  return a.fuse(b);
}

/**
 * Cut one drawing from another with a Boolean subtraction.
 *
 * @param a - Base drawing.
 * @param b - Drawing to subtract.
 * @returns A new Drawing with `b` removed from `a`.
 *
 * @see {@link Drawing.cut} for the OOP equivalent.
 */
export function drawingCut(a: Drawing, b: Drawing): Drawing {
  return a.cut(b);
}

/**
 * Intersect two drawings with a Boolean intersection.
 *
 * @param a - First drawing.
 * @param b - Second drawing.
 * @returns A new Drawing containing only the overlapping region.
 *
 * @see {@link Drawing.intersect} for the OOP equivalent.
 */
export function drawingIntersect(a: Drawing, b: Drawing): Drawing {
  return a.intersect(b);
}

/**
 * Fillet corners of a drawing.
 *
 * @param drawing - The drawing to modify.
 * @param radius - Fillet radius.
 * @param filter - Optional corner filter to select which corners to fillet.
 * @returns A new Drawing with filleted corners.
 *
 * @see {@link Drawing.fillet} for the OOP equivalent.
 */
export function drawingFillet(
  drawing: Drawing,
  radius: number,
  filter?: (c: CornerFinder) => CornerFinder
): Drawing {
  return drawing.fillet(radius, filter);
}

/**
 * Chamfer corners of a drawing.
 *
 * @param drawing - The drawing to modify.
 * @param radius - Chamfer distance.
 * @param filter - Optional corner filter to select which corners to chamfer.
 * @returns A new Drawing with chamfered corners.
 *
 * @see {@link Drawing.chamfer} for the OOP equivalent.
 */
export function drawingChamfer(
  drawing: Drawing,
  radius: number,
  filter?: (c: CornerFinder) => CornerFinder
): Drawing {
  return drawing.chamfer(radius, filter);
}

/**
 * Translate a drawing by horizontal and vertical distances.
 *
 * @param drawing - The drawing to translate.
 * @param dx - Horizontal distance.
 * @param dy - Vertical distance.
 * @returns A new translated Drawing.
 *
 * @see {@link Drawing.translate} for the OOP equivalent.
 */
export function translateDrawing(drawing: Drawing, dx: number, dy: number): Drawing;
/** Translate a drawing by a 2D vector. */
export function translateDrawing(drawing: Drawing, vector: Point2D): Drawing;
export function translateDrawing(drawing: Drawing, dxOrVec: number | Point2D, dy = 0): Drawing {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- overloaded translate signature
  return drawing.translate(dxOrVec as any, dy);
}

/**
 * Rotate a drawing by an angle (in degrees) around an optional center point.
 *
 * @param drawing - The drawing to rotate.
 * @param angle - Rotation angle in degrees.
 * @param center - Optional center of rotation (defaults to origin).
 * @returns A new rotated Drawing.
 *
 * @see {@link Drawing.rotate} for the OOP equivalent.
 */
export function rotateDrawing(drawing: Drawing, angle: number, center?: Point2D): Drawing {
  return drawing.rotate(angle, center);
}

/**
 * Uniformly scale a drawing by a factor around an optional center point.
 *
 * @param drawing - The drawing to scale.
 * @param factor - Scale factor.
 * @param center - Optional center of scaling (defaults to origin).
 * @returns A new scaled Drawing.
 *
 * @see {@link Drawing.scale} for the OOP equivalent.
 */
export function scaleDrawing(drawing: Drawing, factor: number, center?: Point2D): Drawing {
  return drawing.scale(factor, center);
}

/**
 * Mirror a drawing about a point or a line defined by direction and origin.
 *
 * @param drawing - The drawing to mirror.
 * @param centerOrDirection - Mirror center point or line direction.
 * @param origin - Origin point when mirroring about a line.
 * @param mode - `'center'` for point mirror, `'plane'` for line mirror.
 * @returns A new mirrored Drawing.
 *
 * @see {@link Drawing.mirror} for the OOP equivalent.
 */
export function mirrorDrawing(
  drawing: Drawing,
  centerOrDirection: Point2D,
  origin?: Point2D,
  mode?: 'center' | 'plane'
): Drawing {
  return drawing.mirror(centerOrDirection, origin, mode);
}
