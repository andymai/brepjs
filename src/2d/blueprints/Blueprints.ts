import type { Point2D } from '../lib/index.js';
import { BoundingBox2d } from '../lib/index.js';
import Blueprint from './Blueprint.js';
import type CompoundBlueprint from './CompoundBlueprint.js';
import type { DrawingInterface, SketchData } from './lib.js';
import { asSVG, viewbox } from './svg.js';

import type { AnyShape, Face } from '../../topology/shapes.js';

import type { Plane, PlaneName } from '../../core/planeTypes.js';
import type { PointInput } from '../../core/types.js';

import type { ScaleMode } from '../curves.js';
import type { SingleFace } from '../../query/helpers.js';

/**
 * Hold a collection of disjoint 2D profiles (simple or compound).
 *
 * Unlike {@link CompoundBlueprint}, the child blueprints here are independent
 * shapes -- none is treated as a hole in another. `Blueprints` is the typical
 * result of boolean operations that produce multiple disconnected regions.
 *
 * @see {@link Blueprint} for a single contiguous profile.
 * @see {@link CompoundBlueprint} for a profile with holes.
 */
export default class Blueprints implements DrawingInterface {
  /** The independent profiles in this collection. */
  blueprints: Array<Blueprint | CompoundBlueprint>;
  protected _boundingBox: BoundingBox2d | null;

  /** Create a collection from an array of blueprints and/or compound blueprints. */
  constructor(blueprints: Array<Blueprint | CompoundBlueprint>) {
    this.blueprints = blueprints;
    this._boundingBox = null;
  }

  /** Return a multi-line debug representation of every child blueprint. */
  get repr() {
    return ['Blueprints', ...this.blueprints.map((b) => b.repr)].join('\n');
  }

  /** Return a deep copy of this collection and all its children. */
  clone(): Blueprints {
    return new Blueprints(this.blueprints.map((bp) => bp.clone()));
  }

  /** Compute (and cache) the combined bounding box of all child blueprints. */
  get boundingBox(): BoundingBox2d {
    if (!this._boundingBox) {
      const box = new BoundingBox2d();
      this.blueprints.forEach((b) => {
        box.add(b.boundingBox);
      });
      this._boundingBox = box;
    }
    return this._boundingBox;
  }

  /** Stretch all child blueprints along a direction by a given ratio. */
  stretch(ratio: number, direction: Point2D, origin: Point2D): Blueprints {
    return new Blueprints(this.blueprints.map((bp) => bp.stretch(ratio, direction, origin)));
  }

  /** Rotate all child blueprints by an angle in degrees. */
  rotate(angle: number, center?: Point2D): Blueprints {
    return new Blueprints(this.blueprints.map((bp) => bp.rotate(angle, center)));
  }

  /** Uniformly scale all child blueprints around a center point. */
  scale(scaleFactor: number, center?: Point2D): Blueprints {
    const centerPoint = center || this.boundingBox.center;
    return new Blueprints(this.blueprints.map((bp) => bp.scale(scaleFactor, centerPoint)));
  }

  /** Translate all child blueprints by separate x/y distances or a vector. */
  translate(xDist: number, yDist: number): Blueprints;
  translate(translationVector: Point2D): Blueprints;
  translate(xDistOrPoint: number | Point2D, yDist = 0): Blueprints {
    return new Blueprints(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- overloaded translate call
      this.blueprints.map((bp) => bp.translate(xDistOrPoint as any, yDist))
    );
  }

  /** Mirror all child blueprints across a point or plane. */
  mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): Blueprints {
    return new Blueprints(this.blueprints.map((bp) => bp.mirror(centerOrDirection, origin, mode)));
  }

  /** Project all child blueprints onto a 3D plane. */
  sketchOnPlane(
    plane?: PlaneName | Plane,
    origin?: PointInput | number
  ): (SketchData | SketchData[])[] {
    return this.blueprints.map((bp) => bp.sketchOnPlane(plane, origin));
  }

  /** Map all child blueprints onto a 3D face's UV surface. */
  sketchOnFace(face: Face, scaleMode?: ScaleMode): (SketchData | SketchData[])[] {
    return this.blueprints.map((bp) => bp.sketchOnFace(face, scaleMode));
  }

  /**
   * Punch holes through a solid for each child blueprint in sequence.
   *
   * @returns The shape with all holes applied.
   */
  punchHole(
    shape: AnyShape,
    face: SingleFace,
    options: {
      height?: number;
      origin?: PointInput;
      draftAngle?: number;
    } = {}
  ) {
    let outShape = shape;
    this.blueprints.forEach((b) => {
      outShape = b.punchHole(outShape, face, options);
    });
    return outShape;
  }

  /** Compute the SVG `viewBox` attribute for this collection. */
  toSVGViewBox(margin = 1) {
    return viewbox(this.boundingBox, margin);
  }

  /** Return nested SVG path `d` string arrays -- one sub-array per child. */
  toSVGPaths() {
    return this.blueprints.map((bp) => bp.toSVGPaths());
  }

  /** Render a complete SVG document string for all child blueprints. */
  toSVG(margin = 1) {
    const elements = this.blueprints.map((bp) => {
      if (bp instanceof Blueprint) return bp.toSVGPath();
      else return bp.toSVGGroup();
    });

    return asSVG(elements.join('\n    '), this.boundingBox, margin);
  }
}
