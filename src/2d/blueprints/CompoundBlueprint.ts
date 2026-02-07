import type { Point2D } from '../lib/index.js';
import { BoundingBox2d } from '../lib/index.js';
import type Blueprint from './Blueprint.js';
import type { DrawingInterface, SketchData } from './lib.js';
import { asSVG, viewbox } from './svg.js';

import type { AnyShape, Face } from '../../core/shapeTypes.js';

import type { Plane, PlaneName } from '../../core/planeTypes.js';
import type { PointInput } from '../../core/types.js';

import type { ScaleMode } from '../curves.js';
import type { SingleFace } from '../../query/helpers.js';

/**
 * Represent a 2D profile with holes (an outer boundary minus inner cutouts).
 *
 * The first element of {@link blueprints} is the outer boundary; all subsequent
 * elements are holes subtracted from it. `CompoundBlueprint` implements the
 * same {@link DrawingInterface} as {@link Blueprint}, so it can be transformed,
 * sketched, and serialized to SVG in the same way.
 *
 * @see {@link Blueprint} for simple profiles without holes.
 * @see {@link Blueprints} for collections of disjoint profiles.
 */
export default class CompoundBlueprint implements DrawingInterface {
  /**
   * Ordered array where `blueprints[0]` is the outer boundary and the
   * remaining entries are inner holes.
   */
  blueprints: Blueprint[];
  protected _boundingBox: BoundingBox2d | null;

  /**
   * Create a compound blueprint from an outer boundary and optional holes.
   *
   * @param blueprints - First element is the outer boundary; subsequent
   *   elements are holes.
   * @throws Error if the array is empty.
   */
  constructor(blueprints: Blueprint[]) {
    if (blueprints.length === 0) {
      throw new Error('CompoundBlueprint requires at least one blueprint (the outer boundary)');
    }
    this.blueprints = blueprints;
    this._boundingBox = null;
  }

  /** Return a deep copy of this compound blueprint and all its children. */
  clone(): CompoundBlueprint {
    return new CompoundBlueprint(this.blueprints.map((bp) => bp.clone()));
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

  /** Return a multi-line debug representation showing outline and holes. */
  get repr() {
    return [
      'Compound Blueprints',
      '-- Outline',
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.blueprints[0]!.repr,
      '-- Holes',
      ...this.blueprints.slice(1).map((b) => b.repr),
    ].join('\n');
  }

  /** Stretch all child blueprints along a direction by a given ratio. */
  stretch(ratio: number, direction: Point2D, origin: Point2D): CompoundBlueprint {
    return new CompoundBlueprint(this.blueprints.map((bp) => bp.stretch(ratio, direction, origin)));
  }

  /** Rotate all child blueprints by an angle in degrees. */
  rotate(angle: number, center?: Point2D): CompoundBlueprint {
    return new CompoundBlueprint(this.blueprints.map((bp) => bp.rotate(angle, center)));
  }

  /** Uniformly scale all child blueprints around a center point. */
  scale(scaleFactor: number, center?: Point2D): CompoundBlueprint {
    const centerPoint = center || this.boundingBox.center;
    return new CompoundBlueprint(this.blueprints.map((bp) => bp.scale(scaleFactor, centerPoint)));
  }

  /** Translate all child blueprints by separate x/y distances or a vector. */
  translate(xDist: number, yDist: number): CompoundBlueprint;
  translate(translationVector: Point2D): CompoundBlueprint;
  translate(xDistOrPoint: number | Point2D, yDist = 0): CompoundBlueprint {
    return new CompoundBlueprint(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- overloaded translate call
      this.blueprints.map((bp) => bp.translate(xDistOrPoint as any, yDist))
    );
  }

  /** Mirror all child blueprints across a point or plane. */
  mirror(
    centerOrDirection: Point2D,
    origin?: Point2D,
    mode?: 'center' | 'plane'
  ): CompoundBlueprint {
    return new CompoundBlueprint(
      this.blueprints.map((bp) => bp.mirror(centerOrDirection, origin, mode))
    );
  }

  /** Project all child blueprints onto a 3D plane.
   *
   * @returns One {@link SketchData} per child blueprint (outer boundary + holes).
   */
  sketchOnPlane(plane?: PlaneName | Plane, origin?: PointInput | number): SketchData[] {
    return this.blueprints.map((blueprint) => blueprint.sketchOnPlane(plane, origin));
  }

  /** Map all child blueprints onto a 3D face's UV surface.
   *
   * @returns One {@link SketchData} per child blueprint.
   */
  sketchOnFace(face: Face, scaleMode?: ScaleMode): SketchData[] {
    return this.blueprints.map((blueprint) => blueprint.sketchOnFace(face, scaleMode));
  }

  /**
   * Punch a hole through a solid using the outer boundary of this compound.
   *
   * @remarks Only the outer boundary (`blueprints[0]`) is used for the hole.
   */
  punchHole(
    shape: AnyShape,
    face: SingleFace,
    options: {
      height?: number;
      origin?: PointInput;
      draftAngle?: number;
    } = {}
  ): AnyShape {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.blueprints[0]!.punchHole(shape, face, options);
  }

  /** Compute the SVG `viewBox` attribute for this compound blueprint. */
  toSVGViewBox(margin = 1) {
    return viewbox(this.boundingBox, margin);
  }

  /** Return SVG path `d` strings for every child blueprint. */
  toSVGPaths() {
    return this.blueprints.flatMap((bp) => bp.toSVGPaths());
  }

  /** Wrap all child SVG paths in a `<g>` group element string. */
  toSVGGroup() {
    return `<g>${this.blueprints.map((b) => b.toSVGPath()).join('')}</g>`;
  }

  /** Render a complete SVG document string for this compound blueprint. */
  toSVG(margin = 1) {
    return asSVG(this.toSVGGroup(), this.boundingBox, margin);
  }
}
