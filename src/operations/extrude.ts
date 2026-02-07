import { getKernel } from '../kernel/index.js';
import type { PointInput } from '../core/types.js';
import { toVec3 } from '../core/types.js';
import { makeOcAx1 } from '../core/occtBoundary.js';
import { vecAdd, vecLength } from '../core/vecOps.js';
import { localGC } from '../core/memory.js';
import { DEG2RAD } from '../core/constants.js';
import { cast, downcast, isShape3D, isWire } from '../topology/cast.js';
import { type Result, ok, err, unwrap, andThen } from '../core/result.js';
import { typeCastError, occtError } from '../core/errors.js';
import { buildLawFromProfile, type ExtrusionProfile, type SweepConfig } from './extrudeUtils.js';
import type { Face, Wire, Edge, Shape3D, Solid } from '../core/shapeTypes.js';
import { createSolid } from '../core/shapeTypes.js';
import { makeLine, makeHelix, assembleWire } from '../topology/shapeHelpers.js';

/**
 * Extrude a face along a vector to produce a solid (OOP API).
 *
 * @param face - The planar face to extrude.
 * @param extrusionVec - Direction and magnitude of the extrusion.
 * @returns A new {@link Solid} created by the linear extrusion.
 *
 * @see {@link extrudeFns!extrudeFace | extrudeFace} for the functional API equivalent.
 */
export const basicFaceExtrusion = (face: Face, extrusionVec: PointInput): Solid => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const vec = toVec3(extrusionVec);
  const ocVec = r(new oc.gp_Vec_4(vec[0], vec[1], vec[2]));
  const solidBuilder = r(new oc.BRepPrimAPI_MakePrism_1(face.wrapped, ocVec, false, true));
  const solid = createSolid(unwrap(downcast(solidBuilder.Shape())));
  gc();
  return solid;
};

/**
 * Revolve a face around an axis to create a solid of revolution (OOP API).
 *
 * @param face - The face to revolve.
 * @param center - A point on the rotation axis. Defaults to the origin.
 * @param direction - Direction vector of the rotation axis. Defaults to Z-up.
 * @param angle - Rotation angle in degrees (0-360). Defaults to a full revolution.
 * @returns `Result` containing the revolved 3D shape, or an error if the result is not 3D.
 *
 * @see {@link extrudeFns!revolveFace | revolveFace} for the functional API equivalent.
 */
export const revolution = (
  face: Face,
  center: PointInput = [0, 0, 0],
  direction: PointInput = [0, 0, 1],
  angle = 360
): Result<Shape3D> => {
  const oc = getKernel().oc;
  const [r, gc] = localGC();

  const centerVec = toVec3(center);
  const directionVec = toVec3(direction);
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

  if (!sweepBuilder.IsDone()) {
    gc();
    return err(occtError('SWEEP_FAILED', 'Sweep operation failed'));
  }

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

/**
 * Sweep a wire profile along a spine wire to create a 3D shape (OOP API).
 *
 * Supports Frenet framing, auxiliary spine twist, scaling laws, contact
 * detection, and configurable corner transition modes. Overloaded: pass
 * `shellMode: true` to receive `[Shape3D, Wire, Wire]` instead of a solid.
 *
 * @remarks
 * In WASM, `BRepOffsetAPI_MakePipeShell` supports only a single `Add_1` call
 * per builder. Multi-profile sweeps will silently ignore additional profiles.
 *
 * @see {@link extrudeFns!sweep | sweep} for the functional API equivalent.
 */
export { genericSweep };

export type { ExtrusionProfile } from './extrudeUtils.js';

function complexExtrude(
  wire: Wire,
  center: PointInput,
  normal: PointInput,
  profileShape: ExtrusionProfile | undefined,
  shellMode: true
): Result<[Shape3D, Wire, Wire]>;
function complexExtrude(
  wire: Wire,
  center: PointInput,
  normal: PointInput,
  profileShape?: ExtrusionProfile,
  shellMode?: false
): Result<Shape3D>;
function complexExtrude(
  wire: Wire,
  center: PointInput,
  normal: PointInput,
  profileShape?: ExtrusionProfile,
  shellMode = false
): Result<Shape3D | [Shape3D, Wire, Wire]> {
  const [r, gc] = localGC();
  const centerVec = toVec3(center);
  const normalVec = toVec3(normal);
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

/**
 * Extrude a wire along a normal with optional profile scaling (OOP API).
 *
 * Builds a linear spine from `center` to `center + normal` and sweeps the
 * profile wire. When `profileShape` is provided, a scaling law modulates the
 * cross-section size along the path. Overloaded for solid vs. shell mode.
 *
 * @see {@link extrudeFns!complexExtrude | complexExtrude (Fns)} for the functional equivalent.
 */
export { complexExtrude };

function twistExtrude(
  wire: Wire,
  angleDegrees: number,
  center: PointInput,
  normal: PointInput,
  profileShape?: ExtrusionProfile,
  shellMode?: false
): Result<Shape3D>;
function twistExtrude(
  wire: Wire,
  angleDegrees: number,
  center: PointInput,
  normal: PointInput,
  profileShape: ExtrusionProfile | undefined,
  shellMode: true
): Result<[Shape3D, Wire, Wire]>;
function twistExtrude(
  wire: Wire,
  angleDegrees: number,
  center: PointInput,
  normal: PointInput,
  profileShape?: ExtrusionProfile,
  shellMode = false
): Result<Shape3D | [Shape3D, Wire, Wire]> {
  const [r, gc] = localGC();
  const centerVec = toVec3(center);
  const normalVec = toVec3(normal);
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
/**
 * Extrude a wire along a normal with helical twist and optional scaling (OOP API).
 *
 * Constructs a helical auxiliary spine that rotates the profile over the
 * extrusion length. Overloaded for solid vs. shell mode.
 *
 * @see {@link extrudeFns!twistExtrude | twistExtrude (Fns)} for the functional equivalent.
 */
export { twistExtrude };
