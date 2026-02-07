import { compoundShapes, addHolesInFace, makeSolid, makeFace } from '../topology/shapeHelpers.js';
import type Sketch from './Sketch.js';

import { localGC } from '../core/memory.js';
import type { Vec3, PointInput } from '../core/types.js';
import { toVec3 } from '../core/types.js';
import { vecNormalize, vecScale } from '../core/vecOps.js';
import {
  basicFaceExtrusion,
  complexExtrude,
  twistExtrude,
  revolution,
  type ExtrusionProfile,
} from '../operations/extrude.js';
import type { LoftConfig } from '../operations/loft.js';
import type { SketchInterface } from './sketchLib.js';
import { cast, downcast } from '../topology/cast.js';
import { type Result, unwrap, isOk } from '../core/result.js';
import { bug } from '../core/errors.js';
import { Face, type Shape3D, type Shell, type Wire } from '../topology/shapes.js';
import { getKernel } from '../kernel/index.js';

const guessFaceFromWires = (wires: Wire[]): Face => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const faceBuilder = r(
    new oc.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 1e-2, 0.1, 8, 9)
  );

  wires.forEach((wire: Wire, wireIndex: number) => {
    wire.edges.forEach((edge: { wrapped: unknown }) => {
      faceBuilder.Add_1(edge.wrapped, oc.GeomAbs_Shape.GeomAbs_C0, wireIndex === 0);
    });
  });

  const progress = r(new oc.Message_ProgressRange_1());
  faceBuilder.Build(progress);
  const newFace = unwrap(cast(faceBuilder.Shape()));
  gc();

  if (!(newFace instanceof Face)) {
    bug('guessFaceFromWires', 'Failed to create a face');
  }
  return newFace;
};

const fixWire = (wire: Wire, baseFace: Face): Wire => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const wireFixer = r(new oc.ShapeFix_Wire_2(wire.wrapped, baseFace.wrapped, 1e-9));
  wireFixer.FixEdgeCurves();
  gc();
  return wire;
};

const faceFromWires = (wires: Wire[]): Face => {
  let baseFace: Face;
  let holeWires: Wire[];

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const faceResult = makeFace(wires[0]!);
  if (isOk(faceResult)) {
    baseFace = faceResult.value;
    holeWires = wires.slice(1);
  } else {
    baseFace = guessFaceFromWires(wires);
    holeWires = wires.slice(1).map((w) => fixWire(w, baseFace));
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

  /** Release all OCCT resources held by every sub-sketch. */
  delete() {
    this.sketches.forEach((sketch) => {
      sketch.delete();
    });
  }

  /** Get the outer boundary sketch (the first in the array). */
  get outerSketch() {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.sketches[0]!;
  }

  /** Get the hole sketches (all but the first). */
  get innerSketches() {
    return this.sketches.slice(1);
  }

  /** Return all wires (outer + holes) combined into a compound shape. */
  get wires() {
    const wires = this.sketches.map((s) => s.wire);
    return compoundShapes(wires);
  }

  /** Build a face from the outer boundary with inner wires subtracted as holes. */
  face() {
    const baseFace = this.outerSketch.face();
    const newFace = addHolesInFace(
      baseFace,
      this.innerSketches.map((s) => s.wire)
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
    const [, gc] = localGC();
    const rawVec: Vec3 = extrusionDirection
      ? toVec3(extrusionDirection)
      : this.outerSketch.defaultDirection;
    const normVec = vecNormalize(rawVec);
    const extrusionVec = vecScale(normVec, extrusionDistance);

    let result: Shape3D;
    if (extrusionProfile && !twistAngle) {
      result = solidFromShellGenerator(this.sketches, (sketch: Sketch) =>
        complexExtrude(
          sketch.wire,
          origin ? toVec3(origin) : this.outerSketch.defaultOrigin,
          extrusionVec,
          extrusionProfile,
          true
        )
      );
    } else if (twistAngle) {
      result = solidFromShellGenerator(this.sketches, (sketch: Sketch) =>
        twistExtrude(
          sketch.wire,
          twistAngle,
          origin ? toVec3(origin) : this.outerSketch.defaultOrigin,
          extrusionVec,
          extrusionProfile,
          true
        )
      );
    } else {
      result = basicFaceExtrusion(this.face(), extrusionVec);
    }

    gc();
    return result;
  }

  /**
   * Revolves the drawing on an axis (defined by its direction and an origin
   * (defaults to the sketch origin)
   */
  revolve(revolutionAxis?: PointInput, { origin }: { origin?: PointInput } = {}): Shape3D {
    return unwrap(
      revolution(
        this.face(),
        origin ? toVec3(origin) : this.outerSketch.defaultOrigin,
        revolutionAxis
      )
    );
  }

  /** Loft between this compound sketch and another with matching sub-sketch counts. */
  loftWith(otherCompound: this, loftConfig: LoftConfig): Shape3D {
    if (this.sketches.length !== otherCompound.sketches.length)
      bug(
        'CompoundSketch.loftWith',
        'You need to loft with another compound with the same number of sketches'
      );

    const shells: Array<Shell | Face> = this.sketches.map((base, cIndex) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const outer = otherCompound.sketches[cIndex]!;
      return base.clone().loftWith(outer.clone(), { ruled: loftConfig.ruled }, true);
    });

    const baseFaceRaw = this.face();
    const baseFace = new Face(unwrap(downcast(baseFaceRaw.wrapped)));
    shells.push(baseFace, otherCompound.face());

    return unwrap(makeSolid(shells));
  }
}
