import type { KernelShape } from '@/kernel/types.js';
import { firstOrThrow, lastOrThrow, getAtOrThrow } from '@/utils/arrayAccess.js';
import { makePlane } from '@/core/planeOps.js';
import type { ScaleMode } from '@/2d/curves.js';
import {
  curvesAsEdgesOnFace,
  curvesAsEdgesOnPlane,
  curvesBoundingBox,
  transformCurves,
  mirrorTransform2d,
  rotateTransform2d,
  stretchTransform2d,
  scaleTransform2d,
  translationTransform2d,
} from '@/2d/curves.js';
import type { Point2D, BoundingBox2d, Curve2D } from '@/2d/lib/index.js';
import {
  adaptedCurveToPathElem,
  make2dSegmentCurve,
  samePoint,
  isPoint2D,
  approximateAsSvgCompatibleCurve,
} from '@/2d/lib/index.js';
import type { AnyShape, ClosedWire, Dimension, Face, PlanarWire, Wire } from '@/core/shapeTypes.js';
import { createWire } from '@/core/shapeTypes.js';
import { cast } from '@/topology/cast.js';
import { unwrap } from '@/core/result.js';
import { bug } from '@/core/errors.js';
import { faceCenter, uvCoordinates } from '@/topology/faceFns.js';

import { getKernel } from '@/kernel/index.js';
import { makeFace } from '@/topology/shapeHelpers.js';
import type { Plane, PlaneName } from '@/core/planeTypes.js';
import type { PointInput } from '@/core/types.js';
import { toVec3 } from '@/core/types.js';
import { DEG2RAD } from '@/core/constants.js';
import type { DrawingInterface, SketchData } from './lib.js';
import { round5 } from '@/utils/precisionRound.js';
import { asSVG, viewbox } from './svg.js';
import type { SingleFace } from '@/query/helpers.js';
import { getSingleFace } from '@/query/helpers.js';

/**
 * Assembles a list of edges into a wire.
 */
function assembleWire(listOfEdges: { wrapped: unknown }[]): Wire {
  const edgeShapes = listOfEdges.map((e) => e.wrapped) as KernelShape[];
  return createWire(getKernel().makeWire(edgeShapes));
}

/**
 * Represent a closed or open 2D profile as an ordered list of curves.
 *
 * A Blueprint is the fundamental 2D drawing primitive: it stores an ordered
 * sequence of {@link Curve2D} segments that together describe a planar profile.
 * Blueprints can be transformed (translate, rotate, scale, mirror, stretch),
 * projected onto 3D planes or faces, combined with boolean operations, and
 * serialized to SVG.
 *
 * Create instances via {@link BlueprintSketcher} rather than calling the
 * constructor directly.
 *
 * @example
 * ```ts
 * const bp = new BlueprintSketcher()
 *   .movePointerTo([0, 0])
 *   .lineTo([10, 0])
 *   .lineTo([10, 10])
 *   .lineTo([0, 10])
 *   .close();
 *
 * // sketchOnPlane returns SketchData (wire + metadata), not a Face
 * const sketch = bp.sketchOnPlane("XY");
 * ```
 *
 * @see {@link CompoundBlueprint} for blueprints with holes.
 * @see {@link Blueprints} for collections of disjoint blueprints.
 * @see {@link createBlueprint} for the functional API equivalent.
 */
export default class Blueprint implements DrawingInterface {
  /** Ordered 2D curve segments that compose this blueprint. */
  curves: Curve2D[];
  protected _boundingBox: null | BoundingBox2d;
  private readonly _orientation: null | 'clockwise' | 'counterClockwise';
  private _guessedOrientation: null | 'clockwise' | 'counterClockwise';
  /** Create a blueprint from an ordered array of 2D curves.
   *
   * @throws BrepBugError if the curves array is empty (use {@link createBlueprint} for Result-based validation).
   */
  constructor(curves: Curve2D[]) {
    if (curves.length === 0) {
      bug(
        'Blueprint',
        'requires at least one curve — use createBlueprint() for Result-based validation'
      );
    }
    this.curves = curves;
    this._boundingBox = null;

    this._orientation = null;
    this._guessedOrientation = null;
  }

