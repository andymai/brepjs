import type { Vec3 } from '@/core/types.js';
import { type Result, ok, err, isErr } from '@/core/result.js';
import { validationError } from '@/core/errors.js';

export const DEFAULT_PRESSURE_ANGLE_DEG = 20;
export const DEFAULT_CLEARANCE = 0.25;

export type GearDiagnosticSeverity = 'warning' | 'info';

export type GearDiagnosticCode =
  | 'CONTACT_RATIO_LOW_SUN_PLANET'
  | 'CONTACT_RATIO_LOW_PLANET_RING'
  | 'UNDERCUT_RISK'
  | 'UNDERCUT_RISK_SUN'
  | 'UNDERCUT_RISK_PLANET'
  | 'LEWIS_Y_SHIFT_UNCORRECTED'
  | 'PLANETARY_SHIFT_KINEMATIC_MISMATCH';

export interface GearDiagnostic {
  code: GearDiagnosticCode;
  severity: GearDiagnosticSeverity;
  message: string;
  context?: Record<string, number | string>;
}

export const inv = (alpha: number): number => Math.tan(alpha) - alpha;

export function involutePoint(rb: number, alpha: number, theta0: number, sign: 1 | -1): Vec3 {
  const r = rb / Math.cos(alpha);
  const theta = theta0 + sign * (Math.tan(alpha) - alpha);
  return [r * Math.cos(theta), r * Math.sin(theta), 0];
}

export function cosineSpaceFlankSamples(
  rb: number,
  alphaMax: number,
  theta0: number,
  count: number,
  sign: 1 | -1
): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i <= count; i++) {
    const t = 0.5 - 0.5 * Math.cos((i / count) * Math.PI);
    pts.push(involutePoint(rb, t * alphaMax, theta0, sign));
  }
  return pts;
}

export function adaptiveSampleCount(moduleSize: number): number {
  return Math.max(16, Math.round(8 * Math.sqrt(moduleSize)));
}

export interface GearGeometry {
  rPitch: number;
  rb: number;
  /** Outer radius for external, inner for internal. */
  rTip: number;
  /** Inner radius for external, outer for internal. */
  rRoot: number;
  alphaPitch: number;
  /** Half-tooth angular width at the pitch circle, with shift + backlash applied. */
  halfToothAngle: number;
  /** Involute parameter α at the radius the flank reaches (rTip ext, rRoot int). */
  alphaTip: number;
  toothPitch: number;
  isInternal: boolean;
}

export function gearGeometry(
  z: number,
  moduleSize: number,
  alpha: number,
  shift: number,
  clearance: number,
  backlashHalf: number,
  isInternal: boolean
): GearGeometry {
  const rPitch = (z * moduleSize) / 2;
  const rb = rPitch * Math.cos(alpha);
  const addendum = moduleSize * (1 + shift);
  const dedendum = moduleSize * (1 + clearance - shift);
  const rTip = isInternal ? rPitch - moduleSize * (1 - shift) : rPitch + addendum;
  const rRoot = isInternal ? rPitch + moduleSize * (1 + clearance + shift) : rPitch - dedendum;

  const blAng = backlashHalf / rPitch;
  const baseHalfToothAngle = (Math.PI / 2 + 2 * shift * Math.tan(alpha)) / z;
  // Internal: backlash thins the space between ring teeth, equivalent to thickening the tooth.
  const halfToothAngle = baseHalfToothAngle + (isInternal ? blAng : -blAng);

  const rOuter = isInternal ? rRoot : rTip;
  const alphaTip = rOuter <= rb ? 0 : Math.acos(Math.min(1, rb / rOuter));

  return {
    rPitch,
    rb,
    rTip,
    rRoot,
    alphaPitch: alpha,
    halfToothAngle,
    alphaTip,
    toothPitch: (2 * Math.PI) / z,
    isInternal,
  };
}

/**
 * Solve `inv(αw) = inv(α) + 2·(summedShift)·tan α / totalTeeth` by bisection.
 *
 * For external-external mesh: summedShift = x1 + x2, totalTeeth = z1 + z2.
 * For external-internal mesh: summedShift = xInternal − xExternal, totalTeeth = zInternal − zExternal.
 *
 * Returns Err for shifts that push αw outside (epsilon, π/2).
 */
