import { makePlane } from '../../core/geometryHelpers.js';
import type { ScaleMode } from '../curves.js';
import {
  curvesAsEdgesOnFace,
  curvesAsEdgesOnPlane,
  curvesBoundingBox,
  mirrorTransform2d,
  rotateTransform2d,
  stretchTransform2d,
  scaleTransform2d,
  translationTransform2d,
} from '../curves.js';
import type { Point2D, BoundingBox2d, Curve2D } from '../lib/index.js';
import {
  adaptedCurveToPathElem,
  make2dSegmentCurve,
  samePoint,
  isPoint2D,
  approximateAsSvgCompatibleCurve,
} from '../lib/index.js';
import type { AnyShape, Face } from '../../topology/shapes.js';
import { Wire } from '../../topology/shapes.js';
import { cast } from '../../topology/cast.js';
import { unwrap } from '../../core/result.js';

import { getKernel } from '../../kernel/index.js';
import { makeFace } from '../../topology/shapeHelpers.js';
import type { PlaneName, Point } from '../../core/geometry.js';
import { Plane } from '../../core/geometry.js';
import { DEG2RAD } from '../../core/constants.js';
import type { DrawingInterface, SketchData } from './lib.js';
import round5 from '../../utils/round5.js';
import { asSVG, viewbox } from './svg.js';
import { GCWithScope } from '../../core/memory.js';
import type { SingleFace } from '../../query/helpers.js';
import { getSingleFace } from '../../query/helpers.js';

/**
 * Assembles a list of edges into a wire.
 * Temporary inline implementation until shapeHelpers is ported.
 */
function assembleWire(listOfEdges: { wrapped: unknown }[]): Wire {
  const oc = getKernel().oc;
  const builder = new oc.BRepBuilderAPI_MakeWire_1();
  listOfEdges.forEach((e) => {
    builder.Add_1(e.wrapped);
  });
  return new Wire(builder.Wire());
}

/**
 * A Blueprint is an abstract Sketch, a 2D set of curves that can then be
 * sketched on different surfaces (faces or planes)
 *
 * You should create them by "sketching" with a `BlueprintSketcher`
 */
export default class Blueprint implements DrawingInterface {
  curves: Curve2D[];
  protected _boundingBox: null | BoundingBox2d;
  private readonly _orientation: null | 'clockwise' | 'counterClockwise';
  private _guessedOrientation: null | 'clockwise' | 'counterClockwise';
  constructor(curves: Curve2D[]) {
    if (curves.length === 0) {
      throw new Error('Blueprint requires at least one curve');
    }
    this.curves = curves;
    this._boundingBox = null;

    this._orientation = null;
    this._guessedOrientation = null;
  }

  delete() {
    this.curves.forEach((c) => {
      c.delete();
    });
    if (this._boundingBox) this._boundingBox.delete();
  }

  clone(): Blueprint {
    return new Blueprint(this.curves.map((c) => c.clone()));
  }

  get repr() {
    return ['Blueprint', ...this.curves.map((c) => c.repr)].join('\n');
  }

  get boundingBox(): BoundingBox2d {
    if (!this._boundingBox) {
      this._boundingBox = curvesBoundingBox(this.curves);
    }
    return this._boundingBox;
  }

  get orientation(): 'clockwise' | 'counterClockwise' {
    if (this._orientation) return this._orientation;
    if (this._guessedOrientation) return this._guessedOrientation;

    const vertices = this.curves.flatMap((c) => {
      if (c.geomType !== 'LINE') {
        // We just go with a simple approximation here, we should use some extrema
        // points instead, but this is quick (and good enough for now)
        return [c.firstPoint, c.value(0.5)];
      }
      return [c.firstPoint];
    });

    const approximateArea = vertices
      .map((v1, i) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const v2 = vertices[(i + 1) % vertices.length]!;
        return (v2[0] - v1[0]) * (v2[1] + v1[1]);
      })
      .reduce((a, b) => a + b, 0);

