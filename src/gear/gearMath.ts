/**
 * Pure gear math — involute geometry, planetary kinematics, mesh-quality formulas.
 *
 * No kernel imports; testable without WASM init. Layer 1 in spirit (math only),
 * but lives in gear/ alongside its consumers per module cohesion.
 */

import type { Vec3 } from '@/core/types.js';
import { type Result, ok, err } from '@/core/result.js';
import { validationError } from '@/core/errors.js';

// ── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_PRESSURE_ANGLE_DEG = 20;
export const DEFAULT_CLEARANCE = 0.25;

// ── Diagnostics ──────────────────────────────────────────────────────────────

export type GearDiagnosticSeverity = 'warning' | 'info';

export interface GearDiagnostic {
  code: string;
  severity: GearDiagnosticSeverity;
  message: string;
  context?: Record<string, number | string>;
}

// ── Basic involute helpers ───────────────────────────────────────────────────

/** Involute function: inv(α) = tan α − α. */
export const inv = (alpha: number): number => Math.tan(alpha) - alpha;

/**
 * Involute point on a base circle of radius `rb` at parameter `α`.
 *
 * `theta0` anchors the curve angularly; `sign` = +1 traces CCW (left flank),
 * −1 traces CW (right flank — the mirror).
 */
export function involutePoint(rb: number, alpha: number, theta0: number, sign: 1 | -1): Vec3 {
  const r = rb / Math.cos(alpha);
  const theta = theta0 + sign * (Math.tan(alpha) - alpha);
  return [r * Math.cos(theta), r * Math.sin(theta), 0];
}

/**
 * Cosine-spaced involute samples from the base circle outward.
 *
 * Cosine clustering puts more points near α=0 (base) and α=αMax (tip), where
 * curvature is highest, giving a tight B-spline approximation with few samples.
 */
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

// ── Adaptive sampling defaults ───────────────────────────────────────────────

/** Sample count per involute flank, scaling with module size: max(16, round(8·√m)). */
export function adaptiveSampleCount(moduleSize: number): number {
  return Math.max(16, Math.round(8 * Math.sqrt(moduleSize)));
}

/** B-spline approximation tolerance, scaling with module: m · 1e-5. */
export function adaptiveBSplineTolerance(moduleSize: number): number {
  return moduleSize * 1e-5;
}

// ── Gear geometry per module/teeth/pressure-angle ────────────────────────────

export interface GearGeometry {
  /** Pitch radius. */
  rPitch: number;
  /** Base radius (involute origin). */
  rb: number;
  /** Tip radius — outer for external, inner for internal. */
  rTip: number;
  /** Root radius — inner for external, outer for internal. */
  rRoot: number;
  /** Pressure angle at the pitch circle (= input α). */
  alphaPitch: number;
  /** Half-tooth angular width at the pitch circle, with shift + backlash applied. */
  halfToothAngle: number;
  /** Involute parameter α at rTip (or rRoot for internal — the outer-of-base radius). */
  alphaTip: number;
  /** 2π / Z. */
  toothPitch: number;
  /** True if internal/ring gear (tooth points inward). */
  isInternal: boolean;
}

/**
 * Compute gear geometry from module/teeth/pressure-angle/shift/clearance/backlash.
 *
 * `backlashHalf` is the per-gear thinning (= total backlash / 2 in the per-pair-symmetric model).
 */
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

  // Niemann tooth-thickness at pitch (half-width angle, before backlash)
  const blAng = backlashHalf / rPitch;
  const baseHalfToothAngle = (Math.PI / 2 + 2 * shift * Math.tan(alpha)) / z;
  // External: backlash thins the tooth (subtract). Internal: backlash thins the *space* between
  // ring teeth, which is equivalent to thickening the tooth (add).
  const halfToothAngle = baseHalfToothAngle + (isInternal ? blAng : -blAng);

  // Involute parameter at the outer radius the flank reaches.
  // External: alpha at rTip. Internal: alpha at rRoot (the radius further from base).
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

// ── Working pressure angle solver ────────────────────────────────────────────

/**
 * Solve `inv(αw) = inv(α) + 2(xs + xp − xr)·tan α / (zs + zp)` by bisection.
 *
 * Handles positive AND negative summed shift (HTML version silently fell back to α
 * for negative case — line 436). Returns α when summed shift is exactly 0.
 */
