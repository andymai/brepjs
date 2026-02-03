import { getKernel } from '../kernel/index.js';
import type { OcType } from '../kernel/types.js';
import { type Point, Vector } from '../core/geometry.js';
import type { Vec3 } from '../core/types.js';
import { makeOcAx1 } from '../core/occtBoundary.js';
import { vecAdd, vecLength } from '../core/vecOps.js';
import { localGC } from '../core/memory.js';
import { DEG2RAD } from '../core/constants.js';
import { cast, downcast, isShape3D, isWire } from '../topology/cast.js';
import { type Result, ok, err, unwrap, andThen } from '../core/result.js';
import { typeCastError } from '../core/errors.js';
import { buildLawFromProfile, type ExtrusionProfile, type SweepConfig } from './extrudeUtils.js';
import type { Face, Wire, Edge, Shape3D } from '../topology/shapes.js';
import { Solid } from '../topology/shapes.js';
import { makeLine, makeHelix, assembleWire } from '../topology/shapeHelpers.js';

/** Helper to convert legacy Point type to Vec3 */
function pointToVec3(p: Point): Vec3 {
  if (Array.isArray(p)) {
    return p.length === 3 ? [p[0], p[1], p[2]] : [p[0], p[1], 0];
  } else if (p instanceof Vector) {
    return [p.x, p.y, p.z];
  } else {
    // OCCT point-like object
    const xyz = p.XYZ();
    const vec: Vec3 = [xyz.X(), xyz.Y(), xyz.Z()];
    xyz.delete();
    return vec;
  }
}

export const basicFaceExtrusion = (face: Face, extrusionVec: Point): Solid => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const vec = pointToVec3(extrusionVec);
  const ocVec = r(new oc.gp_Vec_4(vec[0], vec[1], vec[2]));
  const solidBuilder = r(new oc.BRepPrimAPI_MakePrism_1(face.wrapped, ocVec, false, true));
  const solid = new Solid(unwrap(downcast(solidBuilder.Shape())));
  gc();
  return solid;
};

export const revolution = (
  face: Face,
  center: Point = [0, 0, 0],
  direction: Point = [0, 0, 1],
  angle = 360
): Result<Shape3D> => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const centerVec = pointToVec3(center);
  const directionVec = pointToVec3(direction);
  const ax = r(makeOcAx1(centerVec, directionVec));
  const revolBuilder = r(new oc.BRepPrimAPI_MakeRevol_1(face.wrapped, ax, angle * DEG2RAD, false));

  const result = andThen(cast(revolBuilder.Shape()), (shape) => {
    if (!isShape3D(shape))
      return err(typeCastError('REVOLUTION_NOT_3D', 'Revolution did not produce a 3D shape'));
    return ok(shape);
  });
  gc();

  return result;
};

/** Configuration for sweep operations in the OO API. */
export interface GenericSweepConfig extends Omit<SweepConfig, 'auxiliarySpine'> {
  /** Auxiliary spine for twist control (Wire or Edge in OO API) */
  auxiliarySpine?: Wire | Edge;
}

function genericSweep(
  wire: Wire,
  spine: Wire,
  sweepConfig: GenericSweepConfig,
  shellMode: true
): Result<[Shape3D, Wire, Wire]>;
function genericSweep(
  wire: Wire,
  spine: Wire,
  sweepConfig: GenericSweepConfig,
  shellMode?: false
): Result<Shape3D>;
function genericSweep(
  wire: Wire,
  spine: Wire,
  {
    frenet = false,
    auxiliarySpine,
    law = null,
    transitionMode = 'right',
    withContact,
    support,
    forceProfileSpineOthogonality,
  }: GenericSweepConfig = {},
  shellMode = false
): Result<Shape3D | [Shape3D, Wire, Wire]> {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const withCorrection = transitionMode === 'round' ? true : !!forceProfileSpineOthogonality;
  const sweepBuilder = r(new oc.BRepOffsetAPI_MakePipeShell(spine.wrapped));

  {
    const mode = {
      transformed: oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_Transformed,
      round: oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RoundCorner,
      right: oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RightCorner,
    }[transitionMode];
    if (mode) sweepBuilder.SetTransitionMode(mode);
  }

  if (support) {
    sweepBuilder.SetMode_4(support);
  } else if (frenet) {
    sweepBuilder.SetMode_1(frenet);
  }
  if (auxiliarySpine) {
    sweepBuilder.SetMode_5(
      auxiliarySpine.wrapped,
      false,
      oc.BRepFill_TypeOfContact.BRepFill_NoContact
    );
  }

  if (!law) sweepBuilder.Add_1(wire.wrapped, !!withContact, withCorrection);
  else sweepBuilder.SetLaw_1(wire.wrapped, law, !!withContact, withCorrection);

  const progress = r(new oc.Message_ProgressRange_1());
  sweepBuilder.Build(progress);
  if (!shellMode) {
    sweepBuilder.MakeSolid();
  }
  const shape = unwrap(cast(sweepBuilder.Shape()));
  if (!isShape3D(shape)) {
    gc();
    return err(typeCastError('SWEEP_NOT_3D', 'Sweep did not produce a 3D shape'));
  }

  if (shellMode) {
    const startWire = unwrap(cast(sweepBuilder.FirstShape()));
    const endWire = unwrap(cast(sweepBuilder.LastShape()));
    if (!isWire(startWire)) {
      gc();
      return err(typeCastError('SWEEP_START_NOT_WIRE', 'Sweep did not produce a start Wire'));
    }
    if (!isWire(endWire)) {
      gc();
      return err(typeCastError('SWEEP_END_NOT_WIRE', 'Sweep did not produce an end Wire'));
    }
    gc();
    return ok([shape, startWire, endWire] as [Shape3D, Wire, Wire]);
  }

  gc();
  return ok(shape);
}

