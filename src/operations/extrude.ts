/**
 * Extrusion operations: basicFaceExtrusion, complexExtrude, twistExtrude, supportExtrude.
 * Ported from replicad's addThickness.ts.
 */

import { getKernel } from '../kernel/index.js';
import type { OcType } from '../kernel/types.js';
import { Vector, makeAx1, type Point } from '../core/geometry.js';
import { DEG2RAD } from '../core/constants.js';
import { cast, downcast, isShape3D, isWire } from '../topology/cast.js';
import { type Result, ok, err, unwrap, andThen } from '../core/result.js';
import { typeCastError, validationError } from '../core/errors.js';
import type { Face, Wire, Edge, Shape3D } from '../topology/shapes.js';
import { Solid } from '../topology/shapes.js';
import { makeLine, makeHelix, assembleWire } from '../topology/shapeHelpers.js';

export const basicFaceExtrusion = (face: Face, extrusionVec: Vector): Solid => {
  const oc = getKernel().oc;
  const solidBuilder = new oc.BRepPrimAPI_MakePrism_1(
    face.wrapped,
    extrusionVec.wrapped,
    false,
    true
  );
  const solid = new Solid(unwrap(downcast(solidBuilder.Shape())));
  solidBuilder.delete();
  return solid;
};

export const revolution = (
  face: Face,
  center: Point = [0, 0, 0],
  direction: Point = [0, 0, 1],
  angle = 360
): Result<Shape3D> => {
  const oc = getKernel().oc;
  const ax = makeAx1(center, direction);

  const revolBuilder = new oc.BRepPrimAPI_MakeRevol_1(face.wrapped, ax, angle * DEG2RAD, false);

  const result = andThen(cast(revolBuilder.Shape()), (shape) => {
    if (!isShape3D(shape))
      return err(typeCastError('REVOLUTION_NOT_3D', 'Revolution did not produce a 3D shape'));
    return ok(shape);
  });
  ax.delete();
  revolBuilder.delete();

  return result;
};

export interface GenericSweepConfig {
  frenet?: boolean;
  auxiliarySpine?: Wire | Edge;
  law?: OcType;
  transitionMode?: 'right' | 'transformed' | 'round';
  withContact?: boolean;
  support?: OcType;
  forceProfileSpineOthogonality?: boolean;
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
  const withCorrection = transitionMode === 'round' ? true : !!forceProfileSpineOthogonality;
  const sweepBuilder = new oc.BRepOffsetAPI_MakePipeShell(spine.wrapped);

  if (transitionMode) {
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

  const progress = new oc.Message_ProgressRange_1();
  sweepBuilder.Build(progress);
  if (!shellMode) {
    sweepBuilder.MakeSolid();
  }
  const shape = unwrap(cast(sweepBuilder.Shape()));
  if (!isShape3D(shape)) {
    sweepBuilder.delete();
    progress.delete();
    return err(typeCastError('SWEEP_NOT_3D', 'Sweep did not produce a 3D shape'));
  }

  if (shellMode) {
    const startWire = unwrap(cast(sweepBuilder.FirstShape()));
    const endWire = unwrap(cast(sweepBuilder.LastShape()));
    if (!isWire(startWire)) {
      sweepBuilder.delete();
      return err(typeCastError('SWEEP_START_NOT_WIRE', 'Sweep did not produce a start Wire'));
    }
    if (!isWire(endWire)) {
      sweepBuilder.delete();
      return err(typeCastError('SWEEP_END_NOT_WIRE', 'Sweep did not produce an end Wire'));
    }
    sweepBuilder.delete();
    return ok([shape, startWire, endWire] as [Shape3D, Wire, Wire]);
  }

  sweepBuilder.delete();
  progress.delete();
  return ok(shape);
}

export { genericSweep };

export interface ExtrusionProfile {
  profile?: 's-curve' | 'linear';
  endFactor?: number;
}

const buildLawFromProfile = (
  extrusionLength: number,
  { profile, endFactor = 1 }: ExtrusionProfile
): Result<OcType> => {
  const oc = getKernel().oc;

  let law: OcType;
  if (profile === 's-curve') {
    law = new oc.Law_S();
    law.Set_1(0, 1, extrusionLength, endFactor);
  } else if (profile === 'linear') {
    law = new oc.Law_Linear();
    law.Set(0, 1, extrusionLength, endFactor);
  } else {
    return err(
      validationError('UNSUPPORTED_PROFILE', `Unsupported extrusion profile: ${String(profile)}`)
    );
  }

  const trimmed = law.Trim(0, extrusionLength, 1e-6);
  law.delete();
  return ok(trimmed);
};

export const supportExtrude = (
  wire: Wire,
  center: Point,
  normal: Point,
  support: OcType
): Result<Shape3D> => {
  const centerVec = new Vector(center);
  const normalVec = new Vector(normal);

  const mainSpineEdge = makeLine(centerVec, centerVec.add(normalVec));
  const spine = unwrap(assembleWire([mainSpineEdge]));

  return genericSweep(wire, spine, { support });
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
  const centerVec = new Vector(center);
  const normalVec = new Vector(normal);

  const mainSpineEdge = makeLine(centerVec, centerVec.add(normalVec));
  const spine = unwrap(assembleWire([mainSpineEdge]));

  const law = profileShape ? unwrap(buildLawFromProfile(normalVec.Length, profileShape)) : null;

  return shellMode
    ? genericSweep(wire, spine, { law }, shellMode)
    : genericSweep(wire, spine, { law }, shellMode);
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
  const centerVec = new Vector(center);
  const normalVec = new Vector(normal);

  const mainSpineEdge = makeLine(centerVec, centerVec.add(normalVec));
  const spine = unwrap(assembleWire([mainSpineEdge]));

  const pitch = (360.0 / angleDegrees) * normalVec.Length;
  const radius = 1;

  const auxiliarySpine = makeHelix(pitch, normalVec.Length, radius, center, normal);

  const law = profileShape ? unwrap(buildLawFromProfile(normalVec.Length, profileShape)) : null;

  return shellMode
    ? genericSweep(wire, spine, { auxiliarySpine, law }, shellMode)
    : genericSweep(wire, spine, { auxiliarySpine, law }, shellMode);
}
export { twistExtrude };
