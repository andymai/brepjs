import type { Plane } from '../core/planeTypes.js';
import { createPlane } from '../core/planeOps.js';
import { localGC } from '../core/memory.js';
import { makeFace, makeNewFaceWithinFace } from '../topology/shapeHelpers.js';
import { unwrap } from '../core/result.js';
import { toVec3, type Vec3, type PointInput } from '../core/types.js';
import { vecScale, vecNormalize, vecCross } from '../core/vecOps.js';
import {
  basicFaceExtrusion,
  complexExtrude,
  twistExtrude,
  revolution,
  genericSweep,
  type ExtrusionProfile,
  type GenericSweepConfig,
} from '../operations/extrude.js';
import { loft, type LoftConfig } from '../operations/loft.js';
import { type Face, type Shape3D, type Wire } from '../topology/shapes.js';
import type { SketchInterface } from './sketchLib.js';

/**
 * A line drawing to be acted upon. It defines directions to be acted upon by
 * definition (extrusion direction for instance).
 *
 * Note that all operations will delete the sketch
 *
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
    this._baseFace = newFace ? newFace.clone() : newFace;
  }

  delete(): void {
    this.wire.delete();
    // _defaultOrigin and _defaultDirection are Vec3 tuples - no need to delete
    if (this.baseFace) this.baseFace.delete();
  }

  clone(): Sketch {
    const sketch = new Sketch(this.wire.clone(), {
      defaultOrigin: this.defaultOrigin,
      defaultDirection: this.defaultDirection,
    });
    if (this.baseFace) sketch.baseFace = this.baseFace.clone();
    return sketch;
  }

  get defaultOrigin(): Vec3 {
    return this._defaultOrigin;
  }

  set defaultOrigin(newOrigin: PointInput) {
    this._defaultOrigin = toVec3(newOrigin);
  }

  get defaultDirection(): Vec3 {
    return this._defaultDirection;
  }

  set defaultDirection(newDirection: PointInput) {
    this._defaultDirection = toVec3(newDirection);
  }

  /**
   * Transforms the lines into a face. The lines should be closed.
   */
  face(): Face {
    let face;
    if (!this.baseFace) {
      face = unwrap(makeFace(this.wire));
    } else {
      face = makeNewFaceWithinFace(this.baseFace, this.wire);
    }
    return face;
  }

  wires(): Wire {
    return this.wire.clone();
  }

  faces(): Face {
    return this.face();
  }

  /**
   * Revolves the drawing on an axis (defined by its direction and an origin
   * (defaults to the sketch origin)
   */
  revolve(revolutionAxis?: PointInput, { origin }: { origin?: PointInput } = {}): Shape3D {
    const face = unwrap(makeFace(this.wire));
    const solid = unwrap(revolution(face, origin || this.defaultOrigin, revolutionAxis));
    face.delete();
    this.delete();
    return solid;
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
    {
      extrusionDirection,
      extrusionProfile,
      twistAngle,
      origin,
    }: {
      extrusionDirection?: PointInput;
      extrusionProfile?: ExtrusionProfile;
      twistAngle?: number;
      origin?: PointInput;
    } = {}
  ): Shape3D {
    const gc = localGC()[1];

    const direction: Vec3 = extrusionDirection ? toVec3(extrusionDirection) : this.defaultDirection;
    const extrusionVec = vecScale(vecNormalize(direction), extrusionDistance);

    const originVec: Vec3 = origin ? toVec3(origin) : this.defaultOrigin;

    if (extrusionProfile && !twistAngle) {
      const solid = unwrap(
        complexExtrude(this.wire, [...originVec], [...extrusionVec], extrusionProfile)
      );
      gc();
      this.delete();
      return solid;
    }

    if (twistAngle) {
      const solid = unwrap(
        twistExtrude(this.wire, twistAngle, [...originVec], [...extrusionVec], extrusionProfile)
      );
      gc();
      this.delete();
      return solid;
    }

    const face = unwrap(makeFace(this.wire));
    const solid = basicFaceExtrusion(face, [...extrusionVec]);

    gc();
    this.delete();
    return solid;
  }

  /**
   * Sweep along this sketch another sketch defined in the function
   * `sketchOnPlane`.
   */
  sweepSketch(
    sketchOnPlane: (plane: Plane, origin: Vec3) => this,
    sweepConfig: GenericSweepConfig = {}
  ): Shape3D {
    const startPoint = this.wire.startPoint;
    const tangent = this.wire.tangentAt(1e-9);
    const normal = vecNormalize(vecScale(tangent, -1));
    const defaultDir: Vec3 = this.defaultDirection;
    const xDir = vecScale(vecCross(normal, defaultDir), -1);

    const sketch = sketchOnPlane(createPlane([...startPoint], [...xDir], [...normal]), [
      ...startPoint,
    ]);

    const config: GenericSweepConfig = {
      forceProfileSpineOthogonality: true,
      ...sweepConfig,
    };
    if (this.baseFace) {
      config.support = this.baseFace.wrapped;
    }
    const shape = unwrap(genericSweep(sketch.wire, this.wire, config));
    this.delete();

    return shape;
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
    loftConfig: LoftConfig = {},
    returnShell = false
  ): Shape3D {
    const sketchArray = Array.isArray(otherSketches)
      ? [this, ...otherSketches]
      : [this, otherSketches];
    const shape = unwrap(
      loft(
        sketchArray.map((s) => s.wire),
        loftConfig,
        returnShell
      )
    );

    sketchArray.forEach((s) => {
      s.delete();
    });
    return shape;
  }
}
