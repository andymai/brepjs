import type { Plane, PlaneName, PlaneInput } from '../core/planeTypes.js';
import { resolvePlane, planeToWorld, planeToLocal } from '../core/planeOps.js';
import { localGC } from '../core/memory.js';
import { DEG2RAD, RAD2DEG } from '../core/constants.js';
import { unwrap } from '../core/result.js';
import { bug } from '../core/errors.js';
import { distance2d, polarAngle2d, polarToCartesian, type Point2D } from '../2d/lib/index.js';
import type { Vec3, PointInput } from '../core/types.js';
import { toVec3 } from '../core/types.js';
import {
  vecAdd,
  vecSub,
  vecScale,
  vecNormalize,
  vecCross,
  vecEquals,
  vecLength,
  vecRotate,
} from '../core/vecOps.js';

import {
  makeLine,
  makeThreePointArc,
  makeBezierCurve,
  makeTangentArc,
  makeEllipseArc,
  assembleWire,
} from '../topology/shapeHelpers.js';

import {
  convertSvgEllipseParams,
  type SplineConfig,
  defaultsSplineConfig,
  type GenericSketcher,
} from './sketcherlib.js';
import { Wire, type CurveLike, type Edge } from '../topology/shapes.js';
import { downcast } from '../topology/cast.js';
import { mirror as mirrorOcShape } from '../core/geometryHelpers.js';
import type { OcType } from '../kernel/types.js';
import Sketch from './Sketch.js';

/**
 * Build 2D wire profiles on a 3D plane using a builder-pen API.
 *
 * The Sketcher converts relative/absolute 2D drawing commands into 3D edges
 * projected onto the chosen plane, then assembles them into a {@link Sketch}.
 *
 * @example
 * ```ts
 * const sketch = new Sketcher("XZ", 5)
 *   .hLine(20)
 *   .vLine(10)
 *   .hLine(-20)
 *   .close();
 * const solid = sketch.extrude(8);
 * ```
 *
 * @see {@link FaceSketcher} for sketching on non-planar surfaces.
 * @see {@link DrawingPen} for the pure-2D equivalent.
 * @category Sketching
 */
export default class Sketcher implements GenericSketcher<Sketch> {
  protected plane: Plane;
  protected pointer: Vec3;
  protected firstPoint: Vec3;
  protected pendingEdges: Edge[];
  protected _mirrorWire: boolean;

  /**
   * The sketcher can be defined by a plane, or a simple plane definition,
   * with either a point of origin, or the position on the normal axis from
   * the coordinates origin
   */
  constructor(plane: Plane);
  constructor(plane?: PlaneName, origin?: PointInput | number);
  constructor(plane?: PlaneInput, origin?: PointInput | number) {
    this.plane =
      plane && typeof plane !== 'string' ? { ...plane } : resolvePlane(plane ?? 'XY', origin);

    this.pointer = [...this.plane.origin];
    this.firstPoint = [...this.plane.origin];

    this.pendingEdges = [];
    this._mirrorWire = false;
  }

  /** Release all OCCT edges held by this sketcher. */
  delete(): void {
    // plane is now a plain object - no need to delete
    for (const edge of this.pendingEdges) {
      edge.delete();
    }
    this.pendingEdges = [];
  }

  protected _updatePointer(newPointer: Vec3): void {
    this.pointer = newPointer;
  }

  /** Move the pen to an absolute 2D position before drawing any edges. */
  movePointerTo([x, y]: Point2D): this {
    if (this.pendingEdges.length)
      bug('Sketcher.movePointerTo', 'You can only move the pointer if there is no edge defined');
    this._updatePointer(planeToWorld(this.plane, [x, y]));
    this.firstPoint = this.pointer;
    return this;
  }

  /** Draw a straight line to an absolute 2D point on the sketch plane. */
  lineTo([x, y]: Point2D): this {
    const endPoint = planeToWorld(this.plane, [x, y]);
    this.pendingEdges.push(makeLine(this.pointer, endPoint));
    this._updatePointer(endPoint);
    return this;
  }

  /** Draw a straight line by relative horizontal and vertical distances. */
  line(xDist: number, yDist: number): this {
    const [px, py] = planeToLocal(this.plane, this.pointer);
    return this.lineTo([xDist + px, yDist + py]);
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
    const [px] = planeToLocal(this.plane, this.pointer);
    return this.lineTo([px, yPos]);
  }

