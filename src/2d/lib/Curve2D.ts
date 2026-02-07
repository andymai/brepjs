import type { OcType } from '../../kernel/types.js';

import type { CurveType } from '../../core/definitionMaps.js';
import { findCurveType } from '../../core/definitionMaps.js';
import { type Result, ok, err, unwrap } from '../../core/result.js';
import { computationError } from '../../core/errors.js';
import precisionRound from '../../utils/precisionRound.js';
import { getKernel } from '../../kernel/index.js';
import {
  gcWithScope,
  localGC,
  registerForCleanup,
  unregisterFromCleanup,
} from '../../core/disposal.js';
import zip from '../../utils/zip.js';

import { BoundingBox2d } from './BoundingBox2d.js';
import type { Point2D } from './definitions.js';
import { isPoint2D } from './definitions.js';
import { pnt } from './ocWrapper.js';
import { reprPnt } from './utils.js';
import { distance2d, samePoint } from './vectorOperations.js';

/**
 * Deserialize a curve from a string produced by {@link Curve2D.serialize}.
 *
 * @returns A new `Curve2D` restored from the serialized data.
 */
export function deserializeCurve2D(data: string): Curve2D {
  const oc = getKernel().oc;
  const handle = oc.GeomToolsWrapper.Read(data);
  return new Curve2D(handle);
}

/**
 * Handle-wrapped 2D parametric curve backed by an OCCT `Geom2d_Curve`.
 *
 * Provides evaluation, splitting, projection, tangent queries, and distance
 * computations on a single parametric curve.
 */
export class Curve2D {
  private readonly _wrapped: OcType;
  private _deleted = false;
  _boundingBox: null | BoundingBox2d;
  private _firstPoint: Point2D | null = null;
  private _lastPoint: Point2D | null = null;

