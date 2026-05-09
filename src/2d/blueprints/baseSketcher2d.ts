import { DEG2RAD, RAD2DEG } from '@/core/constants.js';
import { getKernel } from '@/kernel/index.js';
import { bug } from '@/core/errors.js';
import {
  chamferCurves,
  Curve2D,
  dogboneFilletCurves,
  filletCurves,
  normalize2d,
  polarAngle2d,
  samePoint,
  distance2d,
  polarToCartesian,
  make2dSegmentCurve,
  make2dTangentArc,
  make2dThreePointArc,
  make2dBezierCurve,
} from '@/2d/lib/index.js';
import type { Point2D } from '@/2d/lib/index.js';
import { defaultsSplineOptions } from './genericSketcher.js';
import type { SplineOptions } from './genericSketcher.js';
import { normalizeEllipseRadii, makeEllipseArcFromSvgParams } from './ellipseUtils.js';

const cornerModeFns = {
  chamfer: chamferCurves,
  dogbone: dogboneFilletCurves,
  fillet: filletCurves,
} as const;

function buildCornerFunction(
  radius: number | ((first: Curve2D, second: Curve2D) => Curve2D[]),
  mode: 'chamfer' | 'fillet' | 'dogbone'
): (first: Curve2D, second: Curve2D) => Curve2D[] {
  if (typeof radius === 'function') return radius;
  const makeFn = cornerModeFns[mode];
  return (first: Curve2D, second: Curve2D) => makeFn(first, second, radius);
}

/**
 * Base class for 2D sketchers that accumulate {@link Curve2D} segments.
 *
 * Provides the shared pen-drawing API (lines, arcs, ellipses, beziers, splines)
 * used by `FaceSketcher`, `BlueprintSketcher`, and `DrawingPen`.
 * Subclasses implement `done()` / `close()` to produce the appropriate output type.
 *
 * @category Sketching
 */
export class BaseSketcher2d {
  protected pointer: Point2D;
  protected firstPoint: Point2D;
  protected pendingCurves: Curve2D[];
  protected _nextCorner: null | ((f: Curve2D, s: Curve2D) => Curve2D[]);

  constructor(origin: Point2D = [0, 0]) {
    this.pointer = origin;
    this.firstPoint = origin;
    this._nextCorner = null;

    this.pendingCurves = [];
  }

  protected _convertToUV([x, y]: Point2D): Point2D {
    return [x, y];
  }

  protected _convertFromUV([u, v]: Point2D): Point2D {
    return [u, v];
  }

  protected _lastCurve(): Curve2D | null {
    const len = this.pendingCurves.length;
    if (len === 0) return null;
    return this.pendingCurves[len - 1] as Curve2D;
  }

  protected _requireLastCurve(caller: string, action: string): Curve2D {
    const curve = this._lastCurve();
    if (!curve) bug(caller, `You need a previous curve to ${action}`);
    return curve;
  }

  protected _resolveRelative(xDist: number, yDist: number): Point2D {
    return [this.pointer[0] + xDist, this.pointer[1] + yDist];
  }

  protected _saveCurveAndAdvance(curve: Curve2D, end: Point2D): this {
    this.saveCurve(curve);
    this.pointer = end;
    return this;
  }

  /**
   * Returns the current pen position as [x, y] coordinates
   *
   * @category Drawing State
   */
  get penPosition(): Point2D {
    return this.pointer;
  }

  /**
   * Returns the current pen angle in degrees
   *
   * @category Drawing State
   */
  get penAngle(): number {
    const lastCurve = this._lastCurve();
    if (!lastCurve) return 0;

    const [dx, dy] = lastCurve.tangentAt(1);
    return Math.atan2(dy, dx) * RAD2DEG;
  }

  /** Move the pen to an absolute 2D position before drawing any curves. */
  movePointerTo(point: Point2D): this {
    if (this.pendingCurves.length)
      bug('Sketcher2d.movePointerTo', 'You can only move the pointer if there is no curve defined');

    this.pointer = point;
    this.firstPoint = point;
    return this;
  }

  protected saveCurve(curve: Curve2D): void {
    if (!this._nextCorner) {
      this.pendingCurves.push(curve);
      return;
    }

    const previousCurve = this.pendingCurves.pop();
    if (!previousCurve)
      bug('Sketcher2d.saveCurve', 'No previous curve available for custom corner');

    this.pendingCurves.push(...this._nextCorner(previousCurve, curve));
    this._nextCorner = null;
  }