  /** Draw a horizontal line to an absolute X coordinate. */
  hLineTo(xPos: number): this {
    const [, py] = planeToLocal(this.plane, this.pointer);
    return this.lineTo([xPos, py]);
  }

  /** Draw a line in polar coordinates (distance and angle in degrees) from the current point. */
  polarLine(distance: number, angle: number): this {
    const angleInRads = angle * DEG2RAD;
    const [x, y] = polarToCartesian(distance, angleInRads);
    return this.line(x, y);
  }

  /** Draw a line to a point given in polar coordinates [r, theta] from the origin. */
  polarLineTo([r, theta]: [number, number]): this {
    const angleInRads = theta * DEG2RAD;
    const point = polarToCartesian(r, angleInRads);
    return this.lineTo(point);
  }

  /** Draw a line tangent to the previous edge, extending by the given distance. */
  tangentLine(distance: number): this {
    const previousEdge = this.pendingEdges.length
      ? this.pendingEdges[this.pendingEdges.length - 1]
      : null;

    if (!previousEdge)
      bug('Sketcher.tangentLine', 'You need a previous edge to create a tangent line');

    const tangent = previousEdge.tangentAt(1);
    const scaledTangent = vecScale(vecNormalize(tangent), distance);
    const endPoint = vecAdd(scaledTangent, this.pointer);

    this.pendingEdges.push(makeLine(this.pointer, endPoint));
    this._updatePointer(endPoint);
    return this;
  }

  /** Draw a circular arc passing through an inner point to an absolute end point. */
  threePointsArcTo(end: Point2D, innerPoint: Point2D): this {
    const gpoint1 = planeToWorld(this.plane, innerPoint);
    const gpoint2 = planeToWorld(this.plane, end);

    this.pendingEdges.push(makeThreePointArc(this.pointer, gpoint1, gpoint2));

    this._updatePointer(gpoint2);
    return this;
  }

  /** Draw a circular arc through a via-point to an end point, both given as relative distances. */
  threePointsArc(xDist: number, yDist: number, viaXDist: number, viaYDist: number): this {
    const [px, py] = planeToLocal(this.plane, this.pointer);
    return this.threePointsArcTo([px + xDist, py + yDist], [px + viaXDist, py + viaYDist]);
  }

  /** Draw a circular arc tangent to the previous edge, ending at an absolute point. */
  tangentArcTo(end: Point2D): this {
    const endPoint = planeToWorld(this.plane, end);
    const previousEdge = this.pendingEdges.length
      ? this.pendingEdges[this.pendingEdges.length - 1]
      : null;

    if (!previousEdge)
      bug('Sketcher.tangentArcTo', 'You need a previous edge to create a tangent arc');

    const prevEnd = previousEdge.endPoint;
    const prevTangent = previousEdge.tangentAt(1);
    this.pendingEdges.push(makeTangentArc(prevEnd, prevTangent, endPoint));

    this._updatePointer(endPoint);
    return this;
  }

  /** Draw a circular arc tangent to the previous edge, ending at a relative offset. */
  tangentArc(xDist: number, yDist: number): this {
    const [px, py] = planeToLocal(this.plane, this.pointer);
    return this.tangentArcTo([xDist + px, yDist + py]);
  }

  /** Draw a circular arc to an absolute end point, bulging by the given sagitta. */
  sagittaArcTo(end: Point2D, sagitta: number): this {
    const startPoint = this.pointer;
    const endPoint = planeToWorld(this.plane, end);

    const sum = vecAdd(endPoint, startPoint);
    const midPoint = vecScale(sum, 0.5);

    const diff = vecSub(endPoint, startPoint);
    const crossResult = vecCross(diff, this.plane.zDir);
    const sagDirection = vecNormalize(crossResult);

    const sagVector = vecScale(sagDirection, sagitta);

    const sagPoint = vecAdd(midPoint, sagVector);

    this.pendingEdges.push(makeThreePointArc(this.pointer, sagPoint, endPoint));
    this._updatePointer(endPoint);

    return this;
  }

