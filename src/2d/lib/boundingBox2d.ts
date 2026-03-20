import { registerForCleanup, unregisterFromCleanup } from '@/core/disposal.js';
import { getKernel2D } from '@/kernel/index.js';
import type { KernelType } from '@/kernel/types.js';

import type { Point2D } from './definitions.js';
import { reprPnt } from './utils.js';

/**
 * Axis-aligned 2D bounding box backed by an kernel `Bnd_Box2d`.
 *
 * Provides bounds queries, containment tests, and union operations for
 * spatial indexing of 2D geometry.
 */
export class BoundingBox2d {
  private readonly _wrapped: KernelType;
  private _deleted = false;

  constructor(wrapped?: KernelType) {
    this._wrapped = wrapped ?? getKernel2D().createBoundingBox2d();
    registerForCleanup(this, this._wrapped);
  }

  get wrapped(): KernelType {
    if (this._deleted) throw new Error('This object has been deleted');
    return this._wrapped;
  }

  delete(): void {
    if (!this._deleted) {
      this._deleted = true;
      unregisterFromCleanup(this._wrapped);
      if (typeof this._wrapped.delete === 'function') this._wrapped.delete();
    }
  }

  [Symbol.dispose](): void {
    this.delete();
  }

  /** Return a human-readable string of the form `(xMin,yMin) - (xMax,yMax)`. */
  get repr(): string {
    const [min, max] = this.bounds;
    return `${reprPnt(min)} - ${reprPnt(max)}`;
  }

  /** Return the `[min, max]` corner points of the bounding box. */
  get bounds(): [Point2D, Point2D] {
    const { xMin, yMin, xMax, yMax } = getKernel2D().getBBox2dBounds(this.wrapped);
    return [
      [xMin, yMin],
      [xMax, yMax],
    ];
  }

  /** Return the center point of the bounding box. */
  get center(): Point2D {
    const [[xmin, ymin], [xmax, ymax]] = this.bounds;
    return [xmin + (xmax - xmin) / 2, ymin + (ymax - ymin) / 2];
  }

  /** Return the width (x-extent) of the bounding box. */
  get width(): number {
    const [[xmin], [xmax]] = this.bounds;
    return Math.abs(xmax - xmin);
  }

  /** Return the height (y-extent) of the bounding box. */
  get height(): number {
    const [[, ymin], [, ymax]] = this.bounds;
    return Math.abs(ymax - ymin);
  }

  /**
   * Return a point guaranteed to lie outside the bounding box.
   *
   * @param paddingPercent - Extra padding as a percentage of the box dimensions.
   */
  outsidePoint(paddingPercent = 1): Point2D {
    const [min, max] = this.bounds;
    const width = max[0] - min[0];
    const height = max[1] - min[1];

    return [
      max[0] + (width / 100) * paddingPercent,
      max[1] + (height / 100) * paddingPercent * 0.9,
    ];
  }

  /** Expand this bounding box to include `other`. */
  add(other: BoundingBox2d) {
    getKernel2D().mergeBBox2d(this.wrapped, other.wrapped);
  }

  /** Test whether this bounding box and `other` are completely disjoint. */
  isOut(other: BoundingBox2d): boolean {
    return getKernel2D().isBBox2dOut(this.wrapped, other.wrapped);
  }

  /** Test whether the given point lies inside (or on the boundary of) this box. */
  containsPoint(other: Point2D): boolean {
    return !getKernel2D().isBBox2dOutPoint(this.wrapped, other[0], other[1]);
  }
}
