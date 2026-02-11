import Sketch from './Sketch.js';
import { DEG2RAD, RAD2DEG } from '../core/constants.js';
import { localGC } from '../core/memory.js';
import { getKernel } from '../kernel/index.js';
import { assembleWire } from '../topology/shapeHelpers.js';
import { unwrap } from '../core/result.js';
import type { Wire, Face } from '../core/shapeTypes.js';
import { createEdge, createFace } from '../core/shapeTypes.js';
import { uvBounds, pointOnSurface, normalAt } from '../topology/faceFns.js';
import { curveStartPoint, curveIsClosed } from '../topology/curveFns.js';
import { downcast } from '../topology/cast.js';
import { defaultsSplineOptions } from './sketcherlib.js';
import type { SplineOptions, GenericSketcher } from './sketcherlib.js';
import type { OcType } from '../kernel/types.js';
import { chamferCurves, Curve2D, dogboneFilletCurves, filletCurves } from '../2d/lib/index.js';
import { bug } from '../core/errors.js';

import {
  normalize2d,
  polarAngle2d,
  samePoint,
  distance2d,
  axis2d,
  polarToCartesian,
  make2dSegmentCurve,
  make2dTangentArc,
  make2dThreePointArc,
  make2dBezierCurve,
} from '../2d/lib/index.js';
import type { Point2D } from '../2d/lib/index.js';
import { vecScale } from '../core/vecOps.js';
import Blueprint from '../2d/blueprints/Blueprint.js';
import { normalizeEllipseRadii, makeEllipseArcFromSvgParams } from './ellipseUtils.js';

type UVBounds = {
  readonly uMin: number;
  readonly uMax: number;
  readonly vMin: number;
  readonly vMax: number;
};

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
 * used by {@link FaceSketcher}, {@link BlueprintSketcher}, and {@link DrawingPen}.
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

  // ── Coordinate conversion (overridden by FaceSketcher for UV mapping) ──

  protected _convertToUV([x, y]: Point2D): Point2D {
    return [x, y];
  }

  protected _convertFromUV([u, v]: Point2D): Point2D {
    return [u, v];
  }

  // ── Internal helpers ──

  /** Return the last curve in the pending list, or null if empty. */
  protected _lastCurve(): Curve2D | null {
    const len = this.pendingCurves.length;
    if (len === 0) return null;
    return this.pendingCurves[len - 1] as Curve2D;
  }

  /** Require that a previous curve exists, returning it or throwing. */
  protected _requireLastCurve(caller: string, action: string): Curve2D {
    const curve = this._lastCurve();
    if (!curve) bug(caller, `You need a previous curve to ${action}`);
    return curve;
  }

  /** Resolve a relative offset from the current pointer position. */
  protected _resolveRelative(xDist: number, yDist: number): Point2D {
    return [this.pointer[0] + xDist, this.pointer[1] + yDist];
  }

  /** Save a curve, advance the pointer to the given end point, and return `this`. */
  protected _saveCurveAndAdvance(curve: Curve2D, end: Point2D): this {
    this.saveCurve(curve);
    this.pointer = end;
    return this;
  }

  // ── Drawing state ──

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
   * The angle represents the tangent direction at the current pen position,
   * based on the last drawing operation (line, arc, bezier, etc.).
   * Returns 0 if nothing has been drawn yet.
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

  // ── Line segments ──

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

  // ── Three-point arcs ──

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

  // ── Sagitta arcs ──

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

  // ── Bulge arcs ──

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

  // ── Tangent arcs ──

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

  // ── Ellipse arcs ──

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

  // ── Bezier curves ──

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

  // ── Smooth splines ──

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

  // ── Corner treatments ──

  /**
   * Changes the corner between the previous and next segments.
   */
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

  // ── Close / mirror helpers ──

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

    const mirrorAxis = axis2d(this._convertToUV(this.pointer), this._convertToUV(startToEndVector));

    const mirroredCurves = this.pendingCurves.map(
      (c) => new Curve2D(c.innerCurve.Mirrored_2(mirrorAxis))
    );
    mirroredCurves.reverse();
    for (const c of mirroredCurves) {
      c.reverse();
    }
    this.pendingCurves.push(...mirroredCurves);
    this.pointer = this.firstPoint;
  }
}

/**
 * The FaceSketcher allows you to sketch on a face that is not planar, for
 * instance the sides of a cylinder.
 *
 * The coordinates passed to the methods corresponds to normalised distances on
 * this surface, between 0 and 1 in both direction.
 *
 * Note that if you are drawing on a closed surface (typically a revolution
 * surface or a cylinder), the first parameters represents the angle and can be
 * smaller than 0 or bigger than 1.
 *
 * @category Sketching
 */
export default class FaceSketcher extends BaseSketcher2d implements GenericSketcher<Sketch> {
  protected face: Face;
  protected _bounds: UVBounds;

