/**
 * Standalone functions for Drawing operations.
 * Wraps Drawing class methods as pure functions.
 */

import type { Point2D } from '../2d/lib/definitions.js';
import type { Drawing } from './draw.js';
import type { CornerFinder } from '../query/cornerFinder.js';
import type { PointInput } from '../core/types.js';
import type { Plane, PlaneName } from '../core/planeTypes.js';

/** Sketch a drawing on a plane, returning a Sketch or Sketches. */
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

/** Fuse two drawings. Returns a new Drawing. */
export function drawingFuse(a: Drawing, b: Drawing): Drawing {
  return a.fuse(b);
}

/** Cut one drawing from another. Returns a new Drawing. */
export function drawingCut(a: Drawing, b: Drawing): Drawing {
  return a.cut(b);
}

/** Intersect two drawings. Returns a new Drawing. */
export function drawingIntersect(a: Drawing, b: Drawing): Drawing {
  return a.intersect(b);
}

/** Fillet corners of a drawing. Returns a new Drawing. */
export function drawingFillet(
  drawing: Drawing,
  radius: number,
  filter?: (c: CornerFinder) => CornerFinder
): Drawing {
  return drawing.fillet(radius, filter);
}

/** Chamfer corners of a drawing. Returns a new Drawing. */
export function drawingChamfer(
  drawing: Drawing,
  radius: number,
  filter?: (c: CornerFinder) => CornerFinder
): Drawing {
  return drawing.chamfer(radius, filter);
}

/** Translate a drawing. Returns a new Drawing. */
export function translateDrawing(drawing: Drawing, dx: number, dy: number): Drawing;
export function translateDrawing(drawing: Drawing, vector: Point2D): Drawing;
export function translateDrawing(drawing: Drawing, dxOrVec: number | Point2D, dy = 0): Drawing {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- overloaded translate signature
  return drawing.translate(dxOrVec as any, dy);
}

/** Rotate a drawing. Returns a new Drawing. */
export function rotateDrawing(drawing: Drawing, angle: number, center?: Point2D): Drawing {
  return drawing.rotate(angle, center);
}

/** Scale a drawing. Returns a new Drawing. */
export function scaleDrawing(drawing: Drawing, factor: number, center?: Point2D): Drawing {
  return drawing.scale(factor, center);
}

/** Mirror a drawing. Returns a new Drawing. */
export function mirrorDrawing(
  drawing: Drawing,
  centerOrDirection: Point2D,
  origin?: Point2D,
  mode?: 'center' | 'plane'
): Drawing {
  return drawing.mirror(centerOrDirection, origin, mode);
}
