/**
 * Functional extrusion operations using Vec3 tuples and branded shape types.
 * Immutable: all functions return new shapes without disposing inputs.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT types are dynamic
type OcType = any;

import { getKernel } from '../kernel/index.js';
import type { Vec3 } from '../core/types.js';
import { toOcVec, toOcPnt, makeOcAx3 } from '../core/occtBoundary.js';
import { vecAdd, vecLength } from '../core/vecOps.js';
import { DEG2RAD } from '../core/constants.js';
import type { Face, Wire, Edge, Shape3D, Solid } from '../core/shapeTypes.js';
import { castShape, isShape3D, isWire as isWireGuard, createSolid } from '../core/shapeTypes.js';
import { gcWithScope } from '../core/disposal.js';
import { downcast } from '../topology/cast.js';
import { type Result, ok, err, unwrap } from '../core/result.js';
import { typeCastError, validationError } from '../core/errors.js';

// ---------------------------------------------------------------------------
// Internal: spine construction
// ---------------------------------------------------------------------------

/** Build a wire spine from start to end point (line segment). */
function makeSpineWire(start: Vec3, end: Vec3): Wire {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const pnt1 = r(toOcPnt(start));
  const pnt2 = r(toOcPnt(end));
  const edgeMaker = r(new oc.BRepBuilderAPI_MakeEdge_3(pnt1, pnt2));
  const wireMaker = r(new oc.BRepBuilderAPI_MakeWire_2(edgeMaker.Edge()));
  return castShape(wireMaker.Wire()) as Wire;
}

/** Build a helix wire for twist extrusion. */
function makeHelixWire(
  pitch: number,
  height: number,
  radius: number,
  center: Vec3,
  dir: Vec3,
  lefthand = false
): Wire {
  const oc = getKernel().oc;
  const r = gcWithScope();

  let myDir = 2 * Math.PI;
  if (lefthand) myDir = -2 * Math.PI;

  const geomLine = r(
    new oc.Geom2d_Line_3(r(new oc.gp_Pnt2d_3(0.0, 0.0)), r(new oc.gp_Dir2d_4(myDir, pitch)))
  );

  const nTurns = height / pitch;
  const uStart = r(geomLine.Value(0.0));
  const uStop = r(geomLine.Value(nTurns * Math.sqrt((2 * Math.PI) ** 2 + pitch ** 2)));
  const geomSeg = r(new oc.GCE2d_MakeSegment_1(uStart, uStop));

  const ax3 = makeOcAx3(center, dir);
  // We do not GC this surface (or it can break for some reason)
  const geomSurf = new oc.Geom_CylindricalSurface_1(ax3, radius);
  ax3.delete();

  const e = r(
    new oc.BRepBuilderAPI_MakeEdge_30(
      r(new oc.Handle_Geom2d_Curve_2(geomSeg.Value().get())),
      r(new oc.Handle_Geom_Surface_2(geomSurf))
    )
  ).Edge();

  const w = r(new oc.BRepBuilderAPI_MakeWire_2(e)).Wire();
  oc.BRepLib.BuildCurves3d_2(w);

  return castShape(w) as Wire;
}

// ---------------------------------------------------------------------------
// Basic extrusion
// ---------------------------------------------------------------------------

/** Extrude a face along a vector to produce a solid. */
export function extrudeFace(face: Face, extrusionVec: Vec3): Solid {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const vec = r(toOcVec(extrusionVec));
  const builder = r(new oc.BRepPrimAPI_MakePrism_1(face.wrapped, vec, false, true));
  return createSolid(unwrap(downcast(builder.Shape())));
}

/** Revolve a face around an axis. Angle is in degrees. */
export function revolveFace(
  face: Face,
  center: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1],
  angle = 360
): Result<Shape3D> {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const pnt = r(new oc.gp_Pnt_3(center[0], center[1], center[2]));
  const dir = r(new oc.gp_Dir_4(direction[0], direction[1], direction[2]));
  const ax = r(new oc.gp_Ax1_2(pnt, dir));

  const builder = r(new oc.BRepPrimAPI_MakeRevol_1(face.wrapped, ax, angle * DEG2RAD, false));
  const result = castShape(builder.Shape());

  if (!isShape3D(result)) {
    return err(typeCastError('REVOLUTION_NOT_3D', 'Revolution did not produce a 3D shape'));
  }
  return ok(result);
}

// ---------------------------------------------------------------------------
// Sweep configuration
// ---------------------------------------------------------------------------

export interface SweepConfig {
  frenet?: boolean;
  auxiliarySpine?: Wire | Edge;
  law?: OcType;
  transitionMode?: 'right' | 'transformed' | 'round';
  withContact?: boolean;
  support?: OcType;
  forceProfileSpineOthogonality?: boolean;
}

// ---------------------------------------------------------------------------
// Generic sweep
// ---------------------------------------------------------------------------

