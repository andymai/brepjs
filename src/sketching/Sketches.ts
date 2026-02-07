import type { PointInput } from '../core/types.js';
import { makeCompound } from '../topology/shapeHelpers.js';
import type { ExtrusionProfile } from '../operations/extrude.js';
import type { AnyShape } from '../core/shapeTypes.js';

import type CompoundSketch from './CompoundSketch.js';
import Sketch from './Sketch.js';

/**
 * Batch wrapper around multiple {@link Sketch} or {@link CompoundSketch} instances.
 *
 * Applies the same operation (extrude, revolve, etc.) to every contained sketch
 * and returns the results combined into a single compound shape.
 *
 * @category Sketching
 */
export default class Sketches {
  sketches: Array<Sketch | CompoundSketch>;

  constructor(sketches: Array<Sketch | CompoundSketch>) {
    this.sketches = sketches;
  }

  /** Return all wires combined into a single compound shape. */
  wires(): AnyShape {
    const wires = this.sketches.map((s) => (s instanceof Sketch ? s.wire : s.wires));
    return makeCompound(wires);
  }

  /** Return all sketch faces combined into a single compound shape. */
  faces(): AnyShape {
    const faces = this.sketches.map((s) => s.face());
    return makeCompound(faces);
  }

  /** Extrudes the sketch to a certain distance (along the default direction
   * and origin of the sketch).
   *
   * You can define another extrusion direction or origin,
   *
   * It is also possible to twist extrude with an angle (in degrees), or to
   * give a profile to the extrusion (the endFactor will scale the face, and
   * the profile will define how the scale is applied (either linearly or with
   * a s-shape).
   */
  extrude(
    extrusionDistance: number,
    extrusionConfig: {
      extrusionDirection?: PointInput;
      extrusionProfile?: ExtrusionProfile;
      twistAngle?: number;
      origin?: PointInput;
    } = {}
  ): AnyShape {
    const extruded = this.sketches.map((s) => s.extrude(extrusionDistance, extrusionConfig));

    return makeCompound(extruded);
  }

  /**
   * Revolves the drawing on an axis (defined by its direction and an origin
   * (defaults to the sketch origin)
   */
  revolve(revolutionAxis?: PointInput, config?: { origin?: PointInput }): AnyShape {
    return makeCompound(this.sketches.map((s) => s.revolve(revolutionAxis, config)));
  }
}
