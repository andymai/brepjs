import { Plane, type PlaneName, type Point, Vector } from '../core/geometry.js';
import { makePlane } from '../core/geometryHelpers.js';
import { localGC } from '../core/memory.js';
import { DEG2RAD, RAD2DEG } from '../core/constants.js';
import { unwrap } from '../core/result.js';
import { bug } from '../core/errors.js';
import { distance2d, polarAngle2d, polarToCartesian, type Point2D } from '../2d/lib/index.js';
import type { Vec3 } from '../core/types.js';
import { toVec3 } from '../core/types.js';
import {
  vecAdd,
  vecSub,
  vecScale,
  vecNormalize,
  vecCross,
  vecEquals,
  vecLength,
} from '../core/vecOps.js';

// Helper to convert readonly Vec3 to mutable Point for legacy APIs
function toPoint(v: Vec3): Point {
  return [v[0], v[1], v[2]];
}

// Helper to convert Vec3 to Vector for Plane methods
function toVector(v: Vec3): Vector {
  return new Vector(toPoint(v));
}
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
import type { CurveLike, Edge, Wire } from '../topology/shapes.js';
import type { OcType } from '../kernel/types.js';
import Sketch from './Sketch.js';

/**
 * The Sketcher allows you to sketch on a plane.
 *
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
  constructor(plane?: PlaneName, origin?: Point | number);
  constructor(plane?: Plane | PlaneName, origin?: Point) {
    this.plane = plane instanceof Plane ? makePlane(plane) : makePlane(plane, origin);

    this.pointer = this.plane.origin.toVec3();
    this.firstPoint = this.plane.origin.toVec3();

    this.pendingEdges = [];
    this._mirrorWire = false;
  }

  delete(): void {
    this.plane.delete();
    // pointer and firstPoint are Vec3 tuples - no need to delete
    for (const edge of this.pendingEdges) {
      edge.delete();
    }
    this.pendingEdges = [];
  }

  protected _updatePointer(newPointer: Vec3): void {
    // Vec3 tuples don't need deletion
    this.pointer = newPointer;
  }

  movePointerTo([x, y]: Point2D): this {
    if (this.pendingEdges.length)
      bug('Sketcher.movePointerTo', 'You can only move the pointer if there is no edge defined');
    this._updatePointer(this.plane.toWorldCoords([x, y]).toVec3());
    this.firstPoint = this.pointer;
    return this;
  }

  lineTo([x, y]: Point2D): this {
    const endPoint = this.plane.toWorldCoords([x, y]).toVec3();
    this.pendingEdges.push(makeLine(this.pointer, endPoint));
    this._updatePointer(endPoint);
    return this;
  }

  line(xDist: number, yDist: number): this {
    const pointer = this.plane.toLocalCoords(toVector(this.pointer));
    return this.lineTo([xDist + pointer.x, yDist + pointer.y]);
  }

  vLine(distance: number): this {
    return this.line(0, distance);
  }

  hLine(distance: number): this {
    return this.line(distance, 0);
  }

  vLineTo(yPos: number): this {
    const pointer = this.plane.toLocalCoords(toVector(this.pointer));
    return this.lineTo([pointer.x, yPos]);
  }

  hLineTo(xPos: number): this {
    const pointer = this.plane.toLocalCoords(toVector(this.pointer));
    return this.lineTo([xPos, pointer.y]);
  }

  polarLine(distance: number, angle: number): this {
    const angleInRads = angle * DEG2RAD;
    const [x, y] = polarToCartesian(distance, angleInRads);
    return this.line(x, y);
  }

  polarLineTo([r, theta]: [number, number]): this {
    const angleInRads = theta * DEG2RAD;
    const point = polarToCartesian(r, angleInRads);
    return this.lineTo(point);
  }

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

  threePointsArcTo(end: Point2D, innerPoint: Point2D): this {
    const gpoint1 = this.plane.toWorldCoords(innerPoint).toVec3();
    const gpoint2 = this.plane.toWorldCoords(end).toVec3();

    this.pendingEdges.push(makeThreePointArc(this.pointer, gpoint1, gpoint2));

    this._updatePointer(gpoint2);
    return this;
  }

  threePointsArc(xDist: number, yDist: number, viaXDist: number, viaYDist: number): this {
    const pointer = this.plane.toLocalCoords(toVector(this.pointer));
    return this.threePointsArcTo(
      [pointer.x + xDist, pointer.y + yDist],
      [pointer.x + viaXDist, pointer.y + viaYDist]
    );
  }

  tangentArcTo(end: Point2D): this {
    const endPoint = this.plane.toWorldCoords(end).toVec3();
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

  tangentArc(xDist: number, yDist: number): this {
    const pointer = this.plane.toLocalCoords(toVector(this.pointer));
    return this.tangentArcTo([xDist + pointer.x, yDist + pointer.y]);
  }

  sagittaArcTo(end: Point2D, sagitta: number): this {
    const startPoint = this.pointer;
    const endPoint = this.plane.toWorldCoords(end).toVec3();

    const sum = vecAdd(endPoint, startPoint);
    const midPoint = vecScale(sum, 0.5);

    const diff = vecSub(endPoint, startPoint);
    const crossResult = vecCross(diff, this.plane.zDir.toVec3());
    const sagDirection = vecNormalize(crossResult);

    const sagVector = vecScale(sagDirection, sagitta);

    const sagPoint = vecAdd(midPoint, sagVector);

    this.pendingEdges.push(makeThreePointArc(this.pointer, sagPoint, endPoint));
    this._updatePointer(endPoint);

    return this;
  }

  sagittaArc(xDist: number, yDist: number, sagitta: number): this {
    const pointer = this.plane.toLocalCoords(toVector(this.pointer));
    return this.sagittaArcTo([xDist + pointer.x, yDist + pointer.y], sagitta);
  }

  vSagittaArc(distance: number, sagitta: number): this {
    return this.sagittaArc(0, distance, sagitta);
  }

  hSagittaArc(distance: number, sagitta: number): this {
    return this.sagittaArc(distance, 0, sagitta);
  }

  bulgeArcTo(end: Point2D, bulge: number): this {
    if (!bulge) return this.lineTo(end);
    const pointer = this.plane.toLocalCoords(toVector(this.pointer));
    const halfChord = distance2d([pointer.x, pointer.y], end) / 2;
    const bulgeAsSagitta = -bulge * halfChord;

    return this.sagittaArcTo(end, bulgeAsSagitta);
  }

  bulgeArc(xDist: number, yDist: number, bulge: number): this {
    const pointer = this.plane.toLocalCoords(toVector(this.pointer));
    return this.bulgeArcTo([xDist + pointer.x, yDist + pointer.y], bulge);
  }

  vBulgeArc(distance: number, bulge: number): this {
    return this.bulgeArc(0, distance, bulge);
  }

  hBulgeArc(distance: number, bulge: number): this {
    return this.bulgeArc(distance, 0, bulge);
  }

  ellipseTo(
    end: Point2D,
    horizontalRadius: number,
    verticalRadius: number,
    rotation = 0,
    longAxis = false,
    sweep = false
  ): this {
    const [r, gc] = localGC();
    const start = this.plane.toLocalCoords(toVector(this.pointer));

    let rotationAngle = rotation;
    let majorRadius = horizontalRadius;
    let minorRadius = verticalRadius;

    if (horizontalRadius < verticalRadius) {
      rotationAngle = rotation + 90;
      majorRadius = verticalRadius;
      minorRadius = horizontalRadius;
    }

    const { cx, cy, rx, ry, startAngle, endAngle, clockwise } = convertSvgEllipseParams(
      [start.x, start.y],
      end,
      majorRadius,
      minorRadius,
      rotationAngle * DEG2RAD,
      longAxis,
      sweep
    );

    const xDirRotated = this.plane.xDir.rotate(rotationAngle, this.plane.origin, this.plane.zDir);
    const xDir = r(xDirRotated).toVec3();

    const arc = unwrap(
      makeEllipseArc(
        rx,
        ry,
        clockwise ? startAngle : endAngle,
        clockwise ? endAngle : startAngle,
        r(this.plane.toWorldCoords([cx, cy])).toVec3(),
        this.plane.zDir.toVec3(),
        xDir
      )
    );

    if (!clockwise) {
      arc.wrapped.Reverse();
    }

    this.pendingEdges.push(arc);
    this._updatePointer(this.plane.toWorldCoords(end).toVec3());
    gc();
    return this;
  }

  ellipse(
    xDist: number,
    yDist: number,
    horizontalRadius: number,
    verticalRadius: number,
    rotation = 0,
    longAxis = false,
    sweep = false
  ): this {
    const pointer = this.plane.toLocalCoords(toVector(this.pointer));
    return this.ellipseTo(
      [xDist + pointer.x, yDist + pointer.y],
      horizontalRadius,
      verticalRadius,
      rotation,
      longAxis,
      sweep
    );
  }

  halfEllipseTo(end: Point2D, verticalRadius: number, sweep = false): this {
    const pointer = this.plane.toLocalCoords(toVector(this.pointer));
    const start: Point2D = [pointer.x, pointer.y];

    const angle = polarAngle2d(end, start);
    const distance = distance2d(end, start);

    return this.ellipseTo(end, distance / 2, verticalRadius, angle * RAD2DEG, false, sweep);
  }

  halfEllipse(xDist: number, yDist: number, verticalRadius: number, sweep = false): this {
    const pointer = this.plane.toLocalCoords(toVector(this.pointer));
    return this.halfEllipseTo([xDist + pointer.x, yDist + pointer.y], verticalRadius, sweep);
  }

  bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this {
    let cp: Point2D[];
    if (controlPoints.length === 2 && !Array.isArray(controlPoints[0])) {
      cp = [controlPoints as Point2D];
    } else {
      cp = controlPoints as Point2D[];
    }

    const inWorldPoints = cp.map((p) => this.plane.toWorldCoords(p).toVec3());
    const endPoint = this.plane.toWorldCoords(end).toVec3();

    this.pendingEdges.push(makeBezierCurve([this.pointer, ...inWorldPoints, endPoint]));

    this._updatePointer(endPoint);
    return this;
  }

  quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this {
    return this.bezierCurveTo(end, [controlPoint]);
  }

  cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this {
    return this.bezierCurveTo(end, [startControlPoint, endControlPoint]);
  }

  smoothSplineTo(end: Point2D, config?: SplineConfig): this {
    const [r, gc] = localGC();
    try {
      const { endTangent, startTangent, startFactor, endFactor } = defaultsSplineConfig(config);

      const endPoint = this.plane.toWorldCoords(end).toVec3();
      const previousEdge = this.pendingEdges.length
        ? this.pendingEdges[this.pendingEdges.length - 1]
        : null;

      const diff = vecSub(endPoint, this.pointer);
      const defaultDistance = vecLength(diff) * 0.25;

      let startPoleDirection: Vec3;
      if (startTangent) {
        startPoleDirection = this.plane.toWorldCoords(startTangent).toVec3();
      } else if (!previousEdge) {
        startPoleDirection = this.plane.toWorldCoords([1, 0]).toVec3();
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
        endPoleDirection = this.plane.toWorldCoords(endTangent).toVec3();
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

  smoothSpline(xDist: number, yDist: number, splineConfig: SplineConfig = {}): this {
    const pointer = this.plane.toLocalCoords(toVector(this.pointer));
    return this.smoothSplineTo([xDist + pointer.x, yDist + pointer.y], splineConfig);
  }

  protected _mirrorWireOnStartEnd(wire: Wire): Wire {
    const diff = vecSub(this.pointer, this.firstPoint);
    const startToEndVector = vecNormalize(diff);
    const normal = vecCross(startToEndVector, this.plane.zDir.toVec3());

    const mirroredWire = wire.clone().mirror(toPoint(normal), toPoint(this.pointer));

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
      const endpoint = this.plane.toLocalCoords(toVector(this.firstPoint));
      this.lineTo([endpoint.x, endpoint.y]);
    }
  }

  done(): Sketch {
    const sketch = new Sketch(this.buildWire(), {
      defaultOrigin: this.plane.origin,
      defaultDirection: this.plane.zDir,
    });
    return sketch;
  }

  close(): Sketch {
    this._closeSketch();
    return this.done();
  }

  closeWithMirror(): Sketch {
    this._mirrorWire = true;
    return this.close();
  }
}