export function solveWorkingPressureAngle(
  alpha: number,
  summedShift: number,
  totalTeeth: number
): Result<number> {
  if (summedShift === 0) return ok(alpha);

  const target = inv(alpha) + (2 * summedShift * Math.tan(alpha)) / totalTeeth;
  const epsilon = 1e-4;

  let lo: number, hi: number;
  if (target > inv(alpha)) {
    lo = alpha;
    hi = Math.PI / 2 - 1e-6;
  } else {
    lo = epsilon;
    hi = alpha;
  }

  if (target > inv(hi) || target < inv(lo)) {
    return err(
      validationError(
        'GEAR_PA_OUT_OF_RANGE',
        `working pressure angle out of range — target inv(αw)=${target.toFixed(4)} not in [${inv(lo).toFixed(4)}, ${inv(hi).toFixed(4)}]`,
        undefined,
        { target, invLo: inv(lo), invHi: inv(hi) }
      )
    );
  }

  for (let i = 0; i < 50; i++) {
    const mid = 0.5 * (lo + hi);
    if (inv(mid) < target) lo = mid;
    else hi = mid;
  }
  return ok(0.5 * (lo + hi));
}

/** Convenience: working PA for an external-external mesh (sun-planet). */
export function solveSunPlanetWorkingPressureAngle(
  alpha: number,
  xSun: number,
  xPlanet: number,
  zSun: number,
  zPlanet: number
): Result<number> {
  return solveWorkingPressureAngle(alpha, xSun + xPlanet, zSun + zPlanet);
}

/** Convenience: working PA for an external-internal mesh (planet-ring). */
export function solvePlanetRingWorkingPressureAngle(
  alpha: number,
  xPlanet: number,
  xRing: number,
  zPlanet: number,
  zRing: number
): Result<number> {
  return solveWorkingPressureAngle(alpha, xRing - xPlanet, zRing - zPlanet);
}

export function workingCenterDistance(
  zs: number,
  zp: number,
  moduleSize: number,
  alpha: number,
  alphaW: number
): number {
  return ((zs + zp) * moduleSize * Math.cos(alpha)) / (2 * Math.cos(alphaW));
}

export function validatePlanetary(
  zs: number,
  zp: number,
  n: number,
  planetShift: number
): Result<void> {
  if (!Number.isInteger(zs) || !Number.isInteger(zp) || !Number.isInteger(n))
    return err(
      validationError('GEAR_NON_INTEGER_TEETH', 'tooth counts and planet count must be integers')
    );
  if (zs < 4 || zp < 4 || n < 2)
    return err(validationError('GEAR_TEETH_TOO_FEW', 'zs ≥ 4, zp ≥ 4, N ≥ 2 required'));
  if ((2 * zs + 2 * zp) % n !== 0)
    return err(
      validationError(
        'GEAR_ASSEMBLY',
        `(2·zs + 2·zp) must be divisible by N — got ${2 * zs + 2 * zp} mod ${n} = ${(2 * zs + 2 * zp) % n}`
      )
    );
  const planetTipDiameter = zp + 2 + 2 * planetShift;
  const minClearance = (zs + zp) * Math.sin(Math.PI / n);
  if (minClearance <= planetTipDiameter)
    return err(
      validationError(
        'GEAR_PLANET_COLLISION',
        `planet tips would collide: (zs+zp)·sin(π/N) = ${minClearance.toFixed(3)} ≤ planet tip = ${planetTipDiameter.toFixed(3)}`
      )
    );
  return ok(undefined);
}

export function externalExternalContactRatio(
  ra1: number,
  rb1: number,
  ra2: number,
  rb2: number,
  centerDistance: number,
  moduleSize: number,
  alpha: number,
  alphaW: number
): number {
  const lineOfAction =
    Math.sqrt(Math.max(0, ra1 * ra1 - rb1 * rb1)) +
    Math.sqrt(Math.max(0, ra2 * ra2 - rb2 * rb2)) -
    centerDistance * Math.sin(alphaW);
  return lineOfAction / (Math.PI * moduleSize * Math.cos(alpha));
}