  /** Draw a straight line to an absolute 2D point. */
  lineTo(point: Point2D): this {
    const curve = make2dSegmentCurve(this._convertToUV(this.pointer), this._convertToUV(point));
    return this._saveCurveAndAdvance(curve, point);
  }

  /** Draw a straight line by relative horizontal and vertical distances. */
  line(xDist: number, yDist: number): this {
    return this.lineTo(this._resolveRelative(xDist, yDist));
  }

  /** Draw a vertical line of the given signed distance. */
  vLine(distance: number): this {
    return this.line(0, distance);
  }

  /** Draw a horizontal line of the given signed distance. */
  hLine(distance: number): this {
    return this.line(distance, 0);
  }

  /** Draw a vertical line to an absolute Y coordinate. */
  vLineTo(yPos: number): this {
    return this.lineTo([this.pointer[0], yPos]);
  }

  /** Draw a horizontal line to an absolute X coordinate. */
  hLineTo(xPos: number): this {
    return this.lineTo([xPos, this.pointer[1]]);
  }

  /** Draw a line to a point given in polar coordinates [r, theta] from the origin. */
  polarLineTo([r, theta]: Point2D): this {
    return this.lineTo(polarToCartesian(r, theta * DEG2RAD));
  }

  /** Draw a line in polar coordinates (distance and angle in degrees) from the current point. */
  polarLine(distance: number, angle: number): this {
    const [x, y] = polarToCartesian(distance, angle * DEG2RAD);
    return this.line(x, y);
  }

  /** Draw a line tangent to the previous curve, extending by the given distance. */
  tangentLine(distance: number): this {
    const previousCurve = this._requireLastCurve('Sketcher2d.tangentLine', 'sketch a tangent line');
    const direction = normalize2d(this._convertFromUV(previousCurve.tangentAt(1)));
    return this.line(direction[0] * distance, direction[1] * distance);
  }

  /** Draw a circular arc passing through a mid-point to an absolute end point. */
  threePointsArcTo(end: Point2D, midPoint: Point2D): this {
    const curve = make2dThreePointArc(
      this._convertToUV(this.pointer),
      this._convertToUV(midPoint),
      this._convertToUV(end)
    );
    return this._saveCurveAndAdvance(curve, end);
  }

  /** Draw a circular arc through a via-point to an end point, both as relative distances. */
  threePointsArc(xDist: number, yDist: number, viaXDist: number, viaYDist: number): this {
    const [x0, y0] = this.pointer;
    return this.threePointsArcTo([x0 + xDist, y0 + yDist], [x0 + viaXDist, y0 + viaYDist]);
  }

  /** Draw a circular arc to an absolute end point, bulging by the given sagitta. */
  sagittaArcTo(end: Point2D, sagitta: number): this {
    const [x0, y0] = this.pointer;
    const [x1, y1] = end;

    const midX = (x0 + x1) / 2;
    const midY = (y0 + y1) / 2;

    const sagDirX = -(y1 - y0);
    const sagDirY = x1 - x0;
    const sagDirLen = Math.sqrt(sagDirX ** 2 + sagDirY ** 2);

    if (sagDirLen < 1e-12) {
      bug('sagittaArcTo', 'Start and end points cannot be identical');
    }

    const sagPoint: Point2D = [
      midX + (sagDirX / sagDirLen) * sagitta,
      midY + (sagDirY / sagDirLen) * sagitta,
    ];

    const curve = make2dThreePointArc(
      this._convertToUV(this.pointer),
      this._convertToUV(sagPoint),
      this._convertToUV(end)
    );
    return this._saveCurveAndAdvance(curve, end);
  }

  /** Draw a circular arc to a relative end point, bulging by the given sagitta. */
  sagittaArc(xDist: number, yDist: number, sagitta: number): this {
    return this.sagittaArcTo(this._resolveRelative(xDist, yDist), sagitta);
  }

  /** Draw a vertical sagitta arc of the given distance and bulge. */
  vSagittaArc(distance: number, sagitta: number): this {
    return this.sagittaArc(0, distance, sagitta);
  }

