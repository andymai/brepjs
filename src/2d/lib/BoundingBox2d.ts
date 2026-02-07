import { gcWithScope, registerForCleanup, unregisterFromCleanup } from '../../core/disposal.js';
import { getKernel } from '../../kernel/index.js';
import type { OcType } from '../../kernel/types.js';

import type { Point2D } from './definitions.js';
import { reprPnt } from './utils.js';
import { pnt } from './ocWrapper.js';

/**
 * Axis-aligned 2D bounding box backed by an OCCT `Bnd_Box2d`.
 *
 * Provides bounds queries, containment tests, and union operations for
 * spatial indexing of 2D geometry.
 */
export class BoundingBox2d {
  private readonly _wrapped: OcType;
  private _deleted = false;

  constructor(wrapped?: OcType) {
    const oc = getKernel().oc;
    this._wrapped = wrapped ?? new oc.Bnd_Box2d();
    registerForCleanup(this, this._wrapped);
  }

  get wrapped(): OcType {
    if (this._deleted) throw new Error('This object has been deleted');
    return this._wrapped;
  }

  delete(): void {
    if (!this._deleted) {
      this._deleted = true;
      unregisterFromCleanup(this._wrapped);
      this._wrapped.delete();
    }
  }

  /** Return a human-readable string of the form `(xMin,yMin) - (xMax,yMax)`. */
  get repr(): string {
    const [min, max] = this.bounds;
    return `${reprPnt(min)} - ${reprPnt(max)}`;
  }

  /** Return the `[min, max]` corner points of the bounding box. */
  get bounds(): [Point2D, Point2D] {
    const xMin = { current: 0 };
    const yMin = { current: 0 };
    const xMax = { current: 0 };
    const yMax = { current: 0 };

    this.wrapped.Get(xMin, yMin, xMax, yMax);
    return [
      [xMin.current, yMin.current],
      [xMax.current, yMax.current],
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
    this.wrapped.Add_1(other.wrapped);
  }

  /** Test whether this bounding box and `other` are completely disjoint. */
  isOut(other: BoundingBox2d): boolean {
    return this.wrapped.IsOut_4(other.wrapped);
  }

  /** Test whether the given point lies inside (or on the boundary of) this box. */
  containsPoint(other: Point2D): boolean {
    const r = gcWithScope();
    const point = r(pnt(other));
    return !this.wrapped.IsOut_1(point);
  }
}