export function externalInternalContactRatio(
  ra_p: number,
  rb_p: number,
  ra_r: number,
  rb_r: number,
  centerDistance: number,
  moduleSize: number,
  alpha: number,
  alphaW: number
): number {
  const lineOfAction =
    Math.sqrt(Math.max(0, ra_p * ra_p - rb_p * rb_p)) -
    Math.sqrt(Math.max(0, ra_r * ra_r - rb_r * rb_r)) +
    centerDistance * Math.sin(alphaW);
  return lineOfAction / (Math.PI * moduleSize * Math.cos(alpha));
}

export function undercutMinimumShift(z: number, alpha: number): number {
  return 1 - (z * Math.sin(alpha) * Math.sin(alpha)) / 2;
}

export function undercutDeficit(z: number, alpha: number, shift: number): number {
  return Math.max(0, undercutMinimumShift(z, alpha) - shift);
}

export function lewisYFactor(z: number): number {
  if (z < 8) return 0.2;
  return 0.485 - 2.88 / z;
}

export function lewisRootStress(
  appliedTorqueNm: number,
  moduleSize: number,
  faceWidth: number,
  z: number
): number {
  const torqueNmm = appliedTorqueNm * 1000;
  const Y = lewisYFactor(z);
  if (Y <= 0 || faceWidth <= 0 || moduleSize <= 0) return Infinity;
  return (2 * torqueNmm) / (z * moduleSize * moduleSize * faceWidth * Y);
}

export function backlashHalf(totalBacklash: number): number {
  return totalBacklash / 2;
}

export function ringTeeth(zs: number, zp: number): number {
  return zs + 2 * zp;
}

export function evenToothPhaseOffset(z: number): number {
  return z % 2 === 0 ? Math.PI / z : 0;
}

export function planetSelfRotationAngle(orbitalAngle: number, zs: number, zp: number): number {
  return orbitalAngle * (1 + zs / zp) + evenToothPhaseOffset(zp);
}

/** Pure-kinematics inputs for {@link planetPlacements}; subset of `PlanetaryGearParams`. */
export interface PlanetPlacementParams {
  moduleSize?: number;
  sunTeeth?: number;
  planetTeeth?: number;
  numPlanets?: number;
  pressureAngleDeg?: number;
  sunShift?: number;
  planetShift?: number;
}

export interface PlanetPlacement {
  /** Self-rotation around the planet's own Z axis, in degrees. */
  rotationDeg: number;
  /** Center of the planet in the assembly frame: `[x, y, 0]`. */
  position: Vec3;
}

/**
 * Compute the rigid placement of each planet without building any solid.
 *
 * Pairs with one materialized planet from `makeExternalGear` to support
 * GPU-instanced rendering: mesh once, draw N times under these transforms.
 * Defaults match {@link PlanetaryGearParams}.
 */
export function planetPlacements(params: PlanetPlacementParams = {}): Result<PlanetPlacement[]> {
  const moduleSize = params.moduleSize ?? 3;
  const sunTeeth = params.sunTeeth ?? 15;
  const planetTeeth = params.planetTeeth ?? 12;
  const numPlanets = params.numPlanets ?? 3;
  const alpha = ((params.pressureAngleDeg ?? DEFAULT_PRESSURE_ANGLE_DEG) * Math.PI) / 180;
  const sunShift = params.sunShift ?? 0;
  const planetShift = params.planetShift ?? 0;

  const validation = validatePlanetary(sunTeeth, planetTeeth, numPlanets, planetShift);
  if (isErr(validation)) return validation;

  const sp = solveSunPlanetWorkingPressureAngle(
    alpha,
    sunShift,
    planetShift,
    sunTeeth,
    planetTeeth
  );
  if (isErr(sp)) return sp;
  const centerDistance = workingCenterDistance(sunTeeth, planetTeeth, moduleSize, alpha, sp.value);

  const placements: PlanetPlacement[] = [];
  for (let i = 0; i < numPlanets; i++) {
    const orbital = (i * 2 * Math.PI) / numPlanets;
    const selfRot = planetSelfRotationAngle(orbital, sunTeeth, planetTeeth);
    placements.push({
      rotationDeg: (selfRot * 180) / Math.PI,
      position: [centerDistance * Math.cos(orbital), centerDistance * Math.sin(orbital), 0],
    });
  }
  return ok(placements);
}
