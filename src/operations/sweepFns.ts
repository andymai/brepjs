/**
 * Sweep operations — generic sweep, support extrude, complex extrude,
 * twist extrude, multi-section sweep, and guided sweep.
 *
 * Consolidated from extrudeFns, multiSweepFns, and guidedSweepFns.
 */

import { getKernel } from '@/kernel/index.js';
import type { KernelShape, KernelType } from '@/kernel/types.js';
import type { Vec3 } from '@/core/types.js';
import { vecAdd, vecLength } from '@/core/vecOps.js';
import type { ClosedWire, Dimension, Wire, Shell, Solid, Shape3D } from '@/core/shapeTypes.js';
import {
  castResultShape,
  disposeResultShape,
  isShape3D,
  isWire as isWireGuard,
} from '@/core/shapeTypes.js';
import { type Result, ok, err, isErr } from '@/core/result.js';
import {
  type BrepError,
  validationError,
  kernelError,
  typeCastError,
  BrepErrorCode,
} from '@/core/errors.js';
import { buildLawFromProfile, type ExtrusionProfile, type SweepOptions } from './extrudeUtils.js';

// Re-export types from consolidated modules
export type { ExtrusionProfile, SweepOptions } from './extrudeUtils.js';

/** Configuration for a single sweep section (profile wire + optional location). */
export interface SweepSectionConfig {
  /** The profile wire for this section. */
  wire: Wire<Dimension>;
  /** Location along the spine as a parameter in [0.0, 1.0]. Auto-distributed if omitted. */
  location?: number;
}

/** Options for the multi-section sweep operation. */
export interface MultiSweepOptions {
  /** Produce a solid (true) or shell (false). Defaults to true. */
  solid?: boolean;
  /** Use ruled (straight) interpolation between sections. Defaults to false. */
  ruled?: boolean;
  /** Tolerance for the loft builder. Defaults to 1e-6. */
  tolerance?: number;
}

/** Options for guide curve sweep. */
export interface GuidedSweepOptions {
  /** Transition mode at spine vertices. Defaults to 'transformed'. */
  transition?: 'transformed' | 'round' | 'right';
  /** Produce a solid (true) or shell (false). Defaults to true. */
  solid?: boolean;
  /** Builder tolerance. When set, passed to SetTolerance. */
  tolerance?: number;
}

// ---------------------------------------------------------------------------
// Internal: spine construction
// ---------------------------------------------------------------------------

/** Build a wire spine from start to end point (line segment). */
function makeSpineWire(start: Vec3, end: Vec3): Wire {
  const kernel = getKernel();
  const edge = kernel.makeLineEdge([...start], [...end]);
  const wire = kernel.makeWire([edge]);
  // The edge is consumed into the wire (shared refcounted TShape); `.delete()` is
  // a no-op on arena kernels, so release its slot through kernel.dispose.
  kernel.dispose(edge);
  return castResultShape(wire) as Wire;
}

/** Build a helix wire for twist extrusion. */
function makeHelixWire(
  pitch: number,
  height: number,
  radius: number,
  center: Vec3,
  dir: Vec3,
  leftHanded = false
): Wire {
  const kernel = getKernel();
  return castResultShape(
    kernel.makeHelixWire(pitch, height, radius, [...center], [...dir], leftHanded)
  ) as Wire;
}

// ---------------------------------------------------------------------------
// Generic sweep
// ---------------------------------------------------------------------------

/** Cast a shell-mode sweep result `[shell, startWire, endWire]`, releasing all three on any reject. */
function castSweepShellTuple(result: {
  shape: KernelShape;
  firstShape: KernelShape;
  lastShape: KernelShape;
}): Result<[Shape3D, Wire, Wire]> {
  const shape = castResultShape(result.shape);
  const startWire = castResultShape(result.firstShape);
  const endWire = castResultShape(result.lastShape);
  const disposeAll = (): void => {
    disposeResultShape(shape);
    disposeResultShape(startWire);
    disposeResultShape(endWire);
  };
  if (!isShape3D(shape)) {
    disposeAll();
    return err(typeCastError('SWEEP_NOT_3D', 'Sweep did not produce a 3D shape'));
  }
  if (!isWireGuard(startWire)) {
    disposeAll();
    return err(typeCastError('SWEEP_START_NOT_WIRE', 'Sweep did not produce a start Wire'));
  }
  if (!isWireGuard(endWire)) {
    disposeAll();
    return err(typeCastError('SWEEP_END_NOT_WIRE', 'Sweep did not produce an end Wire'));
  }
  return ok([shape, startWire, endWire] as [Shape3D, Wire, Wire]);
}

