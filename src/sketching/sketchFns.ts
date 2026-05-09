/**
 * Standalone functions for Sketch and CompoundSketch operations.
 *
 * These functions hold the canonical implementations; the matching class
 * methods (`Sketch.extrude`, `CompoundSketch.face`, etc.) delegate here.
 */

import type { Plane } from '@/core/planeTypes.js';
import { createPlane } from '@/core/planeOps.js';
import {
  addHolesInFace,
  makeCompound,
  makeFace,
  makeNewFaceWithinFace,
  makeSolid,
} from '@/topology/shapeHelpers.js';
import { isOk, type Result, unwrap } from '@/core/result.js';
import { cast, downcast } from '@/topology/cast.js';
import { toVec3, type Vec3, type PointInput } from '@/core/types.js';
import { vecScale, vecNormalize, vecCross } from '@/core/vecOps.js';
import { extrude, revolve } from '@/operations/extrudeFns.js';
import { sweep, complexExtrude, twistExtrude } from '@/operations/sweepFns.js';
import { firstOrThrow, getAtOrThrow } from '@/utils/arrayAccess.js';
import { bug } from '@/core/errors.js';
import { getKernel } from '@/kernel/index.js';
import type { ExtrusionProfile, SweepOptions } from '@/operations/extrudeUtils.js';
import { loft } from '@/operations/loftFns.js';
import type { LoftOptions } from '@/operations/loftFns.js';
import type {
  ClosedWire,
  Face,
  OrientedFace,
  Shape3D,
  Shell,
  Wire,
  PlanarWire,
} from '@/core/shapeTypes.js';
import { createFace, createWire, isFace } from '@/core/shapeTypes.js';
import type { PlanarFace } from '@/core/validityTypes.js';
import type { SketchData } from '@/2d/blueprints/lib.js';
import { curveStartPoint, curveTangentAt } from '@/topology/curveFns.js';
import Sketch from './sketch.js';
import CompoundSketch from './compoundSketch.js';

// ---------------------------------------------------------------------------
// SketchData wrappers
// ---------------------------------------------------------------------------

/** Wrap SketchData into a Sketch instance. */
export function wrapSketchData(data: SketchData): Sketch {
  const opts: { defaultOrigin?: PointInput; defaultDirection?: PointInput } = {};
  if (data.defaultOrigin) opts.defaultOrigin = data.defaultOrigin;
  if (data.defaultDirection) opts.defaultDirection = data.defaultDirection;
  // SketchData.wire is produced by Drawing.sketchOnPlane on a closed planar profile.
  const sketch = new Sketch(data.wire as ClosedWire & PlanarWire, opts);
  if (data.baseFace) sketch.baseFace = data.baseFace;
  return sketch;
}

/** Wrap an array of SketchData into a CompoundSketch. */
export function wrapSketchDataArray(dataArr: SketchData[]): CompoundSketch {
  return new CompoundSketch(dataArr.map(wrapSketchData));
}

// ---------------------------------------------------------------------------
// Sketch operations (canonical implementations)
// ---------------------------------------------------------------------------

/** Build a face from a sketch's closed planar wire. */
export function sketchFace(sketch: Sketch): OrientedFace & PlanarFace {
  let face: Face;
  if (!sketch.baseFace) {
    face = unwrap(makeFace(sketch.wire));
  } else {
    face = makeNewFaceWithinFace(sketch.baseFace, sketch.wire);
  }
  return face as OrientedFace & PlanarFace;
}

/** Return an independent clone of the sketch's wire. */
export function sketchWires(sketch: Sketch): Wire {
  return createWire(unwrap(downcast(sketch.wire.wrapped)));
}

/**
 * Revolve a sketch around an axis to produce a solid of revolution.
 *
 * @remarks Consumes the sketch — calling twice throws on the second call.
 */
