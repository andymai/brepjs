import type { KernelType } from '@/kernel/types.js';

import type { CurveType } from '@/core/typeDiscriminants.js';
import { type Result, ok, err, unwrap } from '@/core/result.js';
import { computationError } from '@/core/errors.js';
import precisionRound from '@/utils/precisionRound.js';
import { getKernel } from '@/kernel/index.js';
import { registerForCleanup, unregisterFromCleanup } from '@/core/disposal.js';

import { BoundingBox2d } from './boundingBox2d.js';
import type { Point2D } from './definitions.js';
import { isPoint2D } from './definitions.js';
// pnt import removed — projection/distance now use kernel methods
import { reprPnt } from './utils.js';
import { distance2d, samePoint } from './vectorOperations.js';

/**
 * Deserialize a curve from a string produced by {@link Curve2D.serialize}.
 *
 * @returns A new `Curve2D` restored from the serialized data.
 */
export function deserializeCurve2D(data: string): Curve2D {
  return new Curve2D(getKernel().deserializeCurve2d(data));
}

/**
 * Handle-wrapped 2D parametric curve backed by an kernel `kernel 2D curve`.
 *
 * Provides evaluation, splitting, projection, tangent queries, and distance
 * computations on a single parametric curve.
 */
export class Curve2D {
  private readonly _wrapped: KernelType;
  private _deleted = false;
  _boundingBox: null | BoundingBox2d;
  private _firstPoint: Point2D | null = null;
  private _lastPoint: Point2D | null = null;

