import { firstOrThrow } from '@/utils/arrayAccess.js';
import type Sketch from './sketch.js';
import type { PointInput } from '@/core/types.js';
import type { ExtrusionProfile } from '@/operations/extrudeUtils.js';
import type { LoftOptions } from '@/operations/loftFns.js';
import type { SketchInterface } from './sketch.js';
import { bug } from '@/core/errors.js';
import type { Face, Shape3D } from '@/core/shapeTypes.js';
import * as fns from './sketchFns.js';

/**
 * Represent a face with holes as a group of sketches (one outer + zero or more inner).
 *
 * All contained sketches must share the same base surface. The first sketch is
 * treated as the outer boundary; subsequent sketches define holes.
 *
 * Typically produced from a {@link CompoundBlueprint} via `sketchOnPlane`.
 *
 * The class methods are thin delegations to the canonical functions in
 * `sketchFns.ts` (`compoundSketchExtrude`, `compoundSketchRevolve`, etc.).
 *
 * @see {@link Sketch} for single-wire profiles without holes.
 * @category Sketching
 */
export default class CompoundSketch implements SketchInterface {
  sketches: Sketch[];
  constructor(sketches: Sketch[]) {
    if (sketches.length === 0) {
      bug('CompoundSketch', 'Cannot create CompoundSketch with an empty array of sketches');
    }
    this.sketches = sketches;
  }

  /** Release all kernel resources held by every sub-sketch. */
  delete() {
    this.sketches.forEach((sketch) => {
      sketch.delete();
    });
  }

  /** Get the outer boundary sketch (the first in the array). */
  get outerSketch() {
    return firstOrThrow(this.sketches);
  }

  /** Get the hole sketches (all but the first). */
  get innerSketches() {
    return this.sketches.slice(1);
  }

  /**
   * All wires (outer + holes) combined into a compound shape.
   *
   * @remarks Allocates a **fresh** compound on every access (via `makeCompound`)
   * — it is a caller-owned kernel resource, not a cheap accessor. Dispose the
   * returned compound (`using`/`.delete()` → `Symbol.dispose`) or it leaks an
   * arena slot on arena kernels. The sub-sketch wires themselves belong to this
   * CompoundSketch and are freed with it.
   */
  get wires() {
    return fns.compoundSketchWires(this);
  }

  /** Build a face from the outer boundary with inner wires subtracted as holes. */
  face(): Face {
    return fns.compoundSketchFace(this);
  }

  /**
   * Extrude the compound face (with holes) along the default or given direction.
   *
   * Supports twist and profile extrusions. For twist/profile modes each
   * sub-sketch is extruded as a shell, then capped into a solid.
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
    return fns.compoundSketchExtrude(this, extrusionDistance, config);
  }

  /**
   * Revolves the drawing on an axis (defined by its direction and an origin
   * (defaults to the sketch origin)
   */
  revolve(revolutionAxis?: PointInput, config: { origin?: PointInput } = {}): Shape3D {
    return fns.compoundSketchRevolve(this, revolutionAxis, config);
  }

  /**
   * Loft between this compound sketch and another with matching sub-sketch
   * counts. The target must itself be a compound sketch — lofting a
   * face-with-holes profile to a single-wire one has no defined meaning.
   */
  loftWith(
    otherCompound: SketchInterface | SketchInterface[],
    loftConfig: LoftOptions = {}
  ): Shape3D {
    if (Array.isArray(otherCompound) || !(otherCompound instanceof CompoundSketch))
      return bug(
        'CompoundSketch.loftWith',
        'A compound (face-with-holes) sketch can only loft to another compound sketch with the same number of sub-sketches.'
      );
    return fns.compoundSketchLoft(this, otherCompound, loftConfig);
  }

  /** Sweeping a face-with-holes profile has no single well-defined spine. */
  sweepSketch(): Shape3D {
    return bug(
      'CompoundSketch.sweepSketch',
      'Sweeping a compound (face-with-holes) profile is not supported — sweep its outer Sketch instead.'
    );
  }
}
