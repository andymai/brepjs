import { makeCompound, addHolesInFace, makeSolid, makeFace } from '@/topology/shapeHelpers.js';
import { firstOrThrow, getAtOrThrow } from '@/utils/arrayAccess.js';
import type Sketch from './sketch.js';

import type { Vec3, PointInput } from '@/core/types.js';
import { toVec3 } from '@/core/types.js';
import { vecNormalize, vecScale } from '@/core/vecOps.js';
import { extrude, revolve } from '@/operations/extrudeFns.js';
import { complexExtrude, twistExtrude } from '@/operations/sweepFns.js';
import type { ExtrusionProfile } from '@/operations/extrudeUtils.js';
import type { LoftOptions } from '@/operations/loftFns.js';
import type { SketchInterface } from './sketchLib.js';
import { cast, downcast } from '@/topology/cast.js';
import { type Result, unwrap, isOk } from '@/core/result.js';
import { bug } from '@/core/errors.js';
import type {
  ClosedWire,
  OrientedFace,
  Face,
  Shape3D,
  Shell,
  Wire,
  PlanarWire,
} from '@/core/shapeTypes.js';
import type { PlanarFace } from '@/core/validityTypes.js';
import { createFace, isFace } from '@/core/shapeTypes.js';
import { getKernel } from '@/kernel/index.js';

const guessFaceFromWires = (wires: Wire[]): Face => {
  const wireShapes = wires.map((w) => w.wrapped);
  const newFace = unwrap(cast(getKernel().fillSurface(wireShapes)));

  if (!isFace(newFace)) {
    bug('guessFaceFromWires', 'Failed to create a face');
  }
  return newFace as Face;
};

const fixWire = (wire: Wire, baseFace: Face): Wire => {
  getKernel().fixWireOnFace(wire.wrapped, baseFace.wrapped, 1e-9);
  return wire;
};

const faceFromWires = (wires: Wire[]): Face => {
  let baseFace: Face;
  let holeWires: ClosedWire[];

  // Sweep end-cap wires are always closed boundaries
  const faceResult = makeFace(firstOrThrow(wires) as ClosedWire & PlanarWire);
  if (isOk(faceResult)) {
    baseFace = faceResult.value;
    holeWires = wires.slice(1) as ClosedWire[];
  } else {
    baseFace = guessFaceFromWires(wires);
    holeWires = wires.slice(1).map((w) => fixWire(w, baseFace)) as ClosedWire[];
  }

  return addHolesInFace(baseFace, holeWires);
};

const solidFromShellGenerator = (
  sketches: Sketch[],
  shellGenerator: (sketch: Sketch) => Result<[Shape3D, Wire, Wire]>
): Shape3D => {
  const shells: Shell[] = [];
  const startWires: Wire[] = [];
  const endWires: Wire[] = [];

  sketches.forEach((sketch) => {
    const [shell, startWire, endWire] = unwrap(shellGenerator(sketch));
    shells.push(shell as Shell);
    startWires.push(startWire);
    endWires.push(endWire);
  });

  const startFace = faceFromWires(startWires);
  const endFace = faceFromWires(endWires);
  const solid = unwrap(makeSolid([startFace, ...shells, endFace]));

  return solid;
};

/**
 * Represent a face with holes as a group of sketches (one outer + zero or more inner).
 *
 * All contained sketches must share the same base surface. The first sketch is
 * treated as the outer boundary; subsequent sketches define holes.
 *
 * Typically produced from a {@link CompoundBlueprint} via `sketchOnPlane`.
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

  /** Return all wires (outer + holes) combined into a compound shape. */
  get wires() {
    const wires = this.sketches.map((s) => s.wire);
    return makeCompound(wires);
  }

  /** Build a face from the outer boundary with inner wires subtracted as holes. */
  face() {
    const baseFace = this.outerSketch.face();
    // Sketch wires are always closed by construction
    const newFace = addHolesInFace(
      baseFace,
      this.innerSketches.map((s) => s.wire as ClosedWire & PlanarWire)
    );

    return newFace;
  }

  /**
   * Extrude the compound face (with holes) along the default or given direction.
   *
   * Supports twist and profile extrusions. For twist/profile modes each
   * sub-sketch is extruded as a shell, then capped into a solid.
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
    const rawVec: Vec3 = extrusionDirection
      ? toVec3(extrusionDirection)
      : this.outerSketch.defaultDirection;
    const normVec = vecNormalize(rawVec);
    const extrusionVec = vecScale(normVec, extrusionDistance);

    let result: Shape3D;
    if (extrusionProfile && !twistAngle) {
      result = solidFromShellGenerator(
        this.sketches,
        (sketch: Sketch) =>
          complexExtrude(
            sketch.wire as ClosedWire & PlanarWire,
            origin ? toVec3(origin) : this.outerSketch.defaultOrigin,
            extrusionVec,
            extrusionProfile,
            true
          ) as Result<[Shape3D, Wire, Wire]>
      );
    } else if (twistAngle) {
      result = solidFromShellGenerator(
        this.sketches,
        (sketch: Sketch) =>
          twistExtrude(
            sketch.wire as ClosedWire & PlanarWire,
            twistAngle,
            origin ? toVec3(origin) : this.outerSketch.defaultOrigin,
            extrusionVec,
            extrusionProfile,
            true
          ) as Result<[Shape3D, Wire, Wire]>
      );
    } else {
      // planar by construction: sketch operates on XY plane
      result = unwrap(extrude(this.face() as OrientedFace & PlanarFace, extrusionVec));
    }

    return result;
  }

  /**
   * Revolves the drawing on an axis (defined by its direction and an origin
   * (defaults to the sketch origin)
   */
  revolve(revolutionAxis?: PointInput, { origin }: { origin?: PointInput } = {}): Shape3D {
    const center = origin ? toVec3(origin) : this.outerSketch.defaultOrigin;
    const dir = revolutionAxis ? toVec3(revolutionAxis) : ([0, 0, 1] as Vec3);
    // planar by construction: sketch operates on XY plane
    return unwrap(revolve(this.face() as OrientedFace & PlanarFace, center, dir));
  }

  /** Loft between this compound sketch and another with matching sub-sketch counts. */
  loftWith(otherCompound: this, loftConfig: LoftOptions): Shape3D {
    if (this.sketches.length !== otherCompound.sketches.length)
      bug(
        'CompoundSketch.loftWith',
        'You need to loft with another compound with the same number of sketches'
      );

    const shells: Array<Shell | Face> = this.sketches.map((base, cIndex) => {
      const outer = getAtOrThrow(otherCompound.sketches, cIndex);
      const loftOpts: LoftOptions = {};
      if (loftConfig.ruled !== undefined) loftOpts.ruled = loftConfig.ruled;
      return base.clone().loftWith(outer.clone(), loftOpts, true) as Shell;
    });

    const baseFaceRaw = this.face();
    const baseFace = createFace(unwrap(downcast(baseFaceRaw.wrapped)));
    shells.push(baseFace, otherCompound.face());

    return unwrap(makeSolid(shells));
  }
}
