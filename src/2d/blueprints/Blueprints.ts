import type { Point2D } from '../lib/index.js';
import { BoundingBox2d } from '../lib/index.js';
import Blueprint from './Blueprint.js';
import type CompoundBlueprint from './CompoundBlueprint.js';
import type { DrawingInterface } from './lib.js';
import { asSVG, viewbox } from './svg.js';

import type { AnyShape, Face } from '../../topology/shapes.js';

import type { Plane, PlaneName, Point } from '../../core/geometry.js';

import type { ScaleMode } from '../curves.js';
import type { SingleFace } from '../../query/helpers.js';

export default class Blueprints implements DrawingInterface {
  blueprints: Array<Blueprint | CompoundBlueprint>;
  protected _boundingBox: BoundingBox2d | null;
  constructor(blueprints: Array<Blueprint | CompoundBlueprint>) {
    this.blueprints = blueprints;
    this._boundingBox = null;
  }

  get repr() {
    return ['Blueprints', ...this.blueprints.map((b) => b.repr)].join('\n');
  }

  clone() {
    return new Blueprints(this.blueprints);
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

  stretch(ratio: number, direction: Point2D, origin: Point2D): Blueprints {
    return new Blueprints(this.blueprints.map((bp) => bp.stretch(ratio, direction, origin)));
  }

  rotate(angle: number, center?: Point2D): Blueprints {
    return new Blueprints(this.blueprints.map((bp) => bp.rotate(angle, center)));
  }

  scale(scaleFactor: number, center?: Point2D): Blueprints {
    const centerPoint = center || this.boundingBox.center;
    return new Blueprints(this.blueprints.map((bp) => bp.scale(scaleFactor, centerPoint)));
  }

  translate(xDist: number, yDist: number): Blueprints;
  translate(translationVector: Point2D): Blueprints;
  translate(xDistOrPoint: number | Point2D, yDist = 0): Blueprints {
    return new Blueprints(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- overloaded translate call
      this.blueprints.map((bp) => bp.translate(xDistOrPoint as any, yDist))
    );
  }

  mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): Blueprints {
    return new Blueprints(this.blueprints.map((bp) => bp.mirror(centerOrDirection, origin, mode)));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sketch types not yet ported
  sketchOnPlane(plane?: PlaneName | Plane, origin?: Point | number): any {
    return this.blueprints.map((bp) => bp.sketchOnPlane(plane, origin));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sketch types not yet ported
  sketchOnFace(face: Face, scaleMode?: ScaleMode): any {
    return this.blueprints.map((bp) => bp.sketchOnFace(face, scaleMode));
  }

  punchHole(
    shape: AnyShape,
    face: SingleFace,
    options: {
      height?: number;
      origin?: Point;
      draftAngle?: number;
    } = {}
  ) {
    let outShape = shape;
    this.blueprints.forEach((b) => {
      outShape = b.punchHole(outShape, face, options);
    });
    return outShape;
  }

  toSVGViewBox(margin = 1) {
    return viewbox(this.boundingBox, margin);
  }

  toSVGPaths() {
    return this.blueprints.map((bp) => bp.toSVGPaths());
  }

  toSVG(margin = 1) {
    const elements = this.blueprints.map((bp) => {
      if (bp instanceof Blueprint) return bp.toSVGPath();
      else return bp.toSVGGroup();
    });

    return asSVG(elements.join('\n    '), this.boundingBox, margin);
  }
}
