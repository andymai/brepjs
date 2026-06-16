import type { PointInput, Vec3 } from '@/core/types.js';
import { makeCompound } from '@/topology/shapeHelpers.js';
import type { ExtrusionProfile, SweepOptions } from '@/operations/extrudeUtils.js';
import type { LoftOptions } from '@/operations/loftFns.js';
import type { Plane } from '@/core/planeTypes.js';
import type { Compound, Face, Shape3D } from '@/core/shapeTypes.js';
import { bug } from '@/core/errors.js';
import { firstOrThrow } from '@/utils/arrayAccess.js';

import type CompoundSketch from './compoundSketch.js';
import Sketch, { type SketchInterface } from './sketch.js';

/**
 * Batch wrapper around multiple {@link Sketch} or {@link CompoundSketch} instances.
 *
 * Applies the same operation (extrude, revolve, etc.) to every contained sketch
 * and returns the results combined into a single compound shape.
 *
 * Implements {@link SketchInterface} so it is interchangeable with a single
 * {@link Sketch} in the chained `Drawing.sketchOnPlane(...).extrude()` style.
 * Operations with no per-profile batch meaning (`face`, `loftWith`,
 * `sweepSketch`) require a single contained profile and otherwise throw.
 *
 * @category Sketching
 */
export default class Sketches implements SketchInterface {
  sketches: Array<Sketch | CompoundSketch>;

  constructor(sketches: Array<Sketch | CompoundSketch>) {
    this.sketches = sketches;
  }

  /**
   * The sole contained {@link Sketch}, for operations that have no
   * multi-profile meaning. Throws when there is more than one profile, or when
   * the single profile is a compound (face-with-holes) sketch.
   */
  private soleSketch(op: string): Sketch {
    if (this.sketches.length !== 1)
      bug(`Sketches.${op}`, `Multiple profiles — ${op} each sub-sketch individually.`);
    const only = firstOrThrow(this.sketches);
    if (!(only instanceof Sketch))
      bug(`Sketches.${op}`, `${op} is only supported on single-wire profiles.`);
    return only;
  }

  /** Build a face from the sole contained profile (see {@link Sketches.faces}). */
  face(): Face {
    if (this.sketches.length !== 1)
      bug('Sketches.face', 'Multiple profiles — use faces() to combine them.');
    return firstOrThrow(this.sketches).face();
  }

  /** Loft from the sole contained profile to one or more other sketches. */
  loftWith(
    otherSketches: SketchInterface | SketchInterface[],
    loftConfig?: LoftOptions,
    returnShell?: boolean
  ): Shape3D {
    return this.soleSketch('loftWith').loftWith(otherSketches, loftConfig, returnShell);
  }

  /** Sweep a profile along the sole contained sketch's wire. */
  sweepSketch(
    sketchOnPlane: (plane: Plane, origin: Vec3) => SketchInterface,
    sweepConfig?: SweepOptions
  ): Shape3D {
    return this.soleSketch('sweepSketch').sweepSketch(sketchOnPlane, sweepConfig);
  }

  /** Return all wires combined into a single compound shape. */
  wires(): Compound {
    const wires = this.sketches.map((s) => (s instanceof Sketch ? s.wire : s.wires));
    return makeCompound(wires);
  }

  /** Return all sketch faces combined into a single compound shape. */
  faces(): Compound {
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
  ): Compound {
    const extruded = this.sketches.map((s) => s.extrude(extrusionDistance, extrusionConfig));

    return makeCompound(extruded);
  }

  /**
   * Revolves the drawing on an axis (defined by its direction and an origin
   * (defaults to the sketch origin)
   */
  revolve(revolutionAxis?: PointInput, config?: { origin?: PointInput }): Compound {
    return makeCompound(this.sketches.map((s) => s.revolve(revolutionAxis, config)));
  }
}