/**
 * Sweep a wire profile along a spine wire to create a 3D shape.
 *
 * Supports Frenet framing, auxiliary spine twist, scaling laws, contact
 * detection, and configurable corner transition modes.
 *
 * @param wire - The profile wire to sweep (must be closed for solid output).
 * @param spine - The path wire to sweep along.
 * @param config - Sweep configuration (frenet, transition mode, scaling law, etc.).
 * @param shellMode - When `true`, return `[shell, startWire, endWire]` instead of a solid.
 * @returns `Result` containing either a solid or a `[Shape3D, Wire, Wire]` tuple in shell mode.
 */
export function sweep(
  wire: ClosedWire<Dimension>,
  spine: Wire<Dimension>,
  config: SweepOptions = {},
  shellMode = false
): Result<Shape3D | [Shape3D, Wire, Wire]> {
  // Fast path: simple pipe mode (BRepOffsetAPI_MakePipe)
  if (config.mode === 'simple' && !shellMode) {
    const kernel = getKernel();
    const resultOc = kernel.simplePipe(wire.wrapped, spine.wrapped);
    const shape = castResultShape(resultOc);
    if (!isShape3D(shape)) {
      disposeResultShape(shape);
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
    return castSweepShellTuple(result);
  }

  const shape = castResultShape(result);
  if (!isShape3D(shape)) {
    disposeResultShape(shape);
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
 * @param wire - The profile wire to sweep (must be closed).
 * @param center - Start point of the extrusion spine.
 * @param normal - Direction and length of the extrusion.
 * @param support - kernel support surface that constrains the sweep.
 * @returns `Result` containing the swept 3D shape.
 */
export function supportExtrude(
  wire: ClosedWire<Dimension>,
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
 * @param wire - The profile wire to sweep (must be closed).
 * @param center - Start point of the extrusion spine.
 * @param normal - Direction and length of the extrusion. Must be non-zero.
 * @param profileShape - Optional scaling profile applied along the extrusion.
 * @param shellMode - When `true`, return `[shell, startWire, endWire]` instead of a solid.
 * @returns `Result` containing the extruded shape or a shell tuple.
 */
export function complexExtrude(
  wire: ClosedWire<Dimension>,
  center: Vec3,
  normal: Vec3,
  profileShape?: ExtrusionProfile,
  shellMode = false
): Result<Shape3D | [Shape3D, Wire, Wire]> {
  const extrusionLength = vecLength(normal);
  if (extrusionLength < 1e-10) {
    return err(
      validationError('ZERO_LENGTH_EXTRUSION', 'Extrusion vector cannot have zero length')
    );
  }
  const endPoint = vecAdd(center, normal);
  // sweep is immutable and does not consume the spine — dispose it on every exit.
  using spine = makeSpineWire(center, endPoint);
  let law = null;
  if (profileShape) {
    const lawResult = buildLawFromProfile(extrusionLength, profileShape);
    if (isErr(lawResult)) return lawResult;
    law = lawResult.value;
  }
  return sweep(wire, spine, { law }, shellMode);
}

/**
 * Extrude a wire along a normal with helical twist and optional profile scaling.
 *
 * Constructs a helical auxiliary spine that rotates the profile by
 * `angleDegrees` over the extrusion length. Combines twist with optional
 * s-curve or linear scaling when `profileShape` is provided.
 *
 * @param wire - The profile wire to sweep (must be closed).
 * @param angleDegrees - Total twist rotation in degrees. Must be non-zero.
 * @param center - Start point of the extrusion spine.
 * @param normal - Direction and length of the extrusion. Must be non-zero.
 * @param profileShape - Optional scaling profile applied along the extrusion.
 * @param shellMode - When `true`, return `[shell, startWire, endWire]` instead of a solid.
 * @returns `Result` containing the twisted extruded shape or a shell tuple.
 */
export function twistExtrude(
  wire: ClosedWire<Dimension>,
  angleDegrees: number,
  center: Vec3,
  normal: Vec3,
  profileShape?: ExtrusionProfile,
  shellMode = false
): Result<Shape3D | [Shape3D, Wire, Wire]> {
  if (Math.abs(angleDegrees) < 1e-10) {
    return err(validationError('ZERO_TWIST_ANGLE', 'Twist angle cannot be zero'));
  }
  const extrusionLength = vecLength(normal);
  if (extrusionLength < 1e-10) {
    return err(
      validationError('ZERO_LENGTH_EXTRUSION', 'Extrusion vector cannot have zero length')
    );
  }

  const endPoint = vecAdd(center, normal);
  // sweep is immutable and consumes neither spine — dispose both on every exit.
  using spine = makeSpineWire(center, endPoint);

  const leftHanded = angleDegrees < 0;
  const pitch = (360.0 / Math.abs(angleDegrees)) * extrusionLength;
  using auxiliarySpine = makeHelixWire(pitch, extrusionLength, 1, center, normal, leftHanded);

  let law = null;
  if (profileShape) {
    const lawResult = buildLawFromProfile(extrusionLength, profileShape);
    if (isErr(lawResult)) return lawResult;
    law = lawResult.value;
  }
  return sweep(wire, spine, { auxiliarySpine, law }, shellMode);
}

// ---------------------------------------------------------------------------
// Multi-section sweep — helpers
// ---------------------------------------------------------------------------

/** Validate that explicit section locations are in [0,1] and strictly increasing. */
function validateSectionLocations(
  sections: ReadonlyArray<SweepSectionConfig>
): BrepError | undefined {
  const explicitLocations = sections.map((s) => s.location);
  for (let i = 0; i < explicitLocations.length; i++) {
    const loc = explicitLocations[i];
    if (loc !== undefined && (loc < 0 || loc > 1)) {
      return validationError(
        BrepErrorCode.MULTI_SWEEP_FAILED,
        `Section ${i} location ${loc} is out of range [0, 1]`
      );
    }
  }
  const definedLocs = explicitLocations.filter((l): l is number => l !== undefined);
  for (let i = 1; i < definedLocs.length; i++) {
    if ((definedLocs[i] ?? 0) <= (definedLocs[i - 1] ?? 0)) {
      return validationError(
        BrepErrorCode.MULTI_SWEEP_FAILED,
        'Section locations must be strictly increasing'
      );
    }
  }
  return undefined;
}

/** Compute spine parameters for each section given the spine's parameter range. */
function computeSectionParams(
  sections: ReadonlyArray<SweepSectionConfig>,
  spine: Wire<Dimension>,
  kernel: ReturnType<typeof getKernel>
): Result<number[]> {
  const [uFirst, uLast] = kernel.curveParameters(spine.wrapped);
  const uRange = uLast - uFirst;

  // Build params: explicit locations override, gaps are linearly interpolated
  // between the nearest explicit neighbors (or 0/1 at boundaries).
  const params: number[] = new Array(sections.length);
  // First pass: resolve explicit locations
  for (let i = 0; i < sections.length; i++) {
    const loc = sections[i]?.location;
    params[i] = loc !== undefined ? uFirst + loc * uRange : Number.NaN;
  }
  // Second pass: interpolate gaps between explicit anchors
  let prevIdx = -1;
  let prevVal = uFirst; // implicit 0.0 at start
  for (let i = 0; i <= sections.length; i++) {
    const isEnd = i === sections.length;
    const isExplicit = !isEnd && !Number.isNaN(params[i] ?? Number.NaN);
    if (isExplicit || isEnd) {
      const nextVal = isEnd ? uLast : (params[i] ?? uLast);
      // Fill gap between prevIdx+1 and i-1
      const gapCount = i - prevIdx - 1;
      for (let g = 1; g <= gapCount; g++) {
        params[prevIdx + g] = prevVal + (g / (gapCount + 1)) * (nextVal - prevVal);
      }
      if (!isEnd) {
        prevIdx = i;
        prevVal = params[i] ?? uFirst;
      }
    }
  }

  // Validate: final params must be strictly increasing
  for (let i = 1; i < params.length; i++) {
    if ((params[i] ?? 0) <= (params[i - 1] ?? 0)) {
      return err(
        validationError(
          BrepErrorCode.MULTI_SWEEP_FAILED,
          `Computed section parameters are not strictly increasing at index ${i} ` +
            `(${params[i - 1]?.toFixed(4)} >= ${params[i]?.toFixed(4)})`
        )
      );
    }
  }

  return ok(params);
}

// ---------------------------------------------------------------------------
// Multi-section sweep
// ---------------------------------------------------------------------------

/**
 * Sweep multiple profile sections along a spine wire.
 *
 * Each section wire is positioned at a point along the spine (either at an
 * explicit `location` parameter or auto-distributed evenly). The profiles
 * are then lofted using `BRepOffsetAPI_ThruSections`.
 *
 * @param sections - At least 2 section configs with profile wires.
 * @param spine - The path wire to sweep along.
 * @param options - Sweep configuration.
 * @returns Result containing the swept Solid or Shell.
 */
export function multiSectionSweep(
  sections: ReadonlyArray<SweepSectionConfig>,
  spine: Wire<Dimension>,
  options?: MultiSweepOptions
): Result<Solid | Shell> {
  if (sections.length < 2) {
    return err(
      validationError(
        BrepErrorCode.MULTI_SWEEP_INSUFFICIENT_SECTIONS,
        `Multi-section sweep requires at least 2 sections, got ${sections.length}`
      )
    );
  }

  const { solid = true, ruled = false, tolerance = 1e-6 } = options ?? {};

  // Validate locations before touching the kernel — returns clean Result errors
  const locationErr = validateSectionLocations(sections);
  if (locationErr) return err(locationErr);

  try {
    const kernel = getKernel();
    const paramsResult = computeSectionParams(sections, spine, kernel);
    if (isErr(paramsResult)) return paramsResult;
    const params = paramsResult.value;

    // Position each profile wire along the spine and loft. positionOnCurve and
    // downcast each allocate a fresh arena slot per section that loftAdvanced only
    // consumes (never frees) — track and release them once the loft is built.
    const positioned: KernelShape[] = [];
    const positionedWires: KernelShape[] = [];
    try {
      for (let i = 0; i < sections.length; i++) {
        const param = params[i];
        const section = sections[i];
        if (param === undefined || section === undefined) continue;

        const p = kernel.positionOnCurve(section.wire.wrapped, spine.wrapped, param);
        positioned.push(p);
        positionedWires.push(kernel.downcast(p, 'wire'));
      }

      const loftResult = kernel.loftAdvanced(positionedWires, { solid, ruled, tolerance });

      const result = castResultShape(loftResult);
      if (!isShape3D(result)) {
        disposeResultShape(result);
        return err(
          typeCastError('MULTI_SWEEP_NOT_3D', 'Multi-section sweep did not produce a 3D shape')
        );
      }
      return ok(result as Solid | Shell);
    } finally {
      // The loft result shares these wires' refcounted TShapes and survives.
      // release() is idempotent, so an aliased downcast (occt-wasm) is safe.
      for (const w of positionedWires) kernel.dispose(w);
      for (const p of positioned) kernel.dispose(p);
    }
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      kernelError(
        BrepErrorCode.MULTI_SWEEP_FAILED,
        `Multi-section sweep failed: ${raw}`,
        e,
        undefined,
        'Common causes: profile too large for path curvature, self-intersecting result, or discontinuous path. Try simplifying the profile or path.'
      )
    );
  }
}

// ---------------------------------------------------------------------------
// Guided sweep
// ---------------------------------------------------------------------------

/**
 * Sweep a profile wire along a spine, using guide wires to control shape evolution.
 *
 * The first guide wire is used as an auxiliary spine via `SetMode_5`, which
 * controls how the profile orientation evolves along the path.
 *
 * @param profile - The cross-section wire to sweep.
 * @param spine - The path wire to sweep along.
 * @param guides - Guide wires controlling profile evolution. First guide is used as auxiliary spine.
 * @param options - Sweep configuration.
 * @returns Result containing the swept Solid or Shell.
 */
export function guidedSweep(
  profile: Wire<Dimension>,
  spine: Wire<Dimension>,
  guides: ReadonlyArray<Wire<Dimension>>,
  options: GuidedSweepOptions = {}
): Result<Solid | Shell> {
  const { transition = 'transformed', solid = true, tolerance } = options;

  try {
    const kernel = getKernel();
    const shellMode = !solid;

    const auxiliary = guides.length > 0 ? guides[0]?.wrapped : undefined;
    const sweepResult = kernel.sweepPipeShell(profile.wrapped, spine.wrapped, {
      transitionMode: transition,
      ...(auxiliary ? { auxiliary } : {}),
      shellMode,
      ...(tolerance !== undefined ? { tolerance, boundTolerance: tolerance } : {}),
    });

    const ocShape =
      typeof sweepResult === 'object' && 'shape' in sweepResult ? sweepResult.shape : sweepResult;

    const result = castResultShape(ocShape);
    if (!isShape3D(result)) {
      disposeResultShape(result);
      return err(typeCastError('GUIDED_SWEEP_NOT_3D', 'Guided sweep did not produce a 3D shape'));
    }
    return ok(result as Solid | Shell);
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      kernelError(
        BrepErrorCode.GUIDED_SWEEP_FAILED,
        `Guided sweep failed: ${raw}`,
        e,
        undefined,
        'Common causes: profile too large for path curvature, self-intersecting result, or discontinuous path. Try simplifying the profile or path.'
      )
    );
  }
}
