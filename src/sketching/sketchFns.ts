/**
 * Standalone functions for Sketch and CompoundSketch operations.
 *
 * These functions hold the canonical implementations; the matching class
 * methods (`Sketch.extrude`, `CompoundSketch.face`, etc.) delegate here.
 */

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
import type {
  ClosedWire,
  Face,
  OrientedFace,
  Shape3D,
  Wire,
  PlanarWire,
} from '@/core/shapeTypes.js';
import { createWire } from '@/core/shapeTypes.js';
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
  const sketch = new Sketch(data.wire, opts);
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
  // Sketch wires are always closed planar by construction at Sketcher boundary
  const closedWire = sketch.wire as ClosedWire & PlanarWire;
  let face: Face;
  if (!sketch.baseFace) {
    face = unwrap(makeFace(closedWire));
  } else {
    face = makeNewFaceWithinFace(sketch.baseFace, closedWire);
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
  const face = unwrap(makeFace(sketch.wire as ClosedWire & PlanarWire));
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
      complexExtrude(
        sketch.wire as ClosedWire & PlanarWire,
        [...originVec],
        [...extrusionVec],
        extrusionProfile
      )
    );
    sketch.delete();
    return solid as Shape3D;
  }

  if (twistAngle) {
    const solid = unwrap(
      twistExtrude(
        sketch.wire as ClosedWire & PlanarWire,
        twistAngle,
        [...originVec],
        [...extrusionVec],
        extrusionProfile
      )
    );
    sketch.delete();
    return solid as Shape3D;
  }

  const face = unwrap(makeFace(sketch.wire as ClosedWire & PlanarWire));
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
  const shape = unwrap(sweep(profile.wire as ClosedWire, sketch.wire, config)) as Shape3D;
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
// CompoundSketch operations (delegate — implementation still in class for now)
// ---------------------------------------------------------------------------

/**
 * Extrude a compound sketch (outer + holes) to a given distance.
 *
 * @see {@link CompoundSketch.extrude} for the OOP equivalent.
 */
export function compoundSketchExtrude(
  sketch: CompoundSketch,
  height: number,
  config?: {
    extrusionDirection?: PointInput;
    extrusionProfile?: ExtrusionProfile;
    twistAngle?: number;
    origin?: PointInput;
  }
): Shape3D {
  return sketch.extrude(height, config);
}

/**
 * Revolve a compound sketch around an axis to produce a solid of revolution.
 *
 * @see {@link CompoundSketch.revolve} for the OOP equivalent.
 */
export function compoundSketchRevolve(
  sketch: CompoundSketch,
  revolutionAxis?: PointInput,
  options?: { origin?: PointInput }
): Shape3D {
  return sketch.revolve(revolutionAxis, options);
}

/**
 * Build a face from a compound sketch (outer boundary with holes).
 *
 * @see {@link CompoundSketch.face} for the OOP equivalent.
 */
export function compoundSketchFace(sketch: CompoundSketch): OrientedFace & PlanarFace {
  return sketch.face() as OrientedFace & PlanarFace;
}

/**
 * Loft between two compound sketches with matching sub-sketch counts.
 *
 * @see {@link CompoundSketch.loftWith} for the OOP equivalent.
 */
export function compoundSketchLoft(
  sketch: CompoundSketch,
  other: CompoundSketch,
  loftConfig: LoftOptions
): Shape3D {
  return sketch.loftWith(other, loftConfig);
}