  constructor(handle: KernelType) {
    this._wrapped = getKernel().wrapCurve2dHandle(handle);
    this._boundingBox = null;
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

  /** Compute (and cache) the 2D bounding box of this curve. */
  get boundingBox() {
    if (this._boundingBox) return this._boundingBox;
    const kernel = getKernel();
    const boundBox = kernel.createBoundingBox2d();
    kernel.addCurveToBBox2d(boundBox, this.wrapped, 1e-6);
    this._boundingBox = new BoundingBox2d(boundBox);
    return this._boundingBox;
  }

  /** Return a human-readable representation, e.g. `LINE (0,0) - (1,1)`. */
  get repr() {
    return `${this.geomType} ${reprPnt(this.firstPoint)} - ${reprPnt(this.lastPoint)}`;
  }

  /** Serialize this curve to a string that can be restored with {@link deserializeCurve2D}. */
  serialize(): string {
    return getKernel().serializeCurve2d(this.wrapped);
  }

  /** Evaluate the curve at the given parameter, returning the 2D point. */
  value(parameter: number): Point2D {
    return getKernel().evaluateCurve2d(this.wrapped, parameter);
  }

  /** Return the point at the start of the curve (cached after first access). */
  get firstPoint(): Point2D {
    if (this._firstPoint === null) {
      this._firstPoint = this.value(this.firstParameter);
    }
    return this._firstPoint;
  }

  /** Return the point at the end of the curve (cached after first access). */
  get lastPoint(): Point2D {
    if (this._lastPoint === null) {
      this._lastPoint = this.value(this.lastParameter);
    }
    return this._lastPoint;
  }

  /** Return the parameter value at the start of the curve. */
  get firstParameter(): number {
    return getKernel().getCurve2dBounds(this.wrapped).first;
  }

  /** Return the parameter value at the end of the curve. */
  get lastParameter(): number {
    return getKernel().getCurve2dBounds(this.wrapped).last;
  }

  /** Return the geometric type of this curve (e.g. `LINE`, `CIRCLE`, `BSPLINE_CURVE`). */
  get geomType(): CurveType {
    return getKernel().getCurve2dType(this.wrapped) as CurveType;
  }

  /** Create an independent deep copy of this curve. */
  clone(): Curve2D {
    const cloned = new Curve2D(getKernel().copyCurve2d(this.wrapped));
    // Copy cached endpoint values to avoid redundant recalculation
    cloned._firstPoint = this._firstPoint;
    cloned._lastPoint = this._lastPoint;
    return cloned;
  }

  /** Reverse the orientation of this curve in place. */
  reverse(): void {
    getKernel().reverseCurve2d(this.wrapped);
    // Swap cached points (first becomes last, last becomes first)
    const tmp = this._firstPoint;
    this._firstPoint = this._lastPoint;
    this._lastPoint = tmp;
  }

  private distanceFromPoint(point: Point2D): number {
    const proj = getKernel().projectPointOnCurve2d(this.wrapped, point[0], point[1]);
    const curveToPoint = proj ? proj.distance : Infinity;

    return Math.min(
      curveToPoint,
      distance2d(point, this.firstPoint),
      distance2d(point, this.lastPoint)
    );
  }

  private distanceFromCurve(curve: Curve2D): number {
    let curveDistance;
    try {
      curveDistance = getKernel().distanceBetweenCurves2d(
        this.wrapped,
        curve.wrapped,
        this.firstParameter,
        this.lastParameter,
        curve.firstParameter,
        curve.lastParameter
      );
    } catch {
      curveDistance = Infinity;
    }

    // We need to take the shorter distance between the curves and the extremities
    return Math.min(
      curveDistance,
      this.distanceFromPoint(curve.firstPoint),
      this.distanceFromPoint(curve.lastPoint),
      curve.distanceFromPoint(this.firstPoint),
      curve.distanceFromPoint(this.lastPoint)
    );
  }

  /** Compute the minimum distance from this curve to a point or another curve. */
  distanceFrom(element: Curve2D | Point2D): number {
    if (isPoint2D(element)) {
      return this.distanceFromPoint(element);
    }

    return this.distanceFromCurve(element);
  }

  /** Test whether a point lies on the curve within a tight tolerance (1e-9). */
  isOnCurve(point: Point2D): boolean {
    return this.distanceFromPoint(point) < 1e-9;
  }

  /**
   * Project a point onto the curve and return its parameter value.
   *
   * @returns `Ok(parameter)` when the point is on the curve, or an error result otherwise.
   */
  parameter(point: Point2D, precision = 1e-9): Result<number> {
    let lowerDistance: number | undefined;
    let lowerDistanceParameter: number | undefined;
    let projectionFailed = false;
    try {
      const proj = getKernel().projectPointOnCurve2d(this.wrapped, point[0], point[1]);
      if (!proj) {
        projectionFailed = true;
      } else {
        lowerDistance = proj.distance;
        lowerDistanceParameter = proj.param;
      }
    } catch {
      projectionFailed = true;
    }

    if (projectionFailed) {
      // Perhaps it failed because it is on an extremity
      if (samePoint(point, this.firstPoint, precision)) return ok(this.firstParameter);
      if (samePoint(point, this.lastPoint, precision)) return ok(this.lastParameter);

      return err(computationError('PARAMETER_NOT_FOUND', 'Failed to find parameter'));
    }

    if (lowerDistance === undefined || lowerDistanceParameter === undefined) {
      return err(computationError('PARAMETER_NOT_FOUND', 'Failed to find parameter'));
    }
    if (lowerDistance > precision) {
      return err(
        computationError(
          'POINT_NOT_ON_CURVE',
          `Point ${reprPnt(point)} not on curve ${this.repr}, ${lowerDistance.toFixed(9)}`
        )
      );
    }
    return ok(lowerDistanceParameter);
  }

  /**
   * Compute the tangent vector at a parameter position or at the projection of a point.
   *
   * @param index - A normalized parameter (0..1) or a Point2D to project onto the curve.
   */
  tangentAt(index: number | Point2D): Point2D {
    let param;

    if (Array.isArray(index)) {
      param = unwrap(this.parameter(index));
    } else {
      const bounds = getKernel().getCurve2dBounds(this.wrapped);
      const paramLength = bounds.last - bounds.first;
      param = paramLength * index + bounds.first;
    }

    const result = getKernel().evaluateCurve2dD1(this.wrapped, param);
    return result.tangent;
  }

  /**
   * Split this curve at the given points or parameter values.
   *
   * @returns An array of sub-curves whose union covers the original curve.
   */
  splitAt(points: Point2D[] | number[], precision = 1e-9): Curve2D[] {
    let parameters = points.map((point: Point2D | number) => {
      if (isPoint2D(point)) return unwrap(this.parameter(point, precision));
      return point;
    });

    // We only split on each point once
    parameters = Array.from(
      new Map(parameters.map((p) => [precisionRound(p, -Math.log10(precision)), p])).values()
    ).sort((a, b) => a - b);
    const firstParam = this.firstParameter;
    const lastParam = this.lastParameter;

    if (firstParam > lastParam) {
      parameters.reverse();
    }

    // We do not split again on the start and end
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- parameters is non-empty
    if (Math.abs(parameters[0]! - firstParam) < precision * 100) parameters = parameters.slice(1);
    if (!parameters.length) return [this];

    if (
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- parameters is non-empty
      Math.abs(parameters[parameters.length - 1]! - lastParam) <
      precision * 100
    )
      parameters = parameters.slice(0, -1);
    if (!parameters.length) return [this];

    const handles = getKernel().splitCurve2d(this.wrapped, parameters);
    return handles.map((h) => new Curve2D(h));
  }
}