  /** Draw a circular arc to a relative end point, bulging by the given sagitta. */
  sagittaArc(xDist: number, yDist: number, sagitta: number): this {
    const [px, py] = planeToLocal(this.plane, this.pointer);
    return this.sagittaArcTo([xDist + px, yDist + py], sagitta);
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
    const [px, py] = planeToLocal(this.plane, this.pointer);
    const halfChord = distance2d([px, py], end) / 2;
    const bulgeAsSagitta = -bulge * halfChord;

    return this.sagittaArcTo(end, bulgeAsSagitta);
  }

  /** Draw an arc to a relative end point using a bulge factor. */
  bulgeArc(xDist: number, yDist: number, bulge: number): this {
    const [px, py] = planeToLocal(this.plane, this.pointer);
    return this.bulgeArcTo([xDist + px, yDist + py], bulge);
  }

  /** Draw a vertical bulge arc of the given distance and bulge factor. */
  vBulgeArc(distance: number, bulge: number): this {
    return this.bulgeArc(0, distance, bulge);
  }

  /** Draw a horizontal bulge arc of the given distance and bulge factor. */
  hBulgeArc(distance: number, bulge: number): this {
    return this.bulgeArc(distance, 0, bulge);
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
    const [, gc] = localGC();
    const [startX, startY] = planeToLocal(this.plane, this.pointer);

    let rotationAngle = rotation;
    let majorRadius = horizontalRadius;
    let minorRadius = verticalRadius;

    if (horizontalRadius < verticalRadius) {
      rotationAngle = rotation + 90;
      majorRadius = verticalRadius;
      minorRadius = horizontalRadius;
    }

    const { cx, cy, rx, ry, startAngle, endAngle, clockwise } = convertSvgEllipseParams(
      [startX, startY],
      end,
      majorRadius,
      minorRadius,
      rotationAngle * DEG2RAD,
      longAxis,
      sweep
    );

    const xDir = vecRotate(this.plane.xDir, this.plane.zDir, rotationAngle * DEG2RAD);

    const arc = unwrap(
      makeEllipseArc(
        rx,
        ry,
        clockwise ? startAngle : endAngle,
        clockwise ? endAngle : startAngle,
        planeToWorld(this.plane, [cx, cy]),
        this.plane.zDir,
        xDir
      )
    );

    if (!clockwise) {
      arc.wrapped.Reverse();
    }

    this.pendingEdges.push(arc);
    this._updatePointer(planeToWorld(this.plane, end));
    gc();
    return this;
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
    const [px, py] = planeToLocal(this.plane, this.pointer);
    return this.ellipseTo(
      [xDist + px, yDist + py],
      horizontalRadius,
      verticalRadius,
      rotation,
      longAxis,
      sweep
    );
  }

  /** Draw a half-ellipse arc to an absolute end point with a given minor radius. */
  halfEllipseTo(end: Point2D, verticalRadius: number, sweep = false): this {
    const [px, py] = planeToLocal(this.plane, this.pointer);
    const start: Point2D = [px, py];

    const angle = polarAngle2d(end, start);
    const distance = distance2d(end, start);

    return this.ellipseTo(end, distance / 2, verticalRadius, angle * RAD2DEG, false, sweep);
  }

  /** Draw a half-ellipse arc to a relative end point with a given minor radius. */
  halfEllipse(xDist: number, yDist: number, verticalRadius: number, sweep = false): this {
    const [px, py] = planeToLocal(this.plane, this.pointer);
    return this.halfEllipseTo([xDist + px, yDist + py], verticalRadius, sweep);
  }

  /** Draw a Bezier curve to an absolute end point through one or more control points. */
  bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this {
    let cp: Point2D[];
    if (controlPoints.length === 2 && !Array.isArray(controlPoints[0])) {
      cp = [controlPoints as Point2D];
    } else {
      cp = controlPoints as Point2D[];
    }

    const inWorldPoints = cp.map((p) => planeToWorld(this.plane, p));
    const endPoint = planeToWorld(this.plane, end);

    this.pendingEdges.push(makeBezierCurve([this.pointer, ...inWorldPoints, endPoint]));

    this._updatePointer(endPoint);
    return this;
  }

  /** Draw a quadratic Bezier curve to an absolute end point with a single control point. */
  quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this {
    return this.bezierCurveTo(end, [controlPoint]);
  }

  /** Draw a cubic Bezier curve to an absolute end point with start and end control points. */
  cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this {
    return this.bezierCurveTo(end, [startControlPoint, endControlPoint]);
  }