export function solveWorkingPressureAngle(
  alpha: number,
  xs: number,
  xp: number,
  zs: number,
  zp: number,
  xr = 0
): Result<number> {
  const summedShift = xs + xp - xr;
  if (summedShift === 0) return ok(alpha);

  const target = inv(alpha) + (2 * summedShift * Math.tan(alpha)) / (zs + zp);

  // Bisection: extend bracket below α for negative shifts (αw < α), above for positive.
  let lo: number, hi: number;
  if (target > inv(alpha)) {
    lo = alpha;
    hi = Math.PI / 2 - 1e-6;
  } else {
    lo = 1e-4;
    hi = alpha;
  }
  if (inv(hi) < target) {
    return err(
      validationError(
        'GEAR_PA_OUT_OF_RANGE',
        'working pressure angle exceeds π/2 — shifts too large',
        undefined,
        {
          target,
          invHi: inv(hi),
        }
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

// ── Center distance ──────────────────────────────────────────────────────────

/** True (working) center distance r_c = (zs+zp)·m·cos α / (2·cos αw). */
export function workingCenterDistance(
  zs: number,
  zp: number,
  moduleSize: number,
  alpha: number,
  alphaW: number
): number {
  return ((zs + zp) * moduleSize * Math.cos(alpha)) / (2 * Math.cos(alphaW));
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Hard-validate a planetary configuration. Returns Err for kinematically broken
 * configurations (non-integer counts, assembly violation, planet collision).
 *
 * Soft warnings (undercut, near-collision) are returned by `planetaryDiagnostics`.
 */
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
  // Planet collision check using actual planet tip diameter (HTML's hardcoded 2.1 generalized to shift)
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

// ── Mesh quality: contact ratio ──────────────────────────────────────────────

/**
 * Transverse contact ratio for an external-external spur mesh.
 *
 * ε = [√(ra1² − rb1²) + √(ra2² − rb2²) − a·sin αw] / (π·m·cos α)
 *
 * Industry-acceptable mesh: ε ≥ 1.2; smooth running typically ≥ 1.4.
 */
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

/**
 * Transverse contact ratio for an external-internal (planet-ring) mesh.
 *
 * ε = [√(ra_p² − rb_p²) − √(ra_r² − rb_r²) + a·sin αw] / (π·m·cos α)
 *
 * For internal mesh, ra_r is the ring's TIP radius (< rb_r since ring's tip is toward center,
 * but for the line-of-action we use the working tip — we substitute ra_r directly and trust
 * the Math.max(0,...) clamp to handle the (rare) case where rb_r > ra_r mathematically).
 */
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

// ── Mesh quality: undercut ───────────────────────────────────────────────────

/**
 * Minimum profile shift to avoid involute undercutting at the base circle.
 *
 *     x_min = 1 − z·sin²(α) / 2
 *
 * Negative or zero ⇒ no shift needed. Standard derivation from the rack-cutter
 * envelope; assumes addendum = m and full tooth height.
 */
export function undercutMinimumShift(z: number, alpha: number): number {
  return 1 - (z * Math.sin(alpha) * Math.sin(alpha)) / 2;
}

/** Positive amount by which `shift` falls short of the no-undercut threshold (0 if safe). */
export function undercutDeficit(z: number, alpha: number, shift: number): number {
  return Math.max(0, undercutMinimumShift(z, alpha) - shift);
}

// ── Mesh quality: Lewis bending stress ───────────────────────────────────────

/**
 * Lewis form factor Y for α=20°, x=0 (continuous fit).
 *
 *     Y(z) ≈ 0.485 − 2.88/z      (12 ≤ z ≤ 300, ±2% of AGMA tables)
 *
 * Profile shift correction omitted — Y rises ~5% per 0.1 of positive shift,
 * but a closed-form correction adds significant complexity for limited accuracy.
 * Document this in the diagnostics if shift is non-zero.
 */
export function lewisYFactor(z: number): number {
  if (z < 8) return 0.2; // floor for very-low-Z gears (undercut territory anyway)
  return 0.485 - 2.88 / z;
}

/**
 * Lewis bending stress at the tooth root, MPa.
 *
 *     σ = 2·T / (z · m² · F · Y)
 *
 * Where T = applied torque [N·mm], m = module [mm], F = face width [mm], z = teeth.
 * Caller passes torque in N·m; we convert to N·mm here.
 */
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

// ── Backlash split ───────────────────────────────────────────────────────────

/**
 * Per-gear backlash thinning under "split symmetrically" semantics.
 *
 * Each gear (sun, planet, ring) loses `b/2` of tooth thickness; each mesh gap = b.
 * Returns the per-gear half-backlash (= b/2).
 */
export function backlashHalf(totalBacklash: number): number {
  return totalBacklash / 2;
}

// ── Planetary kinematics ─────────────────────────────────────────────────────

/** Ring teeth from sun + planet teeth: zr = zs + 2·zp (always). */
export function ringTeeth(zs: number, zp: number): number {
  return zs + 2 * zp;
}

/** Even-tooth phase offset so teeth align with spaces of the mating gear: π/z if even, 0 if odd. */
export function evenToothPhaseOffset(z: number): number {
  return z % 2 === 0 ? Math.PI / z : 0;
}

/**
 * Initial self-rotation angle (radians) for planet `i` so its teeth mesh between sun teeth
 * at orbital angle α_i = i·2π/N.
 *
 *     θ_p = α_i · (1 + zs/zp) + φ_p     where φ_p = π/zp if zp even else 0
 *
 * Derived from the rolling constraint: when the carrier is at α_i, the planet's self-rotation
 * must compensate so the same flank touches the sun.
 */
export function planetSelfRotationAngle(orbitalAngle: number, zs: number, zp: number): number {
  return orbitalAngle * (1 + zs / zp) + evenToothPhaseOffset(zp);
}