  /** Release WASM resources held by the underlying curves and bounding box. */
  delete() {
    this.curves.forEach((c) => {
      c.delete();
    });
    if (this._boundingBox) this._boundingBox.delete();
  }

  [Symbol.dispose](): void {
    this.delete();
  }

  /** Return a deep copy of this blueprint. */
  clone(): Blueprint {
    return new Blueprint(this.curves.map((c) => c.clone()));
  }

  /** Return a multi-line string representation for debugging. */
  get repr() {
    return ['Blueprint', ...this.curves.map((c) => c.repr)].join('\n');
  }

  /** Compute (and cache) the axis-aligned bounding box of all curves. */
  get boundingBox(): BoundingBox2d {
    if (!this._boundingBox) {
      this._boundingBox = curvesBoundingBox(this.curves);
    }
    return this._boundingBox;
  }

  /** Determine the winding direction of the blueprint via the shoelace formula.
   *
   * @remarks Uses an approximation based on curve midpoints for non-linear
   * segments. The result is cached after the first call.
   */
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
        const v2 = getAtOrThrow(vertices, (i + 1) % vertices.length);
        return (v2[0] - v1[0]) * (v2[1] + v1[1]);
      })
      .reduce((a, b) => a + b, 0);

    this._guessedOrientation = approximateArea > 0 ? 'clockwise' : 'counterClockwise';
    return this._guessedOrientation;
  }

  /**
   * Stretch the blueprint along a direction by a given ratio.
   *
   * @param ratio - Stretch factor (1 = unchanged).
   * @param direction - Unit direction vector to stretch along.
   * @param origin - Fixed point of the stretch (defaults to the origin).
   * @returns A new stretched Blueprint.
   */
  stretch(ratio: number, direction: Point2D, origin: Point2D = [0, 0]): Blueprint {
    const curves = transformCurves(this.curves, stretchTransform2d(ratio, direction, origin));
    return new Blueprint(curves);
  }

  /**
   * Uniformly scale the blueprint around a center point.
   *
   * @param scaleFactor - Scale multiplier (>1 enlarges, <1 shrinks).
   * @param center - Center of scaling (defaults to the bounding box center).
   * @returns A new scaled Blueprint.
   */
  scale(scaleFactor: number, center?: Point2D): Blueprint {
    const centerPoint = center || this.boundingBox.center;
    const curves = transformCurves(this.curves, scaleTransform2d(scaleFactor, centerPoint));
    return new Blueprint(curves);
  }

  /**
   * Rotate the blueprint by an angle in degrees.
   *
   * @param angle - Rotation angle in degrees (positive = counter-clockwise).
   * @param center - Center of rotation (defaults to the origin).
   * @returns A new rotated Blueprint.
   */
  rotate(angle: number, center?: Point2D): Blueprint {
    const curves = transformCurves(this.curves, rotateTransform2d(angle * DEG2RAD, center));
    return new Blueprint(curves);
  }

  /**
   * Translate the blueprint by separate x/y distances or a vector.
   *
   * @returns A new translated Blueprint.
   */
  translate(xDist: number, yDist: number): Blueprint;
  translate(translationVector: Point2D): Blueprint;
  translate(xDistOrPoint: number | Point2D, yDist = 0): Blueprint {
    const translationVector = isPoint2D(xDistOrPoint)
      ? xDistOrPoint
      : ([xDistOrPoint, yDist] as Point2D);
    const curves = transformCurves(this.curves, translationTransform2d(translationVector));
    return new Blueprint(curves);
  }

  /**
   * Mirror the blueprint across a point or plane.
   *
   * @param centerOrDirection - Mirror center (center mode) or plane normal (plane mode).
   * @param origin - Origin for plane-mode mirroring.
   * @param mode - `'center'` for point symmetry, `'plane'` for reflection across an axis.
   * @returns A new mirrored Blueprint.
   */
  mirror(
    centerOrDirection: Point2D,
    origin: Point2D = [0, 0],
    mode: 'center' | 'plane' = 'center'
  ): Blueprint {
    const curves = transformCurves(this.curves, mirrorTransform2d(centerOrDirection, origin, mode));
    return new Blueprint(curves);
  }

  /**
   * Project this 2D blueprint onto a 3D plane, producing a wire and metadata.
   *
   * @param inputPlane - Named plane (`"XY"`, `"XZ"`, etc.) or a custom Plane.
   * @param origin - Origin offset; a number sets the offset along the plane normal.
   * @returns Sketch data containing the projected wire and default orientation.
   */
  sketchOnPlane(inputPlane?: PlaneName | Plane, origin?: PointInput | number): SketchData {
    const plane =
      inputPlane && typeof inputPlane !== 'string'
        ? { ...inputPlane }
        : makePlane(inputPlane, origin);

    const edges = curvesAsEdgesOnPlane(this.curves, plane);
    const wire = assembleWire(edges);

    return {
      wire,
      defaultOrigin: plane.origin,
      defaultDirection: plane.zDir,
    };
  }

  /**
   * Map this 2D blueprint onto a 3D face's UV surface.
   *
   * @param face - Target face to project onto.
   * @param scaleMode - How UV coordinates are interpreted (`'original'`, `'bounds'`, or `'native'`).
   * @returns Sketch data containing the wire mapped onto the face.
   */
  sketchOnFace(face: Face, scaleMode?: ScaleMode): SketchData {
    const kernel = getKernel();

    const edges = unwrap(curvesAsEdgesOnFace(this.curves, face, scaleMode));
    const wire = assembleWire(edges);

    kernel.buildCurves3d(wire.wrapped);
    const fixedWire = kernel.fixWireOnFace(wire.wrapped, face.wrapped, 1e-9);
    wire.delete();

    return { wire: createWire(fixedWire), baseFace: face };
  }

  /**
   * Create a face on a target face's surface defined by this blueprint's profile.
   *
   * @param face - The face whose surface the sub-face lies on.
   * @param origin - Optional UV origin offset (defaults to the face center).
   * @returns A new Face bounded by the blueprint's profile.
   */
  private subFace(face: Face, origin?: PointInput | null): Face {
    const originPoint = origin || [...faceCenter(face)];
    const originVec3 = toVec3(originPoint);
    const sketch = this.translate(uvCoordinates(face, originVec3)).sketchOnFace(face, 'original');
    // Blueprint sketch wires are always closed profiles
    return unwrap(makeFace(sketch.wire as ClosedWire & PlanarWire));
  }

  /**
   * Cut a prism-shaped hole through a solid along a face using this blueprint.
   *
   * @param shape - The solid to punch through.
   * @param face - The face on which the hole profile is placed.
   * @param options - Optional hole parameters.
   * @param options.height - Hole depth; `null` (default) cuts through the entire solid.
   * @param options.origin - UV origin on the face for the blueprint placement.
   * @param options.draftAngle - Taper angle in degrees (0 = straight hole).
   * @returns The modified shape with the hole removed.
   */
  punchHole(
    shape: AnyShape<Dimension>,
    face: SingleFace,
    {
      height = null,
      origin = null,
      draftAngle = 0,
    }: {
      height?: number | null;
      origin?: PointInput | null;
      draftAngle?: number;
    } = {}
  ) {
    const foundFace = unwrap(getSingleFace(face, shape));
    const hole = this.subFace(foundFace, origin);

    const result = getKernel().draftPrism(
      shape.wrapped,
      hole.wrapped,
      foundFace.wrapped,
      height,
      draftAngle,
      false
    );
    return unwrap(cast(result));
  }

  /** Convert the blueprint to an SVG path `d` attribute string. */
  toSVGPathD() {
    const bp = this.clone().mirror([1, 0], [0, 0], 'plane');

    const compatibleCurves = approximateAsSvgCompatibleCurve(bp.curves);

    const path = compatibleCurves.flatMap((c) => {
      return adaptedCurveToPathElem(c, c.lastPoint);
    });

    const [startX, startY] = firstOrThrow(bp.curves).firstPoint;
    return `M ${round5(startX)} ${round5(startY)} ${path.join(' ')}${bp.isClosed() ? ' Z' : ''}`;
  }

  /** Wrap the SVG path data in a `<path>` element string. */
  toSVGPath() {
    return `<path d="${this.toSVGPathD()}" />`;
  }

  /**
   * Compute the SVG `viewBox` attribute for this blueprint.
   *
   * @param margin - Extra padding around the bounding box in drawing units.
   */
  toSVGViewBox(margin = 1) {
    return viewbox(this.boundingBox, margin);
  }

  /** Return the SVG path `d` strings for this blueprint as an array. */
  toSVGPaths() {
    return [this.toSVGPathD()];
  }

  /**
   * Render a complete SVG document string for this blueprint.
   *
   * @param margin - Extra padding around the bounding box in drawing units.
   */
  toSVG(margin = 1) {
    return asSVG(this.toSVGPath(), this.boundingBox, margin);
  }

  /** Get the start point of the first curve. */
  get firstPoint(): Point2D {
    return firstOrThrow(this.curves).firstPoint;
  }

  /** Get the end point of the last curve. */
  get lastPoint(): Point2D {
    return lastOrThrow(this.curves).lastPoint;
  }

  /**
   * Test whether a 2D point lies inside this closed blueprint.
   *
   * Uses ray-casting (intersection counting) against a segment from the point
   * to a location guaranteed to be outside the bounding box.
   *
   * @remarks Returns `false` for points on the boundary.
   * @returns `true` if the point is strictly inside the blueprint.
   */
  isInside(point: Point2D): boolean {
    if (!this.boundingBox.containsPoint(point)) return false;

    const kernel = getKernel();
    const segment = make2dSegmentCurve(point, this.boundingBox.outsidePoint());

    try {
      const onCurve = this.curves.find((c) => c.isOnCurve(point));
      if (onCurve) return false;

      const seen: Point2D[] = [];
      let crossCounts = 0;

      this.curves.forEach((c) => {
        if (c.boundingBox.isOut(segment.boundingBox)) return;
        const result = kernel.intersectCurves2d(segment.wrapped, c.wrapped, 1e-9);
        for (const pt of result.points) {
          if (!seen.some((s) => samePoint(s, pt, 1e-9))) {
            seen.push(pt);
            crossCounts++;
          }
        }
        for (const seg of result.segments) {
          seg.delete();
        }
      });

      return !!(crossCounts % 2);
    } finally {
      segment.delete();
    }
  }

  /** Check whether the first and last points coincide (the profile is closed). */
  isClosed() {
    return samePoint(this.firstPoint, this.lastPoint);
  }

  /**
   * Test whether this blueprint's curves intersect with another blueprint's curves.
   *
   * @remarks Uses bounding-box pre-filtering for early rejection.
   */
  intersects(other: Blueprint) {
    if (this.boundingBox.isOut(other.boundingBox)) return false;

    const kernel = getKernel();
    for (const myCurve of this.curves) {
      for (const otherCurve of other.curves) {
        if (myCurve.boundingBox.isOut(otherCurve.boundingBox)) continue;

        const result = kernel.intersectCurves2d(myCurve.wrapped, otherCurve.wrapped, 1e-9);
        if (result.points.length || result.segments.length) return true;
      }
    }
    return false;
  }
}
