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
import type { Face, Wire, Shape3D, Solid } from '../core/shapeTypes.js';
import { castShape, isShape3D, isWire as isWireGuard, createSolid } from '../core/shapeTypes.js';
import { gcWithScope } from '../core/disposal.js';
import { downcast } from '../topology/cast.js';
import { type Result, ok, err, unwrap } from '../core/result.js';
import { typeCastError, validationError } from '../core/errors.js';
import { buildLawFromProfile, type ExtrusionProfile, type SweepConfig } from './extrudeUtils.js';

export type { ExtrusionProfile, SweepConfig } from './extrudeUtils.js';

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

/**
 * Extrude a face along a vector to produce a solid.
 *
 * @param face - The planar face to extrude.
 * @param extrusionVec - Direction and magnitude of the extrusion as `[x, y, z]`.
 * @returns A new solid created by the linear extrusion.
 *
 * @example
 * ```ts
 * const box = extrudeFace(squareFace, [0, 0, 10]);
 * ```
 *
 * @see {@link extrude!basicFaceExtrusion | basicFaceExtrusion} for the OOP API equivalent.
 */
export function extrudeFace(face: Face, extrusionVec: Vec3): Solid {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const vec = r(toOcVec(extrusionVec));
  const builder = r(new oc.BRepPrimAPI_MakePrism_1(face.wrapped, vec, false, true));
  return createSolid(unwrap(downcast(builder.Shape())));
}

/**
 * Revolve a face around an axis to create a solid of revolution.
 *
 * @param face - The face to revolve.
 * @param center - A point on the rotation axis. Defaults to the origin.
 * @param direction - Direction vector of the rotation axis. Defaults to Z-up.
 * @param angle - Rotation angle in degrees (0-360). Defaults to a full revolution.
 * @returns `Result` containing the revolved 3D shape, or an error if the result is not 3D.
 *
 * @see {@link extrude!revolution | revolution} for the OOP API equivalent.
 */
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
// Generic sweep
// ---------------------------------------------------------------------------

/**
 * Sweep a wire profile along a spine wire to create a 3D shape.
 *
 * Supports Frenet framing, auxiliary spine twist, scaling laws, contact
 * detection, and configurable corner transition modes.
 *
 * @param wire - The profile wire to sweep.
 * @param spine - The path wire to sweep along.
 * @param config - Sweep configuration (frenet, transition mode, scaling law, etc.).
 * @param shellMode - When `true`, return `[shell, startWire, endWire]` instead of a solid.
 * @returns `Result` containing either a solid or a `[Shape3D, Wire, Wire]` tuple in shell mode.
 *
 * @remarks
 * In WASM, `BRepOffsetAPI_MakePipeShell` supports only a single `Add_1` call per builder.
 * Multi-profile sweeps will silently ignore additional profiles.
 *
 * @see {@link extrude!genericSweep | genericSweep} for the OOP API equivalent.
 */
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
// Complex extrusions
// ---------------------------------------------------------------------------

/**
 * Extrude a wire along a normal constrained to a support surface.
 *
 * Constructs a linear spine from `center` to `center + normal` and sweeps
 * the profile wire along it, constrained by the support surface geometry.
 *
 * @param wire - The profile wire to sweep.
 * @param center - Start point of the extrusion spine.
 * @param normal - Direction and length of the extrusion.
 * @param support - OCCT support surface that constrains the sweep.
 * @returns `Result` containing the swept 3D shape.
 *
 * @see {@link extrude!supportExtrude | supportExtrude (OOP)} for the class-based equivalent.
 */
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

/**
 * Extrude a wire along a normal with optional profile scaling.
 *
 * Builds a linear spine from `center` to `center + normal` and sweeps the
 * profile wire. When `profileShape` is provided, a scaling law (s-curve or
 * linear) modulates the cross-section size along the path.
 *
 * @param wire - The profile wire to sweep.
 * @param center - Start point of the extrusion spine.
 * @param normal - Direction and length of the extrusion. Must be non-zero.
 * @param profileShape - Optional scaling profile applied along the extrusion.
 * @param shellMode - When `true`, return `[shell, startWire, endWire]` instead of a solid.
 * @returns `Result` containing the extruded shape or a shell tuple.
 *
 * @example
 * ```ts
 * const tapered = complexExtrude(wire, [0,0,0], [0,0,50], {
 *   profile: 'linear', endFactor: 0.5
 * });
 * ```
 *
 * @see {@link extrude!complexExtrude | complexExtrude (OOP)} for the class-based equivalent.
 */
export function complexExtrude(
  wire: Wire,
  center: Vec3,
  normal: Vec3,
  profileShape?: ExtrusionProfile,
  shellMode = false
): Result<Shape3D | [Shape3D, Wire, Wire]> {
  const extrusionLength = vecLength(normal);
  if (extrusionLength === 0) {
    return err(
      validationError('ZERO_LENGTH_EXTRUSION', 'Extrusion vector cannot have zero length')
    );
  }
  const endPoint = vecAdd(center, normal);
  const spine = makeSpineWire(center, endPoint);
  const law = profileShape ? unwrap(buildLawFromProfile(extrusionLength, profileShape)) : null;
  return sweep(wire, spine, { law }, shellMode);
}

/**
 * Extrude a wire along a normal with helical twist and optional profile scaling.
 *
 * Constructs a helical auxiliary spine that rotates the profile by
 * `angleDegrees` over the extrusion length. Combines twist with optional
 * s-curve or linear scaling when `profileShape` is provided.
 *
 * @param wire - The profile wire to sweep.
 * @param angleDegrees - Total twist rotation in degrees. Must be non-zero.
 * @param center - Start point of the extrusion spine.
 * @param normal - Direction and length of the extrusion. Must be non-zero.
 * @param profileShape - Optional scaling profile applied along the extrusion.
 * @param shellMode - When `true`, return `[shell, startWire, endWire]` instead of a solid.
 * @returns `Result` containing the twisted extruded shape or a shell tuple.
 *
 * @see {@link extrude!twistExtrude | twistExtrude (OOP)} for the class-based equivalent.
 */
export function twistExtrude(
  wire: Wire,
  angleDegrees: number,
  center: Vec3,
  normal: Vec3,
  profileShape?: ExtrusionProfile,
  shellMode = false
): Result<Shape3D | [Shape3D, Wire, Wire]> {
  if (angleDegrees === 0) {
    return err(validationError('ZERO_TWIST_ANGLE', 'Twist angle cannot be zero'));
  }
  const extrusionLength = vecLength(normal);
  if (extrusionLength === 0) {
    return err(
      validationError('ZERO_LENGTH_EXTRUSION', 'Extrusion vector cannot have zero length')
    );
  }

  const endPoint = vecAdd(center, normal);
  const spine = makeSpineWire(center, endPoint);

  const pitch = (360.0 / angleDegrees) * extrusionLength;
  const auxiliarySpine = makeHelixWire(pitch, extrusionLength, 1, center, normal);

  const law = profileShape ? unwrap(buildLawFromProfile(extrusionLength, profileShape)) : null;
  return sweep(wire, spine, { auxiliarySpine, law }, shellMode);
}