  /** Draw a horizontal sagitta arc of the given distance and bulge. */
  hSagittaArc(distance: number, sagitta: number): this {
    return this.sagittaArc(distance, 0, sagitta);
  }

  /** Draw an arc to an absolute end point using a bulge factor (sagitta as fraction of half-chord). */
  bulgeArcTo(end: Point2D, bulge: number): this {
    if (!bulge) return this.lineTo(end);
    const halfChord = distance2d(this.pointer, end) / 2;
    return this.sagittaArcTo(end, -bulge * halfChord);
  }

  /** Draw an arc to a relative end point using a bulge factor. */
  bulgeArc(xDist: number, yDist: number, bulge: number): this {
    return this.bulgeArcTo(this._resolveRelative(xDist, yDist), bulge);
  }

  /** Draw a vertical bulge arc of the given distance and bulge factor. */
  vBulgeArc(distance: number, bulge: number): this {
    return this.bulgeArc(0, distance, bulge);
  }

  /** Draw a horizontal bulge arc of the given distance and bulge factor. */
  hBulgeArc(distance: number, bulge: number): this {
    return this.bulgeArc(distance, 0, bulge);
  }

  /** Draw a circular arc tangent to the previous curve, ending at an absolute point. */
  tangentArcTo(end: Point2D): this {
    const previousCurve = this._requireLastCurve('Sketcher2d.tangentArc', 'sketch a tangent arc');
    const curve = make2dTangentArc(
      this._convertToUV(this.pointer),
      previousCurve.tangentAt(1),
      this._convertToUV(end)
    );
    return this._saveCurveAndAdvance(curve, end);
  }

  /** Draw a circular arc tangent to the previous curve, ending at a relative offset. */
  tangentArc(xDist: number, yDist: number): this {
    return this.tangentArcTo(this._resolveRelative(xDist, yDist));
  }

  /** Draw an elliptical arc to an absolute end point (SVG-style parameters). */
  ellipseTo(
    end: Point2D,
    horizontalRadius: number,
    verticalRadius: number,
    rotation = 0,
    longAxis = false,
    sweep = false
  ): this {
    const { majorRadius, minorRadius, rotationAngle } = normalizeEllipseRadii(
      horizontalRadius,
      verticalRadius,
      rotation
    );

    const arc = makeEllipseArcFromSvgParams(
      this._convertToUV(this.pointer),
      this._convertToUV(end),
      majorRadius,
      minorRadius,
      rotationAngle,
      longAxis,
      sweep,
      (p) => this._convertToUV(p)
    );

    return this._saveCurveAndAdvance(arc, end);
  }

  /** Draw an elliptical arc to a relative end point (SVG-style parameters). */
  ellipse(
    xDist: number,
    yDist: number,
    horizontalRadius: number,
    verticalRadius: number,
    rotation = 0,
    longAxis = false,
    sweep = false
  ): this {
    return this.ellipseTo(
      this._resolveRelative(xDist, yDist),
      horizontalRadius,
      verticalRadius,
      rotation,
      longAxis,
      sweep
    );
  }

  /** Draw a half-ellipse arc to an absolute end point with a given minor radius. */
  halfEllipseTo(end: Point2D, minorRadius: number, sweep = false): this {
    const angle = polarAngle2d(end, this.pointer);
    const dist = distance2d(end, this.pointer);
    return this.ellipseTo(end, dist / 2, minorRadius, angle * RAD2DEG, true, sweep);
  }

  /** Draw a half-ellipse arc to a relative end point with a given minor radius. */
  halfEllipse(xDist: number, yDist: number, minorRadius: number, sweep = false): this {
    return this.halfEllipseTo(this._resolveRelative(xDist, yDist), minorRadius, sweep);
  }

  /** Draw a Bezier curve to an absolute end point through one or more control points. */
  bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this {
    const cp: Point2D[] =
      controlPoints.length === 2 && !Array.isArray(controlPoints[0])
        ? [controlPoints as Point2D]
        : (controlPoints as Point2D[]);

    const curve = make2dBezierCurve(
      this._convertToUV(this.pointer),
      cp.map((point) => this._convertToUV(point)),
      this._convertToUV(end)
    );
    return this._saveCurveAndAdvance(curve, end);
  }