    this._guessedOrientation = approximateArea > 0 ? 'clockwise' : 'counterClockwise';
    return this._guessedOrientation;
  }

  stretch(ratio: number, direction: Point2D, origin: Point2D = [0, 0]): Blueprint {
    const curves = stretchTransform2d(ratio, direction, origin).transformCurves(this.curves);
    return new Blueprint(curves);
  }

  scale(scaleFactor: number, center?: Point2D): Blueprint {
    const centerPoint = center || this.boundingBox.center;
    const curves = scaleTransform2d(scaleFactor, centerPoint).transformCurves(this.curves);
    return new Blueprint(curves);
  }

  rotate(angle: number, center?: Point2D): Blueprint {
    const curves = rotateTransform2d(angle * DEG2RAD, center).transformCurves(this.curves);
    return new Blueprint(curves);
  }

  translate(xDist: number, yDist: number): Blueprint;
  translate(translationVector: Point2D): Blueprint;
  translate(xDistOrPoint: number | Point2D, yDist = 0): Blueprint {
    const translationVector = isPoint2D(xDistOrPoint)
      ? xDistOrPoint
      : ([xDistOrPoint, yDist] as Point2D);
    const curves = translationTransform2d(translationVector).transformCurves(this.curves);
    return new Blueprint(curves);
  }

  mirror(
    centerOrDirection: Point2D,
    origin: Point2D = [0, 0],
    mode: 'center' | 'plane' = 'center'
  ): Blueprint {
    const curves = mirrorTransform2d(centerOrDirection, origin, mode).transformCurves(this.curves);
    return new Blueprint(curves);
  }

  sketchOnPlane(inputPlane?: PlaneName | Plane, origin?: Point | number): SketchData {
    const plane =
      inputPlane instanceof Plane ? makePlane(inputPlane) : makePlane(inputPlane, origin);

    const edges = curvesAsEdgesOnPlane(this.curves, plane);
    const wire = assembleWire(edges);

    return {
      wire,
      defaultOrigin: plane.origin,
      defaultDirection: plane.zDir,
    };
  }

  sketchOnFace(face: Face, scaleMode?: ScaleMode): SketchData {
    const oc = getKernel().oc;

    const edges = unwrap(curvesAsEdgesOnFace(this.curves, face, scaleMode));
    const wire = assembleWire(edges);

    oc.BRepLib.BuildCurves3d_2(wire.wrapped);

    const wireFixer = new oc.ShapeFix_Wire_2(wire.wrapped, face.wrapped, 1e-9);
    wireFixer.FixEdgeCurves();
    wireFixer.delete();

    return { wire, baseFace: face };
  }

  subFace(face: Face, origin?: Point | null): Face {
    const sketch = this.translate(face.uvCoordinates(origin || face.center)).sketchOnFace(
      face,
      'original'
    );
    return unwrap(makeFace(sketch.wire));
  }

  punchHole(
    shape: AnyShape,
    face: SingleFace,
    {
      height = null,
      origin = null,
      draftAngle = 0,
    }: {
      height?: number | null;
      origin?: Point | null;
      draftAngle?: number;
    } = {}
  ) {
    const oc = getKernel().oc;
    const gc = GCWithScope();

    const foundFace = unwrap(getSingleFace(face, shape));
    const hole = this.subFace(foundFace, origin);

    const maker = gc(
      new oc.BRepFeat_MakeDPrism_1(
        shape.wrapped,
        hole.wrapped,
        foundFace.wrapped,
        draftAngle * DEG2RAD,
        0,
        false
      )
    );
    if (height) {
      maker.Perform_1(height);
    } else {
      maker.PerformThruAll();
    }
    return unwrap(cast(maker.Shape()));
  }

  toSVGPathD() {
    const r = GCWithScope();
    const bp = this.clone().mirror([1, 0], [0, 0], 'plane');

    const compatibleCurves = approximateAsSvgCompatibleCurve(bp.curves);

    const path = compatibleCurves.flatMap((c) => {
      return adaptedCurveToPathElem(r(c.adaptor()), c.lastPoint);
    });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const [startX, startY] = bp.curves[0]!.firstPoint;
    return `M ${round5(startX)} ${round5(startY)} ${path.join(' ')}${bp.isClosed() ? ' Z' : ''}`;
  }

  toSVGPath() {
    return `<path d="${this.toSVGPathD()}" />`;
  }

  toSVGViewBox(margin = 1) {
    return viewbox(this.boundingBox, margin);
  }

  toSVGPaths() {
    return [this.toSVGPathD()];
  }

  toSVG(margin = 1) {
    return asSVG(this.toSVGPath(), this.boundingBox, margin);
  }

  get firstPoint(): Point2D {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.curves[0]!.firstPoint;
  }

  get lastPoint(): Point2D {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.curves[this.curves.length - 1]!.lastPoint;
  }

  isInside(point: Point2D): boolean {
    if (!this.boundingBox.containsPoint(point)) return false;

    const oc = getKernel().oc;
    const intersector = new oc.Geom2dAPI_InterCurveCurve_1();
    const segment = make2dSegmentCurve(point, this.boundingBox.outsidePoint());
    let crossCounts = 0;

    const onCurve = this.curves.find((c) => c.isOnCurve(point));
    if (onCurve) return false;

    this.curves.forEach((c) => {
      if (c.boundingBox.isOut(segment.boundingBox)) return;
      intersector.Init_1(segment.wrapped, c.wrapped, 1e-9);
      crossCounts += Number(intersector.NbPoints());
    });

    intersector.delete();

    return !!(crossCounts % 2);
  }

  isClosed() {
    return samePoint(this.firstPoint, this.lastPoint);
  }

  intersects(other: Blueprint) {
    const oc = getKernel().oc;
    const intersector = new oc.Geom2dAPI_InterCurveCurve_1();

    if (this.boundingBox.isOut(other.boundingBox)) return false;

    for (const myCurve of this.curves) {
      for (const otherCurve of other.curves) {
        if (myCurve.boundingBox.isOut(otherCurve.boundingBox)) continue;

        intersector.Init_1(myCurve.wrapped, otherCurve.wrapped, 1e-9);
        if (intersector.NbPoints() || intersector.NbSegments()) return true;
      }
    }
    intersector.delete();
    return false;
  }
}
