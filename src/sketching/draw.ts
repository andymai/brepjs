import { unwrap } from '../core/result.js';
import { bug } from '../core/errors.js';
import { localGC } from '../core/memory.js';
import type { ApproximationOptions } from '../2d/lib/index.js';
import {
  BoundingBox2d,
  deserializeCurve2D,
  make2dCircle,
  make2dEllipse,
  make2dInerpolatedBSplineCurve,
  make2dSegmentCurve,
  type Point2D,
  samePoint,
  stitchCurves,
} from '../2d/lib/index.js';
import {
  Blueprint,
  cut2D,
  intersect2D,
  fuse2D,
  polysidesBlueprint,
  roundedRectangleBlueprint,
  type ScaleMode,
  type Shape2D,
  Blueprints,
  CompoundBlueprint,
} from '../2d/blueprints/index.js';
import type { Plane, PlaneName } from '../core/planeTypes.js';
import type { PointInput } from '../core/types.js';
import type { AnyShape, Edge, Face, Wire } from '../core/shapeTypes.js';
import { createFace } from '../core/shapeTypes.js';
import { outerWire } from '../topology/faceFns.js';
import { getEdges } from '../topology/shapeFns.js';
import { makeFace } from '../topology/shapeHelpers.js';
import { downcast } from '../topology/cast.js';
import { BaseSketcher2d } from './Sketcher2d.js';
import type { SketchInterface } from './sketchLib.js';
import Sketches from './Sketches.js';
import type { GenericSketcher } from './sketcherlib.js';
import type { SketchData } from '../2d/blueprints/lib.js';
import { textBlueprints } from '../text/textBlueprints.js';
import type { ProjectionPlane } from '../projection/projectionPlanes.js';
import { type Camera, cameraFromPlane, projectEdges } from '../projection/cameraFns.js';

import offsetFn, { type Offset2DConfig } from '../2d/blueprints/offset.js';
import { cornerFinder, type CornerFinderFn } from '../query/finderFns.js';
import { fillet2D, chamfer2D } from '../2d/blueprints/customCorners.js';
import { edgeToCurve } from '../2d/curves.js';
import type { BSplineApproximationOptions } from '../topology/shapeHelpers.js';
import { approximateForSVG } from '../2d/blueprints/approximations.js';
import type { SingleFace } from '../query/helpers.js';
import { wrapSketchData, wrapSketchDataArray } from './sketchUtils.js';

function wrapBlueprintResult(
  shape: Shape2D,
  result: SketchData | SketchData[] | (SketchData | SketchData[])[]
): SketchInterface | Sketches {
  if (shape instanceof Blueprint) {
    return wrapSketchData(result as SketchData);
  } else if (shape instanceof CompoundBlueprint) {
    return wrapSketchDataArray(result as SketchData[]);
  } else {
    // Blueprints — array of (SketchData | SketchData[])
    const items = result as (SketchData | SketchData[])[];
    return new Sketches(
      items.map((item) => (Array.isArray(item) ? wrapSketchDataArray(item) : wrapSketchData(item)))
    );
  }
}

/**
 * @categoryDescription Drawing
 *
 * Drawing are shapes in the 2D space. You can either use a "builder pen" to
 * draw a shape, or use some of the canned shapes like circles or rectangles.
 */

/**
 * Immutable wrapper around a 2D shape ({@link Blueprint}, {@link CompoundBlueprint}, or {@link Blueprints}).
 *
 * A Drawing can be transformed (translate, rotate, scale, mirror), combined
 * with Boolean operations (cut, fuse, intersect), filleted/chamfered,
 * serialized, and ultimately projected onto a 3D plane via `sketchOnPlane`.
 *
 * @example
 * ```ts
 * const profile = drawRectangle(40, 20)
 *   .fillet(3)
 *   .cut(drawCircle(5).translate(10, 0));
 * const sketch = profile.sketchOnPlane("XY");
 * ```
 *
 * @category Drawing
 */
export class Drawing {
  private readonly innerShape: Shape2D;

  constructor(innerShape: Shape2D = null) {
    this.innerShape = innerShape;
  }

  /** Create an independent deep copy of this drawing. */
  clone(): Drawing {
    return new Drawing(this.innerShape?.clone() || null);
  }

