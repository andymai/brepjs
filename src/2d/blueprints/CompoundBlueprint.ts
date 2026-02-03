import type { Point2D } from '../lib/index.js';
import { BoundingBox2d } from '../lib/index.js';
import type Blueprint from './Blueprint.js';
import type { DrawingInterface, SketchData } from './lib.js';
import { asSVG, viewbox } from './svg.js';

import type { AnyShape, Face } from '../../topology/shapes.js';

import type { Plane, PlaneName, Point } from '../../core/geometry.js';

import type { ScaleMode } from '../curves.js';
import type { SingleFace } from '../../query/helpers.js';

export default class CompoundBlueprint implements DrawingInterface {
  blueprints: Blueprint[];
  protected _boundingBox: BoundingBox2d | null;

  constructor(blueprints: Blueprint[]) {
    this.blueprints = blueprints;
    this._boundingBox = null;
  }

  clone(): CompoundBlueprint {
    return new CompoundBlueprint(this.blueprints.map((bp) => bp.clone()));
  }

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

  stretch(ratio: number, direction: Point2D, origin: Point2D): CompoundBlueprint {
    return new CompoundBlueprint(this.blueprints.map((bp) => bp.stretch(ratio, direction, origin)));
  }

  rotate(angle: number, center?: Point2D): CompoundBlueprint {
    return new CompoundBlueprint(this.blueprints.map((bp) => bp.rotate(angle, center)));
  }

  scale(scaleFactor: number, center?: Point2D): CompoundBlueprint {
    const centerPoint = center || this.boundingBox.center;
    return new CompoundBlueprint(this.blueprints.map((bp) => bp.scale(scaleFactor, centerPoint)));
  }

  translate(xDist: number, yDist: number): CompoundBlueprint;
  translate(translationVector: Point2D): CompoundBlueprint;
  translate(xDistOrPoint: number | Point2D, yDist = 0): CompoundBlueprint {
    return new CompoundBlueprint(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- overloaded translate call
      this.blueprints.map((bp) => bp.translate(xDistOrPoint as any, yDist))
    );
  }

  mirror(
    centerOrDirection: Point2D,
    origin?: Point2D,
    mode?: 'center' | 'plane'
  ): CompoundBlueprint {
    return new CompoundBlueprint(
      this.blueprints.map((bp) => bp.mirror(centerOrDirection, origin, mode))
    );
  }

  sketchOnPlane(plane?: PlaneName | Plane, origin?: Point | number): SketchData[] {
    return this.blueprints.map((blueprint) => blueprint.sketchOnPlane(plane, origin));
  }

  sketchOnFace(face: Face, scaleMode?: ScaleMode): SketchData[] {
    return this.blueprints.map((blueprint) => blueprint.sketchOnFace(face, scaleMode));
  }

  punchHole(
    shape: AnyShape,
    face: SingleFace,
    options: {
      height?: number;
      origin?: Point;
      draftAngle?: number;
    } = {}
  ): AnyShape {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.blueprints[0]!.punchHole(shape, face, options);
  }

  toSVGViewBox(margin = 1) {
    return viewbox(this.boundingBox, margin);
  }

  toSVGPaths() {
    return this.blueprints.flatMap((bp) => bp.toSVGPaths());
  }

  toSVGGroup() {
    return `<g>${this.blueprints.map((b) => b.toSVGPath()).join('')}</g>`;
  }

  toSVG(margin = 1) {
    return asSVG(this.toSVGGroup(), this.boundingBox, margin);
  }
}
