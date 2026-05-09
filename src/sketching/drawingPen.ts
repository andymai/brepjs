import type { Curve2D, Point2D } from '@/2d/lib/index.js';
import { Blueprint } from '@/2d/blueprints/index.js';
import { BaseSketcher2d } from '@/2d/blueprints/baseSketcher2d.js';
import type { GenericSketcher } from '@/2d/blueprints/genericSketcher.js';
import { Drawing } from './drawing.js';

/**
 * DrawingPen is a helper class to draw in 2D. It is used to create drawings
 * by exposing a builder interface. It is not a drawing itself, but it can be
 * used to create a drawing.
 *
 * @category Drawing
 */
export class DrawingPen extends BaseSketcher2d implements GenericSketcher<Drawing> {
  constructor(origin: Point2D = [0, 0]) {
    super();
    this.pointer = origin;
    this.firstPoint = origin;

    this.pendingCurves = [];
  }

  /** Finish drawing and return the resulting {@link Drawing} (does not close the path). */
  done(): Drawing {
    return new Drawing(new Blueprint(this.pendingCurves));
  }

  /** Close the path with a straight line to the start point and return the Drawing. */
  close(): Drawing {
    this._closeSketch();
    return this.done();
  }

  /** Close the path by mirroring all curves about the line from first to last point. */
  closeWithMirror(): Drawing {
    this._closeWithMirror();
    return this.close();
  }

  /**
   * Close the path and apply a custom corner treatment between the last and first segments.
   *
   * @param radius - Fillet/chamfer radius.
   * @param mode - Corner treatment type.
   * @returns The closed {@link Drawing}.
   */
  closeWithCustomCorner(
    radius: number | ((f: Curve2D, s: Curve2D) => Curve2D[]),
    mode: 'fillet' | 'chamfer' | 'dogbone' = 'fillet'
  ): Drawing {
    this._closeSketch();
    this._customCornerLastWithFirst(radius, mode);

    return this.done();
  }
}

/**
 * Creates a drawing pen to programatically draw in 2D.
 *
 * @category Drawing
 */
export function draw(initialPoint?: Point2D): DrawingPen {
  const pen = new DrawingPen();
  if (initialPoint) {
    pen.movePointerTo(initialPoint);
  }
  return pen;
}