  /** Draw a smooth cubic Bezier spline to an absolute end point, blending tangent with the previous edge. */
  smoothSplineTo(end: Point2D, config?: SplineConfig): this {
    const [r, gc] = localGC();
    try {
      const { endTangent, startTangent, startFactor, endFactor } = defaultsSplineConfig(config);

      const endPoint = planeToWorld(this.plane, end);
      const previousEdge = this.pendingEdges.length
        ? this.pendingEdges[this.pendingEdges.length - 1]
        : null;

      const diff = vecSub(endPoint, this.pointer);
      const defaultDistance = vecLength(diff) * 0.25;

      let startPoleDirection: Vec3;
      if (startTangent) {
        startPoleDirection = planeToWorld(this.plane, startTangent);
      } else if (!previousEdge) {
        startPoleDirection = planeToWorld(this.plane, [1, 0]);
      } else if (previousEdge.geomType === 'BEZIER_CURVE') {
        const rawCurve = (
          r(previousEdge.curve).wrapped as CurveLike & {
            Bezier: () => { get: () => OcType };
          }
        )
          .Bezier()
          .get();
        const previousPole = toVec3(rawCurve.Pole(rawCurve.NbPoles() - 1));

        startPoleDirection = vecSub(this.pointer, previousPole);
      } else {
        startPoleDirection = previousEdge.tangentAt(1);
      }

      const poleDistance = vecScale(
        vecNormalize(startPoleDirection),
        startFactor * defaultDistance
      );
      const startControl = vecAdd(this.pointer, poleDistance);

      let endPoleDirection: Vec3;
      if (endTangent === 'symmetric') {
        endPoleDirection = vecScale(startPoleDirection, -1);
      } else {
        endPoleDirection = planeToWorld(this.plane, endTangent);
      }

      const endPoleDistance = vecScale(vecNormalize(endPoleDirection), endFactor * defaultDistance);
      const endControl = vecSub(endPoint, endPoleDistance);

      this.pendingEdges.push(makeBezierCurve([this.pointer, startControl, endControl, endPoint]));

      this._updatePointer(endPoint);
      return this;
    } finally {
      gc();
    }
  }

  /** Draw a smooth cubic Bezier spline to a relative end point, blending tangent with the previous edge. */
  smoothSpline(xDist: number, yDist: number, splineConfig: SplineConfig = {}): this {
    const [px, py] = planeToLocal(this.plane, this.pointer);
    return this.smoothSplineTo([xDist + px, yDist + py], splineConfig);
  }

  protected _mirrorWireOnStartEnd(wire: Wire): Wire {
    const diff = vecSub(this.pointer, this.firstPoint);
    const startToEndVector = vecNormalize(diff);
    const normal = vecCross(startToEndVector, this.plane.zDir);

    const clonedWrapped = unwrap(downcast(wire.wrapped));
    const mirroredRaw = mirrorOcShape(clonedWrapped, normal, this.pointer);
    const mirroredWrapped = unwrap(downcast(mirroredRaw));
    const mirroredWire = new Wire(mirroredWrapped);

    const combinedWire = unwrap(assembleWire([wire, mirroredWire]));

    return combinedWire;
  }

  protected buildWire(): Wire {
    if (!this.pendingEdges.length) bug('Sketcher.buildWire', 'No lines to convert into a wire');

    let wire = unwrap(assembleWire(this.pendingEdges));

    if (this._mirrorWire) {
      wire = this._mirrorWireOnStartEnd(wire);
    }

    return wire;
  }

  protected _closeSketch(): void {
    if (!vecEquals(this.pointer, this.firstPoint) && !this._mirrorWire) {
      const [endX, endY] = planeToLocal(this.plane, this.firstPoint);
      this.lineTo([endX, endY]);
    }
  }

  /** Finish drawing and return the open-wire Sketch (does not close the path). */
  done(): Sketch {
    const sketch = new Sketch(this.buildWire(), {
      defaultOrigin: this.plane.origin,
      defaultDirection: this.plane.zDir,
    });
    return sketch;
  }

  /** Close the path with a straight line to the start point and return the Sketch. */
  close(): Sketch {
    this._closeSketch();
    return this.done();
  }

  /** Close the path by mirroring all edges about the line from first to last point. */
  closeWithMirror(): Sketch {
    this._mirrorWire = true;
    return this.close();
  }
}