  /** Serialize the drawing to a JSON string for persistence or transfer. */
  serialize(): string {
    if (!this.innerShape) {
      return JSON.stringify({ type: 'Empty' });
    }

    // walk the tree of blueprints
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recursive serialization
    function serializeHelper(shape: Shape2D): any {
      if (shape instanceof CompoundBlueprint) {
        return {
          type: 'CompoundBlueprint',
          blueprints: shape.blueprints.map(serializeHelper),
        };
      } else if (shape instanceof Blueprints) {
        return {
          type: 'Blueprints',
          blueprints: shape.blueprints.map(serializeHelper),
        };
      } else if (shape instanceof Blueprint) {
        return {
          type: 'Blueprint',
          curves: shape.curves.map((c) => c.serialize()),
        };
      } else {
        bug('Drawing.serialize', 'Unknown shape type for serialization');
      }
    }

    return JSON.stringify(serializeHelper(this.innerShape));
  }

  /** Get the axis-aligned 2D bounding box of this drawing. */
  get boundingBox(): BoundingBox2d {
    if (!this.innerShape) return new BoundingBox2d();
    return this.innerShape.boundingBox;
  }

  /** Stretch the drawing by a ratio along a direction from an origin point. */
  stretch(ratio: number, direction: Point2D, origin: Point2D): Drawing {
    if (!this.innerShape) return new Drawing();
    return new Drawing(this.innerShape.stretch(ratio, direction, origin));
  }

  /** Return a human-readable string representation of the drawing. */
  get repr(): string {
    if (this.innerShape === null) return '=== empty shape';
    return this.innerShape.repr;
  }

  /** Rotate the drawing by an angle (in degrees) around an optional center point. */
  rotate(angle: number, center?: Point2D): Drawing {
    if (!this.innerShape) return new Drawing();
    return new Drawing(this.innerShape.rotate(angle, center));
  }

  /** Translate the drawing by horizontal and vertical distances. */
  translate(xDist: number, yDist: number): Drawing;
  /** Translate the drawing by a 2D vector. */
  translate(translationVector: Point2D): Drawing;
  translate(xDistOrPoint: number | Point2D, yDist = 0): Drawing {
    if (!this.innerShape) return new Drawing();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- overloaded translate signature
    return new Drawing(this.innerShape.translate(xDistOrPoint as any, yDist));
  }

  /** Uniformly scale the drawing by a factor around an optional center point. */
  scale(scaleFactor: number, center?: Point2D): Drawing {
    if (!this.innerShape) return new Drawing();
    return new Drawing(this.innerShape.scale(scaleFactor, center));
  }