  constructor(handle: OcType) {
    const oc = getKernel().oc;
    const inner = handle.get();
    this._wrapped = new oc.Handle_Geom2d_Curve_2(inner);
    this._boundingBox = null;
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

  /** Compute (and cache) the 2D bounding box of this curve. */
  get boundingBox() {
    if (this._boundingBox) return this._boundingBox;
    const oc = getKernel().oc;
    const boundBox = new oc.Bnd_Box2d();

    oc.BndLib_Add2dCurve.Add_3(this.wrapped, 1e-6, boundBox);

    this._boundingBox = new BoundingBox2d(boundBox);
    return this._boundingBox;
  }

  /** Return a human-readable representation, e.g. `LINE (0,0) - (1,1)`. */
  get repr() {
    return `${this.geomType} ${reprPnt(this.firstPoint)} - ${reprPnt(this.lastPoint)}`;
  }

  /** Access the underlying OCCT `Geom2d_Curve` (unwrapped from its handle). */
  get innerCurve(): OcType {
    return this.wrapped.get();
  }

  /** Serialize this curve to a string that can be restored with {@link deserializeCurve2D}. */
  serialize(): string {
    const oc = getKernel().oc;
    return oc.GeomToolsWrapper.Write(this.wrapped);
  }

  /** Evaluate the curve at the given parameter, returning the 2D point. */
  value(parameter: number): Point2D {
    const p = this.innerCurve.Value(parameter);
    const v: Point2D = [p.X(), p.Y()];
    p.delete();
    return v;
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
    return this.innerCurve.FirstParameter();
  }

  /** Return the parameter value at the end of the curve. */
  get lastParameter(): number {
    return this.innerCurve.LastParameter();
  }

  /** Create a `Geom2dAdaptor_Curve` for algorithmic queries (caller must delete). */
  adaptor(): OcType {
    const oc = getKernel().oc;
    return new oc.Geom2dAdaptor_Curve_2(this.wrapped);
  }

  /** Return the geometric type of this curve (e.g. `LINE`, `CIRCLE`, `BSPLINE_CURVE`). */
  get geomType(): CurveType {
    const adaptor = this.adaptor();
    const curveType = unwrap(findCurveType(adaptor.GetType()));
    adaptor.delete();
    return curveType;
  }

  /** Create an independent deep copy of this curve. */
  clone(): Curve2D {
    const cloned = new Curve2D(this.innerCurve.Copy());
    // Copy cached endpoint values to avoid redundant recalculation
    cloned._firstPoint = this._firstPoint;
    cloned._lastPoint = this._lastPoint;
    return cloned;
  }

  /** Reverse the orientation of this curve in place. */
  reverse(): void {
    this.innerCurve.Reverse();
    // Swap cached points (first becomes last, last becomes first)
    const tmp = this._firstPoint;
    this._firstPoint = this._lastPoint;
    this._lastPoint = tmp;
  }

  private distanceFromPoint(point: Point2D): number {
    const oc = getKernel().oc;
    const r = gcWithScope();

    const projector = r(new oc.Geom2dAPI_ProjectPointOnCurve_2(r(pnt(point)), this.wrapped));

    let curveToPoint = Infinity;

    try {
      curveToPoint = projector.LowerDistance();
    } catch {
      curveToPoint = Infinity;
    }

    return Math.min(
      curveToPoint,
      distance2d(point, this.firstPoint),
      distance2d(point, this.lastPoint)
    );
  }

  private distanceFromCurve(curve: Curve2D): number {
    const oc = getKernel().oc;
    const r = gcWithScope();

    let curveDistance = Infinity;
    const projector = r(
      new oc.Geom2dAPI_ExtremaCurveCurve(
        this.wrapped,
        curve.wrapped,
        this.firstParameter,
        this.lastParameter,
        curve.firstParameter,
        curve.lastParameter
      )
    );

    try {
      curveDistance = projector.LowerDistance();
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
    const oc = getKernel().oc;
    const r = gcWithScope();

    let lowerDistance;
    let lowerDistanceParameter;
    try {
      const projector = r(new oc.Geom2dAPI_ProjectPointOnCurve_2(r(pnt(point)), this.wrapped));
      lowerDistance = projector.LowerDistance();
      lowerDistanceParameter = projector.LowerDistanceParameter();
    } catch {
      // Perhaps it failed because it is on an extremity
      if (samePoint(point, this.firstPoint, precision)) return ok(this.firstParameter);
      if (samePoint(point, this.lastPoint, precision)) return ok(this.lastParameter);

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
    const oc = getKernel().oc;
    const [r, gc] = localGC();

    let param;

    if (Array.isArray(index)) {
      param = unwrap(this.parameter(index));
    } else {
      const paramLength = this.innerCurve.LastParameter() - this.innerCurve.FirstParameter();
      param = paramLength * index + Number(this.innerCurve.FirstParameter());
    }

    const point = r(new oc.gp_Pnt2d_1());
    const dir = r(new oc.gp_Vec2d_1());

    this.innerCurve.D1(param, point, dir);

    const tgtVec = [dir.X(), dir.Y()] as Point2D;
    gc();

    return tgtVec;
  }

  /**
   * Split this curve at the given points or parameter values.
   *
   * @returns An array of sub-curves whose union covers the original curve.
   */
  splitAt(points: Point2D[] | number[], precision = 1e-9): Curve2D[] {
    const oc = getKernel().oc;
    const r = gcWithScope();

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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (Math.abs(parameters[0]! - firstParam) < precision * 100) parameters = parameters.slice(1);
    if (!parameters.length) return [this];

    if (
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      Math.abs(parameters[parameters.length - 1]! - lastParam) <
      precision * 100
    )
      parameters = parameters.slice(0, -1);
    if (!parameters.length) return [this];

    return zip([
      [firstParam, ...parameters],
      [...parameters, lastParam],
    ]).map(([first, last]) => {
      try {
        if (this.geomType === 'BEZIER_CURVE') {
          const curveCopy = new oc.Geom2d_BezierCurve_1(r(this.adaptor()).Bezier().get().Poles_2());
          curveCopy.Segment(first, last);
          return new Curve2D(new oc.Handle_Geom2d_Curve_2(curveCopy));
        }
        if (this.geomType === 'BSPLINE_CURVE') {
          const adapted = r(this.adaptor()).BSpline().get();

          const curveCopy = new oc.Geom2d_BSplineCurve_1(
            adapted.Poles_2(),
            adapted.Knots_2(),
            adapted.Multiplicities_2(),
            adapted.Degree(),
            adapted.IsPeriodic()
          );
          curveCopy.Segment(first, last, precision);
          return new Curve2D(new oc.Handle_Geom2d_Curve_2(curveCopy));
        }

        const trimmed = new oc.Geom2d_TrimmedCurve(this.wrapped, first, last, true, true);
        return new Curve2D(new oc.Handle_Geom2d_Curve_2(trimmed));
      } catch (e) {
        throw new Error(`Failed to split the curve: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }
}
