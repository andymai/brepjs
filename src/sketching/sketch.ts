import type { Plane } from '@/core/planeTypes.js';
import { createPlane } from '@/core/planeOps.js';
import { makeFace, makeNewFaceWithinFace } from '@/topology/shapeHelpers.js';
import { unwrap } from '@/core/result.js';
import { downcast } from '@/topology/cast.js';
import { toVec3, type Vec3, type PointInput } from '@/core/types.js';
import { vecScale, vecNormalize, vecCross } from '@/core/vecOps.js';
import { extrude, revolve } from '@/operations/extrudeFns.js';
import { sweep, complexExtrude, twistExtrude } from '@/operations/sweepFns.js';
import type { ExtrusionProfile, SweepOptions } from '@/operations/extrudeUtils.js';
import { loft } from '@/operations/loftFns.js';
import type { LoftOptions } from '@/operations/loftFns.js';
import type { ClosedWire, Face, Wire, Shape3D, PlanarWire } from '@/core/shapeTypes.js';
import { createFace, createWire } from '@/core/shapeTypes.js';
import { curveStartPoint, curveTangentAt } from '@/topology/curveFns.js';

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
    // _defaultOrigin and _defaultDirection are Vec3 tuples - no need to delete
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

  /**
   * Transforms the lines into a face. The lines should be closed.
   */
  face(): Face {
    let face;
    // Sketch wires are always closed by construction
    const closedWire = this.wire as ClosedWire & PlanarWire;
    if (!this.baseFace) {
      face = unwrap(makeFace(closedWire));
    } else {
      face = makeNewFaceWithinFace(this.baseFace, closedWire);
    }
    return face;
  }

  /** Return a clone of the underlying wire. */
  wires(): Wire {
    return createWire(unwrap(downcast(this.wire.wrapped)));
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
  revolve(revolutionAxis?: PointInput, { origin }: { origin?: PointInput } = {}): Shape3D {
    const face = unwrap(makeFace(this.wire as ClosedWire & PlanarWire));
    const center: Vec3 = origin ? toVec3(origin) : this.defaultOrigin;
    const dir: Vec3 = revolutionAxis ? toVec3(revolutionAxis) : [0, 0, 1];
    const solid = unwrap(revolve(face, center, dir));
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
   *
   * @remarks Consumes the sketch — calling this twice throws on the second call.
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
    const direction: Vec3 = extrusionDirection ? toVec3(extrusionDirection) : this.defaultDirection;
    const extrusionVec = vecScale(vecNormalize(direction), extrusionDistance);

    const originVec: Vec3 = origin ? toVec3(origin) : this.defaultOrigin;

    if (extrusionProfile && !twistAngle) {
      const solid = unwrap(
        complexExtrude(
          this.wire as ClosedWire & PlanarWire,
          [...originVec],
          [...extrusionVec],
          extrusionProfile
        )
      );
      this.delete();
      return solid as Shape3D;
    }

    if (twistAngle) {
      const solid = unwrap(
        twistExtrude(
          this.wire as ClosedWire & PlanarWire,
          twistAngle,
          [...originVec],
          [...extrusionVec],
          extrusionProfile
        )
      );
      this.delete();
      return solid as Shape3D;
    }

    const face = unwrap(makeFace(this.wire as ClosedWire & PlanarWire));
    const solid = unwrap(extrude(face, [...extrusionVec]));

    this.delete();
    return solid;
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
    const startPoint = curveStartPoint(this.wire);
    const tangent = curveTangentAt(this.wire, 1e-9);
    const normal = vecNormalize(vecScale(tangent, -1));
    const defaultDir: Vec3 = this.defaultDirection;
    const xDir = vecScale(vecCross(normal, defaultDir), -1);

    const result = sketchOnPlane(createPlane([...startPoint], [...xDir], [...normal]), [
      ...startPoint,
    ]);

    // The callback may return a Sketches (plural) when the Drawing used a
    // 2D boolean that split the profile into multiple pieces. Extract the
    // first sketch's wire and dispose the rest to prevent WASM leaks.
    // Duck-type check avoids circular import (sketches.ts imports Sketch).
    let sketch: Sketch;
    if ('sketches' in result && Array.isArray((result as { sketches: unknown[] }).sketches)) {
      const pieces = (result as { sketches: Sketch[] }).sketches;
      sketch = pieces[0] as Sketch;
      for (let i = 1; i < pieces.length; i++) {
        pieces[i]?.delete();
      }
    } else {
      sketch = result;
    }

    const config: SweepOptions = {
      forceProfileSpineOthogonality: true,
      ...sweepConfig,
    };
    if (this.baseFace) {
      config.support = this.baseFace.wrapped;
    }
    const shape = unwrap(sweep(sketch.wire as ClosedWire, this.wire, config)) as Shape3D;
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
    loftConfig: LoftOptions = {},
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
