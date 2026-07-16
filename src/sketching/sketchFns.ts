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
import { type Result, unwrap } from '@/core/result.js';
import { copyShape } from '@/topology/cast.js';
import { cutAll } from '@/topology/booleanFns.js';
import { toVec3, type Vec3, type PointInput } from '@/core/types.js';
import { vecScale, vecNormalize, vecCross } from '@/core/vecOps.js';
import { extrude, revolve } from '@/operations/extrudeFns.js';
import { sweep, complexExtrude, twistExtrude } from '@/operations/sweepFns.js';
import { firstOrThrow, getAtOrThrow } from '@/utils/arrayAccess.js';
import { bug } from '@/core/errors.js';
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
import { createFace, createWire } from '@/core/shapeTypes.js';
import type { PlanarFace } from '@/core/validityTypes.js';
import type { SketchData } from '@/2d/blueprints/lib.js';
import { curveStartPoint, curveTangentAt } from '@/topology/curveFns.js';
import Sketch, { type SketchInterface } from './sketch.js';
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

/**
 * Collapse a sketch-like (the `SketchInterface | Sketches` union that
 * `Drawing.sketchOnPlane` can return) to a single {@link Sketch} for use as a
 * loft or sweep section. A single-wire profile passes through; a multi-piece
 * profile keeps its first wire and disposes the rest, since loft/sweep sections
 * are single wires.
 */
export function asSketch(sketchLike: SketchInterface): Sketch {
  if (sketchLike instanceof Sketch) return sketchLike;
  const pieces = (sketchLike as { sketches?: unknown }).sketches;
  if (Array.isArray(pieces)) {
    const [first, ...rest] = pieces as Array<Sketch | CompoundSketch>;
    if (first instanceof Sketch) {
      for (const extra of rest) extra.delete();
      return first;
    }
  }
  bug('asSketch', 'Expected a single-wire profile to loft or sweep.');
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
  return createWire(unwrap(copyShape(sketch.wire.wrapped)));
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
  face[Symbol.dispose](); // `.delete()` is a no-op on arena kernels; dispose the face
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
  face[Symbol.dispose](); // extrude shares the face's TShape; release the intermediate
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
  sketchOnPlane: (plane: Plane, origin: Vec3) => SketchInterface,
  sweepConfig: SweepOptions = {}
): Shape3D {
  const startPoint = curveStartPoint(sketch.wire);
  const tangent = curveTangentAt(sketch.wire, 1e-9);
  const normal = vecNormalize(vecScale(tangent, -1));
  const defaultDir: Vec3 = sketch.defaultDirection;
  const xDir = vecScale(vecCross(normal, defaultDir), -1);

  // The callback may return a Sketches (plural) when the Drawing used a 2D
  // boolean that split the profile into multiple pieces; asSketch extracts the
  // first wire and disposes the rest to prevent WASM leaks.
  const profile = asSketch(
    sketchOnPlane(createPlane([...startPoint], [...xDir], [...normal]), [...startPoint])
  );

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
  otherSketches: SketchInterface | SketchInterface[],
  loftConfig: LoftOptions = {},
  returnShell = false
): Shape3D {
  const others = (Array.isArray(otherSketches) ? otherSketches : [otherSketches]).map(asSketch);
  const sketchArray = [sketch, ...others];
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

/**
 * Build a holed twist/profile-extruded solid by extruding the outer boundary
 * and each hole wire as independent solids, then boolean-subtracting the holes.
 *
 * A single-wire twist/profile sweep already yields a valid, consistently-
 * oriented solid. The previous approach assembled the per-wire lateral *shells*
 * plus shared caps into one solid, which produced an inconsistently-oriented
 * (invalid) result whose signed volume even flipped sign between occt-wasm
 * versions — the cause of the #1366 twist/profile compound-extrude failure
 * under occt-wasm 3.3.0. Subtracting valid solids is robust to kernel
 * orientation conventions.
 */
const holedSweptSolid = (
  sketches: Sketch[],
  solidGenerator: (sketch: Sketch) => Result<Shape3D>
): Shape3D => {
  const outer = unwrap(solidGenerator(firstOrThrow(sketches)));
  const holes = sketches.slice(1).map((s) => unwrap(solidGenerator(s)));
  if (holes.length === 0) return outer;
  try {
    return unwrap(cutAll(outer, holes, { unsafe: true }));
  } finally {
    // cutAll is immutable and doesn't consume its inputs, so the per-wire
    // intermediates must be disposed or each hole leaks a WASM solid per call.
    outer.delete();
    for (const h of holes) h.delete();
  }
};

/** Build a face from a compound sketch (outer boundary with holes). */
export function compoundSketchFace(sketch: CompoundSketch): OrientedFace & PlanarFace {
  const baseFace = sketch.outerSketch.face();
  const newFace = addHolesInFace(
    baseFace,
    sketch.innerSketches.map((s) => s.wire)
  );
  // addHolesInFace returns a fresh face sharing baseFace's TShape — release the
  // orphaned base (its slot would otherwise leak on arena kernels).
  baseFace[Symbol.dispose]();
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
    return holedSweptSolid(
      sketch.sketches,
      (s: Sketch) =>
        complexExtrude(
          s.wire,
          origin ? toVec3(origin) : sketch.outerSketch.defaultOrigin,
          extrusionVec,
          extrusionProfile
        ) as Result<Shape3D> // solid mode (shellMode omitted)
    );
  }
  if (twistAngle) {
    return holedSweptSolid(
      sketch.sketches,
      (s: Sketch) =>
        twistExtrude(
          s.wire,
          twistAngle,
          origin ? toVec3(origin) : sketch.outerSketch.defaultOrigin,
          extrusionVec,
          extrusionProfile
        ) as Result<Shape3D> // solid mode (shellMode omitted)
    );
  }
  const face = compoundSketchFace(sketch);
  const solid = unwrap(extrude(face, extrusionVec));
  face[Symbol.dispose](); // extrude shares the face's TShape; release the intermediate
  return solid;
}

/** Revolve a compound sketch (outer + holes) around an axis. */
export function compoundSketchRevolve(
  sketch: CompoundSketch,
  revolutionAxis?: PointInput,
  { origin }: { origin?: PointInput } = {}
): Shape3D {
  const center = origin ? toVec3(origin) : sketch.outerSketch.defaultOrigin;
  const dir = revolutionAxis ? toVec3(revolutionAxis) : ([0, 0, 1] as Vec3);
  const face = compoundSketchFace(sketch);
  const solid = unwrap(revolve(face, center, dir));
  face[Symbol.dispose](); // `.delete()` no-op on arena kernels; dispose the face
  return solid;
}

/** Loft between two compound sketches with matching sub-sketch counts. */
export function compoundSketchLoft(
  sketch: CompoundSketch,
  other: CompoundSketch,
  loftConfig: LoftOptions = {}
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
  const baseFace = createFace(unwrap(copyShape(baseFaceRaw.wrapped)));
  baseFaceRaw[Symbol.dispose](); // orphaned once copied
  shells.push(baseFace, compoundSketchFace(other));

  const solid = unwrap(makeSolid(shells));
  // makeSolid sews the shells/caps into a closed solid (shared refcounted
  // TShapes); release the intermediates once it has consumed them.
  for (const sh of shells) sh[Symbol.dispose]();
  return solid;
}