export function sketchRevolve(
  sketch: Sketch,
  revolutionAxis?: PointInput,
  { origin }: { origin?: PointInput } = {}
): Shape3D {
  const face = unwrap(makeFace(sketch.wire));
  const center: Vec3 = origin ? toVec3(origin) : sketch.defaultOrigin;
  const dir: Vec3 = revolutionAxis ? toVec3(revolutionAxis) : [0, 0, 1];
  const solid = unwrap(revolve(face, center, dir));
  face.delete();
  sketch.delete();
  return solid;
}

/**
 * Extrude a sketch to a given distance.
 *
 * Supports profile (taper) extrusion via `extrusionProfile`, twist extrusion
 * via `twistAngle`, and direction/origin overrides.
 *
 * @remarks Consumes the sketch — calling twice throws on the second call.
 */
export function sketchExtrude(
  sketch: Sketch,
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
  const direction: Vec3 = extrusionDirection ? toVec3(extrusionDirection) : sketch.defaultDirection;
  const extrusionVec = vecScale(vecNormalize(direction), extrusionDistance);
  const originVec: Vec3 = origin ? toVec3(origin) : sketch.defaultOrigin;

  if (extrusionProfile && !twistAngle) {
    const solid = unwrap(
      complexExtrude(sketch.wire, [...originVec], [...extrusionVec], extrusionProfile)
    );
    sketch.delete();
    return solid as Shape3D;
  }

  if (twistAngle) {
    const solid = unwrap(
      twistExtrude(sketch.wire, twistAngle, [...originVec], [...extrusionVec], extrusionProfile)
    );
    sketch.delete();
    return solid as Shape3D;
  }

  const face = unwrap(makeFace(sketch.wire));
  const solid = unwrap(extrude(face, [...extrusionVec]));
  sketch.delete();
  return solid;
}

/**
 * Sweep a profile sketch (built by `sketchOnPlane`) along this sketch's wire path.
 *
 * @remarks Consumes both this sketch and the one returned by `sketchOnPlane` —
 * calling either twice throws on the second call.
 */
export function sketchSweep(
  sketch: Sketch,
  sketchOnPlane: (plane: Plane, origin: Vec3) => Sketch,
  sweepConfig: SweepOptions = {}
): Shape3D {
  const startPoint = curveStartPoint(sketch.wire);
  const tangent = curveTangentAt(sketch.wire, 1e-9);
  const normal = vecNormalize(vecScale(tangent, -1));
  const defaultDir: Vec3 = sketch.defaultDirection;
  const xDir = vecScale(vecCross(normal, defaultDir), -1);

  const result = sketchOnPlane(createPlane([...startPoint], [...xDir], [...normal]), [
    ...startPoint,
  ]);

  // The callback may return a Sketches (plural) when the Drawing used a
  // 2D boolean that split the profile into multiple pieces. Extract the
  // first sketch's wire and dispose the rest to prevent WASM leaks.
  // Duck-type check avoids circular import (sketches.ts imports Sketch).
  let profile: Sketch;
  if ('sketches' in result && Array.isArray((result as { sketches: unknown[] }).sketches)) {
    const pieces = (result as { sketches: Sketch[] }).sketches;
    profile = pieces[0] as Sketch;
    for (let i = 1; i < pieces.length; i++) {
      pieces[i]?.delete();
    }
  } else {
    profile = result;
  }

  const config: SweepOptions = {
    forceProfileSpineOthogonality: true,
    ...sweepConfig,
  };
  if (sketch.baseFace) {
    config.support = sketch.baseFace.wrapped;
  }
  const shape = unwrap(sweep(profile.wire, sketch.wire, config)) as Shape3D;
  sketch.delete();

  return shape;
}

/**
 * Loft between this sketch and one or more other sketches.
 *
 * @remarks Consumes all input sketches — calling twice throws on the second call.
 */
