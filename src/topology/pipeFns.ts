/**
 * Fluent pipe() builder — chain shape operations in a readable pipeline.
 *
 * Usage:
 *   const result = pipe(box)
 *     .translate([10, 0, 0])
 *     .fuse(cylinder)
 *     .rotate(45, [0, 0, 0], [0, 0, 1])
 *     .done();
 */

import type { Vec3 } from '../core/types.js';
import type { AnyShape, Shape3D } from '../core/shapeTypes.js';
import { isShape3D } from '../core/shapeTypes.js';
import { translateShape, rotateShape, mirrorShape, scaleShape } from './shapeFns.js';
import { fuseShapes, cutShape, intersectShapes, type BooleanOptions } from './booleanFns.js';
import { unwrap } from '../core/result.js';

// ---------------------------------------------------------------------------
// Pipe interface
// ---------------------------------------------------------------------------

export interface ShapePipe<T extends AnyShape> {
  /** Get the current shape. */
  readonly done: () => T;

  /** Translate the shape by a vector. */
  readonly translate: (v: Vec3) => ShapePipe<T>;

  /** Rotate the shape by an angle (degrees) around an axis. */
  readonly rotate: (angle: number, position?: Vec3, direction?: Vec3) => ShapePipe<T>;

  /** Mirror the shape across a plane. */
  readonly mirror: (planeNormal?: Vec3, planeOrigin?: Vec3) => ShapePipe<T>;

  /** Scale the shape by a factor. */
  readonly scale: (factor: number, center?: Vec3) => ShapePipe<T>;

  /** Apply a custom transformation function. */
  readonly apply: <U extends AnyShape>(fn: (shape: T) => U) => ShapePipe<U>;

  /** Fuse with another shape (requires Shape3D). */
  readonly fuse: (tool: Shape3D, options?: BooleanOptions) => ShapePipe<Shape3D>;

  /** Cut with another shape (requires Shape3D). */
  readonly cut: (tool: Shape3D, options?: BooleanOptions) => ShapePipe<Shape3D>;

  /** Intersect with another shape (requires Shape3D). */
  readonly intersect: (tool: AnyShape) => ShapePipe<Shape3D>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function createPipe<T extends AnyShape>(shape: T): ShapePipe<T> {
  return {
    done: () => shape,

    translate: (v) => createPipe(translateShape(shape, v)),

    rotate: (angle, position, direction) =>
      createPipe(rotateShape(shape, angle, position, direction)),

    mirror: (planeNormal, planeOrigin) => createPipe(mirrorShape(shape, planeNormal, planeOrigin)),

    scale: (factor, center) => createPipe(scaleShape(shape, factor, center)),

    apply: (fn) => createPipe(fn(shape)),

    fuse: (tool, options) => {
      if (!isShape3D(shape)) throw new Error('pipe.fuse() requires a 3D shape');
      return createPipe(unwrap(fuseShapes(shape, tool, options)));
    },

    cut: (tool, options) => {
      if (!isShape3D(shape)) throw new Error('pipe.cut() requires a 3D shape');
      return createPipe(unwrap(cutShape(shape, tool, options)));
    },

    intersect: (tool) => {
      if (!isShape3D(shape)) throw new Error('pipe.intersect() requires a 3D shape');
      return createPipe(unwrap(intersectShapes(shape, tool)));
    },
  };
}

/** Create a fluent pipe for chaining shape operations. */
export function pipe<T extends AnyShape>(shape: T): ShapePipe<T> {
  return createPipe(shape);
}
