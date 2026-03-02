/**
 * Functional extrusion operations using Vec3 tuples and branded shape types.
 * Immutable: all functions return new shapes without disposing inputs.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel types are dynamic
type KernelType = any;

import { getKernel } from '../kernel/index.js';
import type { Vec3 } from '../core/types.js';
import { vecAdd, vecLength, vecNormalize } from '../core/vecOps.js';
import type { Face, Wire, Shape3D, Solid } from '../core/shapeTypes.js';
import { castShape, isShape3D, isWire as isWireGuard, createSolid } from '../core/shapeTypes.js';
import { type Result, ok, err, unwrap } from '../core/result.js';
import { typeCastError, validationError, kernelError, BrepErrorCode } from '../core/errors.js';
import { buildLawFromProfile, type ExtrusionProfile, type SweepOptions } from './extrudeUtils.js';

export type { ExtrusionProfile, SweepOptions } from './extrudeUtils.js';

// ---------------------------------------------------------------------------
// Internal: spine construction
// ---------------------------------------------------------------------------

/** Build a wire spine from start to end point (line segment). */
function makeSpineWire(start: Vec3, end: Vec3): Wire {
  const kernel = getKernel();
  const edge = kernel.makeLineEdge([...start], [...end]);
  const wire = kernel.makeWire([edge]);
  return castShape(wire) as Wire;
}

/** Build a helix wire for twist extrusion. */
function makeHelixWire(
  pitch: number,
  height: number,
  radius: number,
  center: Vec3,
  dir: Vec3,
  _lefthand = false
): Wire {
  const kernel = getKernel();
  return castShape(kernel.makeHelixWire(pitch, height, radius, [...center], [...dir])) as Wire;
}

// ---------------------------------------------------------------------------
// Basic extrusion
// ---------------------------------------------------------------------------

/**
 * Extrude a face along a vector to produce a solid.
 *
 * @param face - The planar face to extrude.
 * @param extrusionVec - Direction and magnitude of the extrusion as `[x, y, z]`.
 * @returns `Result` containing the extruded solid, or an error if validation or operation fails.
 *
 * @example
 * ```ts
 * const result = extrude(squareFace, [0, 0, 10]);
 * if (isOk(result)) console.log('Extruded:', result.value);
 * ```
 *
 * @see {@link extrude!basicFaceExtrusion | basicFaceExtrusion} for the OOP API equivalent.
 */
export function extrude(face: Face, extrusionVec: Vec3): Result<Solid> {
  if (getKernel().isNull(face.wrapped)) {
    return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, 'extrude: face is a null shape'));
  }
  if (vecLength(extrusionVec) === 0) {
    return err(validationError('EXTRUDE_ZERO_VECTOR', 'extrude: extrusion vector has zero length'));
  }

  try {
    const kernel = getKernel();
    const len = vecLength(extrusionVec);
    const dir = vecNormalize(extrusionVec);
    const shape = kernel.extrude(face.wrapped, [...dir], len);
    const downcastShape = kernel.downcast(shape, 'solid');
    const solid = createSolid(downcastShape);
    return ok(solid);
  } catch (e) {
    return err(
      kernelError('EXTRUDE_FAILED', 'Extrusion operation failed', e, {
        operation: 'extrude',
        vectorLength: vecLength(extrusionVec),
      })
    );
  }
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
export function revolve(
  face: Face,
  center: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1],
  angle = 360
): Result<Shape3D> {
  if (getKernel().isNull(face.wrapped)) {
    return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, 'revolve: face is a null shape'));
  }

  const kernel = getKernel();
  const shape = kernel.revolveVec(face.wrapped, [...center], [...direction], angle);
  const result = castShape(shape);

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
  config: SweepOptions = {},
  shellMode = false
): Result<Shape3D | [Shape3D, Wire, Wire]> {
  // Fast path: simple pipe mode (BRepOffsetAPI_MakePipe)
  if (config.mode === 'simple' && !shellMode) {
    const kernel = getKernel();
    const resultOc = kernel.simplePipe(wire.wrapped, spine.wrapped);
    const shape = castShape(resultOc);
    if (!isShape3D(shape)) {
      return err(typeCastError('SWEEP_NOT_3D', 'Simple pipe did not produce a 3D shape'));
    }
    return ok(shape);
  }

  const {
    frenet = false,
    auxiliarySpine,
    law = null,
    transitionMode = 'right',
    withContact,
    support,
    forceProfileSpineOthogonality,
    tolerance,
    boundTolerance,
    angularTolerance,
    maxDegree,
    maxSegments,
  } = config;

  const kernel = getKernel();
  const withCorrection = transitionMode === 'round' ? true : !!forceProfileSpineOthogonality;

  const result = kernel.sweepPipeShell(wire.wrapped, spine.wrapped, {
    transitionMode,
    contact: !!withContact,
    correction: withCorrection,
    frenet,
    shellMode,
    ...(auxiliarySpine?.wrapped ? { auxiliary: auxiliarySpine.wrapped } : {}),
    ...(law !== null ? { law } : {}),
    ...(support !== null ? { support } : {}),
    tolerance,
    boundTolerance,
    angularTolerance,
    maxDegree,
    maxSegments,
  });

  if (shellMode && typeof result === 'object' && 'firstShape' in result) {
    const shape = castShape(result.shape);
    if (!isShape3D(shape)) {
      return err(typeCastError('SWEEP_NOT_3D', 'Sweep did not produce a 3D shape'));
    }
    const startWire = castShape(result.firstShape);
    const endWire = castShape(result.lastShape);
    if (!isWireGuard(startWire)) {
      return err(typeCastError('SWEEP_START_NOT_WIRE', 'Sweep did not produce a start Wire'));
    }
    if (!isWireGuard(endWire)) {
      return err(typeCastError('SWEEP_END_NOT_WIRE', 'Sweep did not produce an end Wire'));
    }
    return ok([shape, startWire, endWire] as [Shape3D, Wire, Wire]);
  }

  const shape = castShape(result);
  if (!isShape3D(shape)) {
    return err(typeCastError('SWEEP_NOT_3D', 'Sweep did not produce a 3D shape'));
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
 * @param support - kernel support surface that constrains the sweep.
 * @returns `Result` containing the swept 3D shape.
 *
 * @see {@link extrude!supportExtrude | supportExtrude (OOP)} for the class-based equivalent.
 */
export function supportExtrude(
  wire: Wire,
  center: Vec3,
  normal: Vec3,
  support: KernelType
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