export function sketchLoft(
  sketch: Sketch,
  otherSketches: Sketch | Sketch[],
  loftConfig: LoftOptions = {},
  returnShell = false
): Shape3D {
  const sketchArray = Array.isArray(otherSketches)
    ? [sketch, ...otherSketches]
    : [sketch, otherSketches];
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

// ---------------------------------------------------------------------------
// CompoundSketch operations (canonical implementations)
// ---------------------------------------------------------------------------

const guessFaceFromWires = (wires: Wire[]): Face => {
  const wireShapes = wires.map((w) => w.wrapped);
  const newFace = unwrap(cast(getKernel().fillSurface(wireShapes)));

  if (!isFace(newFace)) {
    bug('guessFaceFromWires', 'Failed to create a face');
  }
  return newFace as Face;
};

const fixWire = (wire: Wire, baseFace: Face): Wire => {
  const fixedWire = getKernel().fixWireOnFace(wire.wrapped, baseFace.wrapped, 1e-9);
  return createWire(fixedWire);
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

/** Build a face from a compound sketch (outer boundary with holes). */
export function compoundSketchFace(sketch: CompoundSketch): OrientedFace & PlanarFace {
  const baseFace = sketch.outerSketch.face();
  const newFace = addHolesInFace(
    baseFace,
    sketch.innerSketches.map((s) => s.wire)
  );
  return newFace as OrientedFace & PlanarFace;
}

/** Return all wires (outer + holes) combined into a compound shape. */
export function compoundSketchWires(sketch: CompoundSketch) {
  const wires = sketch.sketches.map((s) => s.wire);
  return makeCompound(wires);
}

/**
 * Extrude a compound sketch (outer + holes) along the default or given direction.
 *
 * Supports twist and profile extrusions. For twist/profile modes each
 * sub-sketch is extruded as a shell, then capped into a solid.
 */
export function compoundSketchExtrude(
  sketch: CompoundSketch,
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
    : sketch.outerSketch.defaultDirection;
  const normVec = vecNormalize(rawVec);
  const extrusionVec = vecScale(normVec, extrusionDistance);

  if (extrusionProfile && !twistAngle) {
    return solidFromShellGenerator(
      sketch.sketches,
      (s: Sketch) =>
        complexExtrude(
          s.wire,
          origin ? toVec3(origin) : sketch.outerSketch.defaultOrigin,
          extrusionVec,
          extrusionProfile,
          true
        ) as Result<[Shape3D, Wire, Wire]>
    );
  }
  if (twistAngle) {
    return solidFromShellGenerator(
      sketch.sketches,
      (s: Sketch) =>
        twistExtrude(
          s.wire,
          twistAngle,
          origin ? toVec3(origin) : sketch.outerSketch.defaultOrigin,
          extrusionVec,
          extrusionProfile,
          true
        ) as Result<[Shape3D, Wire, Wire]>
    );
  }
  return unwrap(extrude(compoundSketchFace(sketch), extrusionVec));
}

/** Revolve a compound sketch (outer + holes) around an axis. */
export function compoundSketchRevolve(
  sketch: CompoundSketch,
  revolutionAxis?: PointInput,
  { origin }: { origin?: PointInput } = {}
): Shape3D {
  const center = origin ? toVec3(origin) : sketch.outerSketch.defaultOrigin;
  const dir = revolutionAxis ? toVec3(revolutionAxis) : ([0, 0, 1] as Vec3);
  return unwrap(revolve(compoundSketchFace(sketch), center, dir));
}

/** Loft between two compound sketches with matching sub-sketch counts. */
export function compoundSketchLoft(
  sketch: CompoundSketch,
  other: CompoundSketch,
  loftConfig: LoftOptions
): Shape3D {
  if (sketch.sketches.length !== other.sketches.length)
    bug(
      'CompoundSketch.loftWith',
      'You need to loft with another compound with the same number of sketches'
    );

  const shells: Array<Shell | Face> = sketch.sketches.map((base, cIndex) => {
    const outer = getAtOrThrow(other.sketches, cIndex);
    const loftOpts: LoftOptions = {};
    if (loftConfig.ruled !== undefined) loftOpts.ruled = loftConfig.ruled;
    return base.clone().loftWith(outer.clone(), loftOpts, true) as Shell;
  });

  const baseFaceRaw = compoundSketchFace(sketch);
  const baseFace = createFace(unwrap(downcast(baseFaceRaw.wrapped)));
  shells.push(baseFace, compoundSketchFace(other));

  return unwrap(makeSolid(shells));
}