  /** Draw a quadratic Bezier curve to an absolute end point with a single control point. */
  quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this {
    return this.bezierCurveTo(end, [controlPoint]);
  }

  /** Draw a cubic Bezier curve to an absolute end point with start and end control points. */
  cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this {
    return this.bezierCurveTo(end, [startControlPoint, endControlPoint]);
  }

  /** Draw a smooth cubic Bezier spline to an absolute end point, blending tangent with the previous curve. */
  smoothSplineTo(end: Point2D, config?: SplineOptions): this {
    const { endTangent, startTangent, startFactor, endFactor } = defaultsSplineOptions(config);

    const previousCurve = this._lastCurve();
    const defaultDistance = distance2d(this.pointer, end) * 0.25;

    let startPoleDirection: Point2D;
    if (startTangent) {
      startPoleDirection = startTangent;
    } else if (!previousCurve) {
      startPoleDirection = [1, 0];
    } else {
      startPoleDirection = this._convertFromUV(previousCurve.tangentAt(1));
    }

    startPoleDirection = normalize2d(startPoleDirection);
    const startControl: Point2D = [
      this.pointer[0] + startPoleDirection[0] * startFactor * defaultDistance,
      this.pointer[1] + startPoleDirection[1] * startFactor * defaultDistance,
    ];

    let endPoleDirection: Point2D;
    if (endTangent === 'symmetric') {
      endPoleDirection = [-startPoleDirection[0], -startPoleDirection[1]];
    } else {
      endPoleDirection = endTangent;
    }

    endPoleDirection = normalize2d(endPoleDirection);
    const endControl: Point2D = [
      end[0] - endPoleDirection[0] * endFactor * defaultDistance,
      end[1] - endPoleDirection[1] * endFactor * defaultDistance,
    ];

    return this.cubicBezierCurveTo(end, startControl, endControl);
  }

  /** Draw a smooth cubic Bezier spline to a relative end point, blending tangent with the previous curve. */
  smoothSpline(xDist: number, yDist: number, splineConfig?: SplineOptions): this {
    return this.smoothSplineTo(this._resolveRelative(xDist, yDist), splineConfig);
  }

  /** Changes the corner between the previous and next segments. */
  customCorner(
    radius: number | ((first: Curve2D, second: Curve2D) => Curve2D[]),
    mode: 'fillet' | 'chamfer' = 'fillet'
  ): this {
    if (!this.pendingCurves.length)
      bug('Sketcher2d.customCorner', 'You need a curve defined to fillet the angle');

    this._nextCorner = buildCornerFunction(radius, mode);
    return this;
  }

  protected _customCornerLastWithFirst(
    radius: number | ((f: Curve2D, s: Curve2D) => Curve2D[]),
    mode: 'fillet' | 'chamfer' | 'dogbone' = 'fillet'
  ): void {
    if (!radius) return;

    const previousCurve = this.pendingCurves.pop();
    const curve = this.pendingCurves.shift();

    if (!previousCurve || !curve)
      bug('Sketcher2d._customCornerLastWithFirst', 'Not enough curves to close and fillet');

    this.pendingCurves.push(...buildCornerFunction(radius, mode)(previousCurve, curve));
  }

  protected _closeSketch(): void {
    if (!samePoint(this.pointer, this.firstPoint)) {
      this.lineTo(this.firstPoint);
    }
  }

  protected _closeWithMirror(): void {
    if (samePoint(this.pointer, this.firstPoint))
      bug(
        'Sketcher2d._closeWithMirror',
        'Cannot close with a mirror when the sketch is already closed'
      );
    const startToEndVector: Point2D = [
      this.pointer[0] - this.firstPoint[0],
      this.pointer[1] - this.firstPoint[1],
    ];

    const uvOrigin = this._convertToUV(this.pointer);
    const uvDir = this._convertToUV(startToEndVector);

    const mirroredCurves = this.pendingCurves.map(
      (c) =>
        new Curve2D(
          getKernel().mirrorCurve2dAcrossAxis(
            c.wrapped,
            uvOrigin[0],
            uvOrigin[1],
            uvDir[0],
            uvDir[1]
          )
        )
    );
    mirroredCurves.reverse();
    for (const c of mirroredCurves) {
      c.reverse();
    }
    this.pendingCurves.push(...mirroredCurves);
    this.pointer = this.firstPoint;
  }
}