  /** Mirror the drawing about a point or a line defined by direction and origin. */
  mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): Drawing {
    if (!this.innerShape) return new Drawing();
    return new Drawing(this.innerShape.mirror(centerOrDirection, origin, mode));
  }

  /**
   * Builds a new drawing by cutting another drawing into this one
   *
   * @category Drawing Modifications
   */
  cut(other: Drawing): Drawing {
    return new Drawing(cut2D(this.innerShape, other.innerShape));
  }

  /**
   * Builds a new drawing by merging another drawing into this one
   *
   * @category Drawing Modifications
   */
  fuse(other: Drawing): Drawing {
    return new Drawing(fuse2D(this.innerShape, other.innerShape));
  }

  /**
   * Builds a new drawing by intersection this drawing with another
   *
   * @category Drawing Modifications
   */
  intersect(other: Drawing): Drawing {
    return new Drawing(intersect2D(this.innerShape, other.innerShape));
  }

  /**
   * Creates a new drawing with some corners filleted, as specified by the
   * radius and the corner finder function
   *
   * @category Drawing Modifications
   */
  fillet(radius: number, filter?: (c: CornerFinderFn) => CornerFinderFn): Drawing {
    const finder = filter && filter(cornerFinder());
    return new Drawing(fillet2D(this.innerShape, radius, finder));
  }

  /**
   * Creates a new drawing with some corners chamfered, as specified by the
   * radius and the corner finder function
   *
   * @category Drawing Modifications
   */
  chamfer(radius: number, filter?: (c: CornerFinderFn) => CornerFinderFn): Drawing {
    const finder = filter && filter(cornerFinder());
    return new Drawing(chamfer2D(this.innerShape, radius, finder));
  }

  /** Project this drawing onto a 3D plane, producing a Sketch or Sketches. */
  sketchOnPlane(inputPlane: Plane): SketchInterface | Sketches;
  /** Project this drawing onto a named plane at an optional origin. */
  sketchOnPlane(inputPlane?: PlaneName, origin?: PointInput | number): SketchInterface | Sketches;
  sketchOnPlane(
    inputPlane?: PlaneName | Plane,
    origin?: PointInput | number
  ): SketchInterface | Sketches {
    if (!this.innerShape) bug('Drawing', 'Trying to sketch an empty drawing');
    const result = this.innerShape.sketchOnPlane(inputPlane, origin);
    return wrapBlueprintResult(this.innerShape, result);
  }

  /** Project this drawing onto a 3D face surface with the given scale mode. */
  sketchOnFace(face: Face, scaleMode: ScaleMode): SketchInterface | Sketches {
    if (!this.innerShape) bug('Drawing', 'Trying to sketch an empty drawing');
    const result = this.innerShape.sketchOnFace(face, scaleMode);
    return wrapBlueprintResult(this.innerShape, result);
  }

  /** Punch the drawing's profile as a hole through a 3D shape on the given face. */
  punchHole(
    shape: AnyShape,
    faceFinder: SingleFace,
    options: {
      height?: number;
      origin?: PointInput;
      draftAngle?: number;
    } = {}
  ): AnyShape {
    if (!this.innerShape) return shape;
    return this.innerShape.punchHole(shape, faceFinder, options);
  }

  /** Export the drawing as a complete SVG string. */
  toSVG(margin?: number): string {
    return this.innerShape?.toSVG(margin) || '';
  }

  /** Return the SVG `viewBox` attribute string for this drawing. */
  toSVGViewBox(margin = 1): string {
    return this.innerShape?.toSVGViewBox(margin) || '';
  }

  /** Return the SVG `<path>` `d` attribute strings for this drawing. */
  toSVGPaths(): string[] | string[][] {
    return this.innerShape?.toSVGPaths() || [];
  }

  /** Offset the drawing contour by a signed distance (positive = outward). */
  offset(distance: number, offsetConfig: Offset2DConfig = {}): Drawing {
    return new Drawing(offsetFn(this.innerShape, distance, offsetConfig));
  }

  /** Approximate the drawing curves for a target format (currently only `'svg'`). */
  approximate(target: 'svg' | 'arcs', options: ApproximationOptions = {}): Drawing {
    if (target !== 'svg') {
      bug('Drawing.approximate', "Only 'svg' is supported for now");
    }
    return new Drawing(approximateForSVG(this.innerShape, options));
  }

  /** Access the underlying {@link Blueprint}, throwing if the drawing is compound. */
  get blueprint(): Blueprint {
    if (!(this.innerShape instanceof Blueprint)) {
      if (
        this.innerShape instanceof Blueprints &&
        this.innerShape.blueprints.length === 1 &&
        this.innerShape.blueprints[0] instanceof Blueprint
      ) {
        return this.innerShape.blueprints[0];
      }
      bug('Drawing.blueprint', 'This drawing is not a blueprint');
    }
    return this.innerShape;
  }
}

/**
 * DrawingPen is a helper class to draw in 2D. It is used to create drawings
 * by exposing a builder interface. It is not a drawing itself, but it can be
 * used to create a drawing.
 *
 * @category Drawing
 */
export class DrawingPen extends BaseSketcher2d implements GenericSketcher<Drawing> {
  constructor(origin: Point2D = [0, 0]) {
    super();
    this.pointer = origin;
    this.firstPoint = origin;

    this.pendingCurves = [];
  }

  /** Finish drawing and return the resulting {@link Drawing} (does not close the path). */
  done(): Drawing {
    return new Drawing(new Blueprint(this.pendingCurves));
  }

  /** Close the path with a straight line to the start point and return the Drawing. */
  close(): Drawing {
    this._closeSketch();
    return this.done();
  }

  /** Close the path by mirroring all curves about the line from first to last point. */
  closeWithMirror(): Drawing {
    this._closeWithMirror();
    return this.close();
  }