export { genericSweep };

export type { ExtrusionProfile } from './extrudeUtils.js';

export const supportExtrude = (
  wire: Wire,
  center: Point,
  normal: Point,
  support: OcType
): Result<Shape3D> => {
  const [r, gc] = localGC();
  const centerVec = pointToVec3(center);
  const normalVec = pointToVec3(normal);
  const endVec = vecAdd(centerVec, normalVec);

  const mainSpineEdge = r(makeLine(centerVec, endVec));
  const spine = r(unwrap(assembleWire([mainSpineEdge])));

  const result = genericSweep(wire, spine, { support });
  gc();
  return result;
};

function complexExtrude(
  wire: Wire,
  center: Point,
  normal: Point,
  profileShape: ExtrusionProfile | undefined,
  shellMode: true
): Result<[Shape3D, Wire, Wire]>;
function complexExtrude(
  wire: Wire,
  center: Point,
  normal: Point,
  profileShape?: ExtrusionProfile,
  shellMode?: false
): Result<Shape3D>;
function complexExtrude(
  wire: Wire,
  center: Point,
  normal: Point,
  profileShape?: ExtrusionProfile,
  shellMode = false
): Result<Shape3D | [Shape3D, Wire, Wire]> {
  const [r, gc] = localGC();
  const centerVec = pointToVec3(center);
  const normalVec = pointToVec3(normal);
  const endVec = vecAdd(centerVec, normalVec);

  const mainSpineEdge = r(makeLine(centerVec, endVec));
  const spine = r(unwrap(assembleWire([mainSpineEdge])));

  const law = profileShape
    ? r(unwrap(buildLawFromProfile(vecLength(normalVec), profileShape)))
    : null;

  const result = shellMode
    ? genericSweep(wire, spine, { law }, shellMode)
    : genericSweep(wire, spine, { law }, shellMode);

  gc();
  return result;
}

export { complexExtrude };

function twistExtrude(
  wire: Wire,
  angleDegrees: number,
  center: Point,
  normal: Point,
  profileShape?: ExtrusionProfile,
  shellMode?: false
): Result<Shape3D>;
function twistExtrude(
  wire: Wire,
  angleDegrees: number,
  center: Point,
  normal: Point,
  profileShape: ExtrusionProfile | undefined,
  shellMode: true
): Result<[Shape3D, Wire, Wire]>;
function twistExtrude(
  wire: Wire,
  angleDegrees: number,
  center: Point,
  normal: Point,
  profileShape?: ExtrusionProfile,
  shellMode = false
): Result<Shape3D | [Shape3D, Wire, Wire]> {
  const [r, gc] = localGC();
  const centerVec = pointToVec3(center);
  const normalVec = pointToVec3(normal);
  const endVec = vecAdd(centerVec, normalVec);

  const mainSpineEdge = r(makeLine(centerVec, endVec));
  const spine = r(unwrap(assembleWire([mainSpineEdge])));

  const extrusionLength = vecLength(normalVec);
  const pitch = (360.0 / angleDegrees) * extrusionLength;
  const radius = 1;

  const auxiliarySpine = r(makeHelix(pitch, extrusionLength, radius, centerVec, normalVec));

  const law = profileShape ? r(unwrap(buildLawFromProfile(extrusionLength, profileShape))) : null;

  const result = shellMode
    ? genericSweep(wire, spine, { auxiliarySpine, law }, shellMode)
    : genericSweep(wire, spine, { auxiliarySpine, law }, shellMode);

  gc();
  return result;
}
export { twistExtrude };
