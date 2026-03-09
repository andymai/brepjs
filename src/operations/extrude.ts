import { getKernel } from '../kernel/index.js';
import type { PointInput } from '../core/types.js';
import { toVec3 } from '../core/types.js';
import { vecAdd, vecLength } from '../core/vecOps.js';
import { DisposalScope } from '../core/memory.js';
import { DEG2RAD } from '../core/constants.js';
import { cast, downcast, isShape3D, isWire } from '../topology/cast.js';
import { type Result, ok, err, unwrap, andThen } from '../core/result.js';
import { typeCastError } from '../core/errors.js';
import { buildLawFromProfile, type ExtrusionProfile, type SweepOptions } from './extrudeUtils.js';
import type { OrientedFace, Wire, Edge, Shape3D, Solid } from '../core/shapeTypes.js';
import { createSolid } from '../core/shapeTypes.js';
import { makeLine, makeHelix, assembleWire } from '../topology/shapeHelpers.js';

/**
 * Extrude a face along a vector to produce a solid (OOP API).
 *
 * @param face - The planar face to extrude.
 * @param extrusionVec - Direction and magnitude of the extrusion.
 * @returns A new Solid created by the linear extrusion.
 *
 * @see {@link extrudeFns!extrude | extrude} for the functional API equivalent.
 */
export const basicFaceExtrusion = (face: OrientedFace, extrusionVec: PointInput): Solid => {
  const kernel = getKernel();
  const vec = toVec3(extrusionVec);
  const len = vecLength(vec);
  const dir: [number, number, number] =
    len > 0 ? [vec[0] / len, vec[1] / len, vec[2] / len] : [0, 0, 1];
  const shape = kernel.extrude(face.wrapped, dir, len);
  const solid = createSolid(unwrap(downcast(shape)));
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
 * @see {@link extrudeFns!revolve | revolve} for the functional API equivalent.
 */
export const revolution = (
  face: OrientedFace,
  center: PointInput = [0, 0, 0],
  direction: PointInput = [0, 0, 1],
  angle = 360
): Result<Shape3D> => {
  const centerVec = toVec3(center);
  const directionVec = toVec3(direction);

  const kernel = getKernel();
  const revolShape = kernel.revolveVec(
    face.wrapped,
    [...centerVec],
    [...directionVec],
    angle * DEG2RAD
  );

  const result = andThen(cast(revolShape), (shape) => {
    if (!isShape3D(shape))
      return err(typeCastError('REVOLUTION_NOT_3D', 'Revolution did not produce a 3D shape'));
    return ok(shape);
  });

  return result;
};

/** Configuration for sweep operations in the OO API. */
export interface GenericSweepOptions extends Omit<SweepOptions, 'auxiliarySpine'> {
  /** Auxiliary spine for twist control (Wire or Edge in OO API) */
  auxiliarySpine?: Wire | Edge;
}

function genericSweep(
  wire: Wire,
  spine: Wire,
  sweepConfig: GenericSweepOptions,
  shellMode: true
): Result<[Shape3D, Wire, Wire]>;
function genericSweep(
  wire: Wire,
  spine: Wire,
  sweepConfig: GenericSweepOptions,
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
    mode: sweepMode,
    tolerance,
    boundTolerance,
    angularTolerance,
    maxDegree,
    maxSegments,
  }: GenericSweepOptions = {},
  shellMode = false
): Result<Shape3D | [Shape3D, Wire, Wire]> {
  // Fast path: simple pipe mode (BRepOffsetAPI_MakePipe)
  if (sweepMode === 'simple' && !shellMode) {
    const kernel = getKernel();
    const resultOc = kernel.simplePipe(wire.wrapped, spine.wrapped);
    const result = andThen(cast(resultOc), (shape) => {
      if (!isShape3D(shape))
        return err(typeCastError('SWEEP_NOT_3D', 'Simple pipe did not produce a 3D shape'));
      return ok(shape);
    });
    return result;
  }

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
    const shape = unwrap(cast(result.shape));
    if (!isShape3D(shape)) {
      return err(typeCastError('SWEEP_NOT_3D', 'Sweep did not produce a 3D shape'));
    }
    const startWire = unwrap(cast(result.firstShape));
    const endWire = unwrap(cast(result.lastShape));
    if (!isWire(startWire)) {
      return err(typeCastError('SWEEP_START_NOT_WIRE', 'Sweep did not produce a start Wire'));
    }
    if (!isWire(endWire)) {
      return err(typeCastError('SWEEP_END_NOT_WIRE', 'Sweep did not produce an end Wire'));
    }
    return ok([shape, startWire, endWire] as [Shape3D, Wire, Wire]);
  }

  const shape = unwrap(cast(result));
  if (!isShape3D(shape)) {
    return err(typeCastError('SWEEP_NOT_3D', 'Sweep did not produce a 3D shape'));
  }
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
  using scope = new DisposalScope();
  const centerVec = toVec3(center);
  const normalVec = toVec3(normal);
  const endVec = vecAdd(centerVec, normalVec);

  const mainSpineEdge = scope.register(makeLine(centerVec, endVec));
  const spine = scope.register(unwrap(assembleWire([mainSpineEdge])));

  const law = profileShape
    ? scope.register(unwrap(buildLawFromProfile(vecLength(normalVec), profileShape)))
    : null;

  const result = shellMode
    ? genericSweep(wire, spine, { law }, shellMode)
    : genericSweep(wire, spine, { law });

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
  using scope = new DisposalScope();
  const centerVec = toVec3(center);
  const normalVec = toVec3(normal);
  const endVec = vecAdd(centerVec, normalVec);

  const mainSpineEdge = scope.register(makeLine(centerVec, endVec));
  const spine = scope.register(unwrap(assembleWire([mainSpineEdge])));

  const extrusionLength = vecLength(normalVec);
  const pitch = (360.0 / angleDegrees) * extrusionLength;
  const radius = 1;

  const auxiliarySpine = scope.register(
    makeHelix(pitch, extrusionLength, radius, centerVec, normalVec)
  );

  const law = profileShape
    ? scope.register(unwrap(buildLawFromProfile(extrusionLength, profileShape)))
    : null;

  const result = shellMode
    ? genericSweep(wire, spine, { auxiliarySpine, law }, shellMode)
    : genericSweep(wire, spine, { auxiliarySpine, law });

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