  /**
   * Close the path and apply a custom corner treatment between the last and first segments.
   *
   * @param radius - Fillet/chamfer radius.
   * @param mode - Corner treatment type.
   * @returns The closed {@link Drawing}.
   */
  closeWithCustomCorner(radius: number, mode: 'fillet' | 'chamfer' = 'fillet'): Drawing {
    this._closeSketch();
    this._customCornerLastWithFirst(radius, mode);

    return this.done();
  }
}

/**
 * Deserializes a drawing from a string. String is expected to be in the format
 * generated by `Drawing.serialize()`.
 */
export function deserializeDrawing(data: string): Drawing {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recursive deserialization
  function deserializeHelper(json: any): Shape2D {
    if (json['type'] === 'CompoundBlueprint') {
      const blueprints = json['blueprints'].map(deserializeHelper);
      return new CompoundBlueprint(blueprints);
    } else if (json['type'] === 'Blueprints') {
      const blueprints = json['blueprints'].map(deserializeHelper);
      return new Blueprints(blueprints);
    } else if (json['type'] === 'Blueprint') {
      const curves = json['curves'].map((c: string) => deserializeCurve2D(c));
      return new Blueprint(curves);
    } else {
      bug('Drawing.deserialize', 'Unknown shape type for deserialization');
    }
  }

  const json = JSON.parse(data);
  const shape = deserializeHelper(json);
  return new Drawing(shape);
}

/**
 * Creates a drawing pen to programatically draw in 2D.
 *
 * @category Drawing
 */
export function draw(initialPoint?: Point2D): DrawingPen {
  const pen = new DrawingPen();
  if (initialPoint) {
    pen.movePointerTo(initialPoint);
  }
  return pen;
}

/**
 * Creates the `Drawing` of a rectangle with (optional) rounded corners.
 *
 * The rectangle is centered on [0, 0]
 *
 * @category Drawing
 */
export function drawRoundedRectangle(
  width: number,
  height: number,
  r: number | { rx?: number; ry?: number } = 0
): Drawing {
  return new Drawing(roundedRectangleBlueprint(width, height, r));
}
/** Alias for {@link drawRoundedRectangle}. Creates a rectangle (sharp corners when `r` is 0). */
export const drawRectangle = drawRoundedRectangle;

/**
 * Creates the `Drawing` of a circle as one single curve.
 *
 * The circle is centered on [0, 0]
 *
 * @category Drawing
 */
export function drawSingleCircle(radius: number): Drawing {
  return new Drawing(new Blueprint([make2dCircle(radius)]));
}

/**
 * Creates the `Drawing` of an ellipse as one single curve.
 *
 * The ellipse is centered on [0, 0], with axes aligned with the coordinates.
 *
 * @category Drawing
 */
export function drawSingleEllipse(majorRadius: number, minorRadius: number): Drawing {
  const [minor, major] = [majorRadius, minorRadius].sort((a, b) => a - b) as [number, number];
  const direction: Point2D = major === majorRadius ? [1, 0] : [0, 1];

  return new Drawing(new Blueprint([make2dEllipse(major, minor, direction)]));
}

/**
 * Creates the `Drawing` of a circle.
 *
 * The circle is centered on [0, 0]
 *
 * @category Drawing
 */
export function drawCircle(radius: number): Drawing {
  return draw()
    .movePointerTo([-radius, 0])
    .sagittaArc(2 * radius, 0, radius)
    .sagittaArc(-2 * radius, 0, radius)
    .close();
}

/**
 * Creates the `Drawing` of an ellipse.
 *
 * The ellipse is centered on [0, 0], with axes aligned with the coordinates.
 *
 * @category Drawing
 */
export function drawEllipse(majorRadius: number, minorRadius: number): Drawing {
  return draw()
    .movePointerTo([-majorRadius, 0])
    .halfEllipse(2 * majorRadius, 0, minorRadius)
    .halfEllipse(-2 * majorRadius, 0, minorRadius)
    .close();
}

/**
 * Creates the `Drawing` of a polygon in a defined plane
 *
 * The sides of the polygon can be arcs of circle with a defined sagitta.
 * The radius defines the outer radius of the polygon without sagitta
 *
 * @category Drawing
 */
export function drawPolysides(radius: number, sidesCount: number, sagitta = 0): Drawing {
  return new Drawing(polysidesBlueprint(radius, sidesCount, sagitta));
}