  constructor(face: Face, origin: Point2D = [0, 0]) {
    super(origin);
    this.face = createFace(unwrap(downcast(face.wrapped)));
    this._bounds = uvBounds(face);
  }

  protected override _convertToUV([x, y]: Point2D): Point2D {
    const { uMin, uMax, vMin, vMax } = this._bounds;
    return [uMin + x * (uMax - uMin), vMin + y * (vMax - vMin)];
  }

  protected override _convertFromUV([u, v]: Point2D): Point2D {
    const { uMin, uMax, vMin, vMax } = this._bounds;
    return [(u - uMin) / (uMax - uMin), (v - vMin) / (vMax - vMin)];
  }

  _adaptSurface(): OcType {
    const oc = getKernel().oc;
    return oc.BRep_Tool.Surface_2(this.face.wrapped);
  }

  /**
   * @ignore
   */
  protected buildWire(): Wire {
    const [r, gc] = localGC();
    const oc = getKernel().oc;

    const geomSurf = r(this._adaptSurface());

    const edges = this.pendingCurves.map((curve) => {
      return r(createEdge(r(new oc.BRepBuilderAPI_MakeEdge_30(curve.wrapped, geomSurf)).Edge()));
    });
    const wire = unwrap(assembleWire(edges));
    oc.BRepLib.BuildCurves3d_2(wire.wrapped);

    gc();
    return wire;
  }

  /** Finish drawing and return the resulting {@link Sketch} (does not close the path). */
  done(): Sketch {
    const [r, gc] = localGC();

    const wire = this.buildWire();
    const sketch = new Sketch(wire);
    if (curveIsClosed(wire)) {
      const face = r(sketch.clone().face());
      const origin = pointOnSurface(face, 0.5, 0.5);
      const normal = normalAt(face);
      const direction = vecScale(normal, -1);
      sketch.defaultOrigin = [origin[0], origin[1], origin[2]];
      sketch.defaultDirection = [direction[0], direction[1], direction[2]];
    } else {
      const startPoint = curveStartPoint(wire);
      const normal = normalAt(this.face, [startPoint[0], startPoint[1], startPoint[2]]);
      sketch.defaultOrigin = [startPoint[0], startPoint[1], startPoint[2]];
      sketch.defaultDirection = [normal[0], normal[1], normal[2]];
    }
    sketch.baseFace = this.face;
    gc();
    return sketch;
  }

  /** Close the path with a straight line to the start point and return the Sketch. */
  close(): Sketch {
    this._closeSketch();
    return this.done();
  }

  /** Close the path by mirroring all curves about the line from first to last point. */
  closeWithMirror(): Sketch {
    this._closeWithMirror();
    return this.close();
  }

  /**
   * Close the path and apply a custom corner treatment between the last and first segments.
   *
   * @param radius - Fillet/chamfer radius, or a custom corner function.
   * @param mode - Corner treatment type.
   * @returns The closed {@link Sketch}.
   */
  closeWithCustomCorner(
    radius: number | ((f: Curve2D, s: Curve2D) => Curve2D[]),
    mode: 'fillet' | 'chamfer' | 'dogbone' = 'fillet'
  ): Sketch {
    this._closeSketch();
    this._customCornerLastWithFirst(radius, mode);

    return this.done();
  }
}

/**
 * Draw 2D curves and produce a {@link Blueprint} (pure-2D shape, no OCCT wire).
 *
 * Use this when you need a reusable 2D profile that can later be sketched onto
 * different planes or faces.
 *
 * @see {@link DrawingPen} for the higher-level Drawing wrapper.
 * @category Sketching
 */
export class BlueprintSketcher extends BaseSketcher2d implements GenericSketcher<Blueprint> {
  constructor(origin: Point2D = [0, 0]) {
    super();
    this.pointer = origin;
    this.firstPoint = origin;

    this.pendingCurves = [];
  }

  /** Finish drawing and return the resulting {@link Blueprint} (does not close the path). */
  done(): Blueprint {
    return new Blueprint(this.pendingCurves);
  }

  /** Close the path with a straight line to the start point and return the Blueprint. */
  close(): Blueprint {
    this._closeSketch();
    return this.done();
  }

  /** Close the path by mirroring all curves about the line from first to last point. */
  closeWithMirror(): Blueprint {
    this._closeWithMirror();
    return this.close();
  }

  /**
   * Close the path and apply a custom corner treatment between the last and first segments.
   *
   * @param radius - Fillet/chamfer radius.
   * @param mode - Corner treatment type.
   * @returns The closed {@link Blueprint}.
   */
  closeWithCustomCorner(
    radius: number,
    mode: 'fillet' | 'chamfer' | 'dogbone' = 'fillet'
  ): Blueprint {
    this._closeSketch();
    this._customCornerLastWithFirst(radius, mode);

    return this.done();
  }
}