/** Sweep a wire profile along a spine. Returns a solid or shell+wires. */
export function sweep(
  wire: Wire,
  spine: Wire,
  config: SweepConfig = {},
  shellMode = false
): Result<Shape3D | [Shape3D, Wire, Wire]> {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const {
    frenet = false,
    auxiliarySpine,
    law = null,
    transitionMode = 'right',
    withContact,
    support,
    forceProfileSpineOthogonality,
  } = config;

  const withCorrection = transitionMode === 'round' ? true : !!forceProfileSpineOthogonality;
  const builder = r(new oc.BRepOffsetAPI_MakePipeShell(spine.wrapped));

  {
    const mode = {
      transformed: oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_Transformed,
      round: oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RoundCorner,
      right: oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RightCorner,
    }[transitionMode];
    if (mode) builder.SetTransitionMode(mode);
  }

  if (support) {
    builder.SetMode_4(support);
  } else if (frenet) {
    builder.SetMode_1(frenet);
  }
  if (auxiliarySpine) {
    builder.SetMode_5(auxiliarySpine.wrapped, false, oc.BRepFill_TypeOfContact.BRepFill_NoContact);
  }

  if (!law) builder.Add_1(wire.wrapped, !!withContact, withCorrection);
  else builder.SetLaw_1(wire.wrapped, law, !!withContact, withCorrection);

  const progress = r(new oc.Message_ProgressRange_1());
  builder.Build(progress);
  if (!shellMode) builder.MakeSolid();

  const shape = castShape(builder.Shape());
  if (!isShape3D(shape)) {
    return err(typeCastError('SWEEP_NOT_3D', 'Sweep did not produce a 3D shape'));
  }

  if (shellMode) {
    const startWire = castShape(builder.FirstShape());
    const endWire = castShape(builder.LastShape());
    if (!isWireGuard(startWire)) {
      return err(typeCastError('SWEEP_START_NOT_WIRE', 'Sweep did not produce a start Wire'));
    }
    if (!isWireGuard(endWire)) {
      return err(typeCastError('SWEEP_END_NOT_WIRE', 'Sweep did not produce an end Wire'));
    }
    return ok([shape, startWire, endWire] as [Shape3D, Wire, Wire]);
  }

  return ok(shape);
}

// ---------------------------------------------------------------------------
// Extrusion profiles
// ---------------------------------------------------------------------------

export interface ExtrusionProfile {
  profile?: 's-curve' | 'linear';
  endFactor?: number;
}

function buildLawFromProfile(
  extrusionLength: number,
  { profile, endFactor = 1 }: ExtrusionProfile
): Result<OcType> {
  const oc = getKernel().oc;
  const r = gcWithScope();

  let law: OcType;
  if (profile === 's-curve') {
    law = r(new oc.Law_S());
    law.Set_1(0, 1, extrusionLength, endFactor);
  } else if (profile === 'linear') {
    law = r(new oc.Law_Linear());
    law.Set(0, 1, extrusionLength, endFactor);
  } else {
    return err(
      validationError('UNSUPPORTED_PROFILE', `Unsupported extrusion profile: ${String(profile)}`)
    );
  }

  return ok(law.Trim(0, extrusionLength, 1e-6));
}

// ---------------------------------------------------------------------------
// Complex extrusions
// ---------------------------------------------------------------------------

/** Extrude a wire with support surface. */
export function supportExtrude(
  wire: Wire,
  center: Vec3,
  normal: Vec3,
  support: OcType
): Result<Shape3D> {
  const endPoint = vecAdd(center, normal);
  const spine = makeSpineWire(center, endPoint);
  return sweep(wire, spine, { support }) as Result<Shape3D>;
}

/** Extrude a wire along a normal with optional profile shaping. */
export function complexExtrude(
  wire: Wire,
  center: Vec3,
  normal: Vec3,
  profileShape?: ExtrusionProfile,
  shellMode = false
): Result<Shape3D | [Shape3D, Wire, Wire]> {
  const endPoint = vecAdd(center, normal);
  const spine = makeSpineWire(center, endPoint);
  const law = profileShape ? unwrap(buildLawFromProfile(vecLength(normal), profileShape)) : null;
  return sweep(wire, spine, { law }, shellMode);
}

/** Extrude a wire with twist along a normal. Angle is in degrees. */
export function twistExtrude(
  wire: Wire,
  angleDegrees: number,
  center: Vec3,
  normal: Vec3,
  profileShape?: ExtrusionProfile,
  shellMode = false
): Result<Shape3D | [Shape3D, Wire, Wire]> {
  const endPoint = vecAdd(center, normal);
  const spine = makeSpineWire(center, endPoint);

  const extrusionLength = vecLength(normal);
  const pitch = (360.0 / angleDegrees) * extrusionLength;
  const auxiliarySpine = makeHelixWire(pitch, extrusionLength, 1, center, normal);

  const law = profileShape ? unwrap(buildLawFromProfile(extrusionLength, profileShape)) : null;
  return sweep(wire, spine, { auxiliarySpine, law }, shellMode);
}