/**
 * Creates the `Drawing` of a text, in a defined font size and a font family
 * (which will be the default).
 *
 * @category Drawing
 */
export function drawText(
  text: string,
  { startX = 0, startY = 0, fontSize = 16, fontFamily = 'default' } = {}
): Drawing {
  return new Drawing(textBlueprints(text, { startX, startY, fontSize, fontFamily }));
}

/**
 * Creates the `Drawing` by interpolating points as a curve
 *
 * The drawing will be a spline approximating the points. Note that the
 * degree should be at maximum 3 if you need to export the drawing as an SVG.
 *
 * @category Drawing
 */
export const drawPointsInterpolation = (
  points: Point2D[],
  approximationConfig: BSplineApproximationOptions = {},
  options: {
    closeShape?: boolean;
  } = {}
): Drawing => {
  if (points.length < 2) {
    bug(
      'drawPointsInterpolation',
      `Need at least 2 points for interpolation, got ${points.length}`
    );
  }
  const curves = [unwrap(make2dInerpolatedBSplineCurve(points, approximationConfig))];
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  if (options.closeShape && firstPoint && lastPoint && !samePoint(firstPoint, lastPoint)) {
    curves.push(make2dSegmentCurve(lastPoint, firstPoint));
  }

  return new Drawing(new Blueprint(curves));
};

/**
 * Creates the `Drawing` of parametric function
 *
 * The drawing will be a spline approximating the function. Note that the
 * degree should be at maximum 3 if you need to export the drawing as an SVG.
 *
 * @category Drawing
 */
export const drawParametricFunction = (
  func: (t: number) => Point2D,
  { pointsCount = 400, start = 0, stop = 1, closeShape = false } = {},
  approximationConfig: BSplineApproximationOptions = {}
): Drawing => {
  const stepSize = (stop - start) / pointsCount;
  const points = [...Array(pointsCount + 1).keys()].map((t) => {
    return func(start + t * stepSize);
  });

  return drawPointsInterpolation(points, approximationConfig, { closeShape });
};

const edgesToDrawing = (edges: Edge[]): Drawing => {
  const [r, gc] = localGC();
  const planeSketch = drawRectangle(1000, 1000).sketchOnPlane() as SketchInterface & {
    wire: Wire;
  };
  const planeFace = r(unwrap(makeFace(planeSketch.wire)));

  const curves = edges.map((e) => edgeToCurve(e, planeFace));
  gc();

  const stitchedCurves = stitchCurves(curves).map((s) => new Blueprint(s));
  if (stitchedCurves.length === 0) return new Drawing();
  if (stitchedCurves.length === 1) return new Drawing(stitchedCurves[0]);

  return new Drawing(new Blueprints(stitchedCurves));
};

/**
 * Creates the `Drawing` of a projection of a shape on a plane.
 *
 * The projection is done by projecting the edges of the shape on the plane.
 *
 * @category Drawing
 */
export function drawProjection(
  shape: AnyShape,
  projectionCamera: ProjectionPlane | Camera = 'front'
): { visible: Drawing; hidden: Drawing } {
  let camera: Camera;
  if (typeof projectionCamera === 'string') {
    camera = unwrap(cameraFromPlane(projectionCamera));
  } else {
    camera = projectionCamera;
  }

  const { visible, hidden } = projectEdges(shape, camera);

  return {
    visible: edgesToDrawing(visible),
    hidden: edgesToDrawing(hidden),
  };
}

/**
 * Creates the `Drawing` out of a face
 *
 * @category Drawing
 */
export function drawFaceOutline(face: Face): Drawing {
  const [r, gc] = localGC();
  const clonedFace = r(createFace(unwrap(downcast(face.wrapped))));
  const faceOuterWire = r(outerWire(clonedFace));
  const curves = getEdges(faceOuterWire).map((e) => edgeToCurve(e, face));
  gc();

  const stitchedCurves = stitchCurves(curves).map((s) => new Blueprint(s));
  if (stitchedCurves.length === 0) return new Drawing();
  if (stitchedCurves.length === 1) return new Drawing(stitchedCurves[0]);

  return new Drawing(new Blueprints(stitchedCurves));
}
