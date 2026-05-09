import type { Plane } from '@/core/planeTypes.js';
import { unwrap } from '@/core/result.js';
import { downcast } from '@/topology/cast.js';
import { toVec3, type Vec3, type PointInput } from '@/core/types.js';
import type { ExtrusionProfile, SweepOptions } from '@/operations/extrudeUtils.js';
import type { LoftOptions } from '@/operations/loftFns.js';
import type { Face, Wire, Shape3D } from '@/core/shapeTypes.js';
import { createFace, createWire } from '@/core/shapeTypes.js';
import * as fns from './sketchFns.js';

/** Common interface for sketch-like objects that can be extruded, revolved, or lofted. */
export interface SketchInterface {
  /** Transforms the lines into a face. The lines should be closed. */
  face(): Face;
  /**
   * Revolves the drawing on an axis (defined by its direction and an origin
   * (defaults to the sketch origin)
   */
  revolve(revolutionAxis?: PointInput, config?: { origin?: PointInput }): Shape3D;
  /**
   * Extrudes the sketch to a certain distance (along the default direction
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
    extrusionConfig?: {
      extrusionDirection?: PointInput;
      extrusionProfile?: ExtrusionProfile;
      twistAngle?: number;
      origin?: PointInput;
    }
  ): Shape3D;
  /**
   * Loft between this sketch and another sketch (or an array of them)
   *
   * You can also define a `startPoint` for the loft (that will be placed
   * before this sketch) and an `endPoint` after the last one.
   *
   * You can also define if you want the loft to result in a ruled surface.
   *
   * Note that all sketches will be deleted by this operation
   */
  loftWith(otherSketches: this | this[], loftConfig: LoftOptions, returnShell?: boolean): Shape3D;
}

/**
 * Represent a closed or open wire profile with a default extrusion origin and direction.
 *
 * A Sketch wraps a single {@link Wire} and carries metadata (origin, direction,
 * optional base face) so that downstream operations like {@link Sketch.extrude},
 * {@link Sketch.revolve}, {@link Sketch.sweepSketch}, and {@link Sketch.loftWith}
 * know how to act on it without extra arguments.
 *
 * The class methods are thin delegations to the canonical functions in
 * `sketchFns.ts` (`sketchExtrude`, `sketchRevolve`, etc.). New functionality
 * should be added there.
 *
 * @remarks Most operations consume (delete) the sketch after producing a solid.
 *
 * @see {@link Sketcher} to build a Sketch interactively.
 * @see {@link CompoundSketch} for multi-wire (outer + holes) profiles.
 * @category Sketching
 */
export default class Sketch implements SketchInterface {
  wire: Wire;
  /**
   * @ignore
   */
  _defaultOrigin: Vec3;
  /**
   * @ignore
   */
  _defaultDirection: Vec3;
  protected _baseFace: Face | null | undefined;
  constructor(
    wire: Wire,
    {
      defaultOrigin = [0, 0, 0],
      defaultDirection = [0, 0, 1],
    }: {
      defaultOrigin?: PointInput;
      defaultDirection?: PointInput;
    } = {}
  ) {
    this.wire = wire;
    this._defaultOrigin = toVec3(defaultOrigin);
    this._defaultDirection = toVec3(defaultDirection);
    this.baseFace = null;
  }

  get baseFace(): Face | null | undefined {
    return this._baseFace;
  }

  set baseFace(newFace: Face | null | undefined) {
    if (this._baseFace) this._baseFace.delete();
    this._baseFace = newFace ? createFace(unwrap(downcast(newFace.wrapped))) : newFace;
  }

  /** Release all kernel resources held by this sketch. */
  delete(): void {
    this.wire.delete();
    if (this.baseFace) this.baseFace.delete();
  }

  /** Create an independent deep copy of this sketch. */
  clone(): Sketch {
    const sketch = new Sketch(createWire(unwrap(downcast(this.wire.wrapped))), {
      defaultOrigin: this.defaultOrigin,
      defaultDirection: this.defaultDirection,
    });
    if (this.baseFace) sketch.baseFace = createFace(unwrap(downcast(this.baseFace.wrapped)));
    return sketch;
  }

  /** Get the 3D origin used as default for extrusion and revolution. */
  get defaultOrigin(): Vec3 {
    return this._defaultOrigin;
  }

  /** Set the 3D origin used as default for extrusion and revolution. */
  set defaultOrigin(newOrigin: PointInput) {
    this._defaultOrigin = toVec3(newOrigin);
  }

  /** Get the default extrusion/normal direction. */
  get defaultDirection(): Vec3 {
    return this._defaultDirection;
  }

  /** Set the default extrusion/normal direction. */
  set defaultDirection(newDirection: PointInput) {
    this._defaultDirection = toVec3(newDirection);
  }

  /** Transforms the lines into a face. The lines should be closed. */
  face(): Face {
    return fns.sketchFace(this);
  }

  /** Return a clone of the underlying wire. */
  wires(): Wire {
    return fns.sketchWires(this);
  }

  /** Alias for {@link Sketch.face}. */
  faces(): Face {
    return this.face();
  }

  /**
   * Revolves the drawing on an axis (defined by its direction and an origin
   * (defaults to the sketch origin)
   *
   * @remarks Consumes the sketch — calling this twice throws on the second call.
   */
  revolve(revolutionAxis?: PointInput, config: { origin?: PointInput } = {}): Shape3D {
    return fns.sketchRevolve(this, revolutionAxis, config);
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
   *
   * @remarks Consumes the sketch — calling this twice throws on the second call.
   */
  extrude(
    extrusionDistance: number,
    config: {
      extrusionDirection?: PointInput;
      extrusionProfile?: ExtrusionProfile;
      twistAngle?: number;
      origin?: PointInput;
    } = {}
  ): Shape3D {
    return fns.sketchExtrude(this, extrusionDistance, config);
  }

  /**
   * Sweep along this sketch another sketch defined in the function
   * `sketchOnPlane`.
   *
   * @remarks Consumes both this sketch and the one returned by `sketchOnPlane` —
   * calling either consumer twice throws on the second call.
   */
  sweepSketch(
    sketchOnPlane: (plane: Plane, origin: Vec3) => this,
    sweepConfig: SweepOptions = {}
  ): Shape3D {
    return fns.sketchSweep(this, sketchOnPlane, sweepConfig);
  }

  /** Loft between this sketch and another sketch (or an array of them)
   *
   * You can also define a `startPoint` for the loft (that will be placed
   * before this sketch) and an `endPoint` after the last one.
   *
   * You can also define if you want the loft to result in a ruled surface.
   *
   * Note that all sketches will be deleted by this operation
   */
  loftWith(
    otherSketches: this | this[],
    loftConfig: LoftOptions = {},
    returnShell = false
  ): Shape3D {
    return fns.sketchLoft(this, otherSketches, loftConfig, returnShell);
  }
}
