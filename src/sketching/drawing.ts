import { bug } from '@/core/errors.js';
import type { ApproximationOptions } from '@/2d/lib/index.js';
import { BoundingBox2d, deserializeCurve2D, type Point2D } from '@/2d/lib/index.js';
import {
  Blueprint,
  cut2D,
  intersect2D,
  fuse2D,
  type ScaleMode,
  type Shape2D,
  Blueprints,
  CompoundBlueprint,
} from '@/2d/blueprints/index.js';
import type { Plane, PlaneName } from '@/core/planeTypes.js';
import type { PointInput } from '@/core/types.js';
import type { AnyShape, Dimension, Face } from '@/core/shapeTypes.js';
import type { SketchInterface } from './sketch.js';
import Sketches from './sketches.js';
import type { SketchData } from '@/2d/blueprints/lib.js';

import offsetFn, { type Offset2DConfig } from '@/2d/blueprints/blueprintOffset.js';
import { cornerFinder, type CornerFinderFn } from '@/query/finderFns.js';
import { fillet2D, chamfer2D } from '@/2d/blueprints/blueprintCustomCorners.js';
import { approximateForSVG } from '@/2d/blueprints/blueprintApproximations.js';
import type { SingleFace } from '@/query/helpers.js';
import { wrapSketchData, wrapSketchDataArray } from './sketchFns.js';

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
    return new Drawing(
      typeof xDistOrPoint === 'number'
        ? this.innerShape.translate(xDistOrPoint, yDist)
        : this.innerShape.translate(xDistOrPoint)
    );
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
    shape: AnyShape<Dimension>,
    faceFinder: SingleFace,
    options: {
      height?: number;
      origin?: PointInput;
      draftAngle?: number;
    } = {}
  ): AnyShape<Dimension> {
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
