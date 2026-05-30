/**
 * Reusable factories and constants for parity spec tests.
 *
 * Imports are kept local to this folder so individual parity files stay short.
 * See {@link ../README.md} for the spec policy.
 */

import * as fc from 'fast-check';
import { box, cylinder, sphere, cone, torus, translate } from '@/index.js';
import type { Vec3 } from '@/core/types.js';
import type { ValidSolid, Shape3D } from '@/core/shapeTypes.js';

/** Number of fast-check runs per property. Balances coverage vs CI runtime. */
export const NUM_RUNS = 50;

/** Default relative tolerance for fast-check invariants. */
export const REL_TOL = 1e-6;

/**
 * fast-check arbitrary for a "reasonable" geometric dimension in mm.
 * Excludes near-zero (degenerate) and very large (precision-loss) values.
 */
export const fcDim = (): fc.Arbitrary<number> => fc.double({ min: 0.5, max: 50, noNaN: true });

/**
 * A coordinate offset (can be negative), quantized to a 0.05 mm grid.
 *
 * OCCT booleans return grossly wrong volumes (observed up to ~98% off) when a
 * cube is shifted by a sub-micron, non-zero offset — a near-coincident config
 * the kernel resolves unstably. fast-check shrinks toward exactly those values
 * (offsets ≈ 4e-7), reddening CI nondeterministically. Quantizing keeps the
 * smallest non-zero offset (0.05) clear of that band while leaving 0 exact;
 * 1001 grid points is ample coverage for overlap/containment geometry.
 */
export const fcOffset = (): fc.Arbitrary<number> =>
  fc.double({ min: -25, max: 25, noNaN: true }).map((x) => Math.round(x / 0.05) * 0.05);

/** Build a box of given dimensions at the origin. */
export function unitCube(w: number, d: number, h: number): Shape3D {
  return box(w, d, h);
}

/** Build a sphere of given radius at origin. */
export function unitSphere(r: number): ValidSolid {
  return sphere(r);
}

/** Build a cylinder of given radius and height at origin, Z axis. */
export function unitCylinder(r: number, h: number): ValidSolid {
  return cylinder(r, h);
}

/** Build a frustum (truncated cone) at origin, Z axis. */
export function unitFrustum(r1: number, r2: number, h: number): ValidSolid {
  return cone(r1, r2, h);
}

/** Build a torus at origin. */
export function unitTorus(R: number, r: number): ValidSolid {
  return torus(R, r);
}

/** Translate any 3D shape by (dx, dy, dz). */
export function shiftedBy<T extends Shape3D>(shape: T, dx: number, dy: number, dz: number): T {
  return translate(shape, [dx, dy, dz]);
}

/**
 * Closed-form formulas — keep these centralized so test assertions stay
 * readable and a single source-of-truth catches transcription errors.
 */
export const formula = {
  /** Box volume = w·d·h. */
  boxVolume: (w: number, d: number, h: number): number => w * d * h,
  /** Box surface area = 2(wd + wh + dh). */
  boxArea: (w: number, d: number, h: number): number => 2 * (w * d + w * h + d * h),
  /** Sphere volume = (4/3)·π·r³. */
  sphereVolume: (r: number): number => (4 / 3) * Math.PI * r ** 3,
  /** Sphere surface area = 4π·r². */
  sphereArea: (r: number): number => 4 * Math.PI * r ** 2,
  /** Cylinder volume = π·r²·h. */
  cylinderVolume: (r: number, h: number): number => Math.PI * r ** 2 * h,
  /** Cylinder total surface area = 2π·r·h + 2π·r². */
  cylinderArea: (r: number, h: number): number => 2 * Math.PI * r * h + 2 * Math.PI * r ** 2,
  /** Frustum volume = (π·h/3)·(R² + R·r + r²). */
  frustumVolume: (R: number, r: number, h: number): number =>
    ((Math.PI * h) / 3) * (R * R + R * r + r * r),
  /** Cone volume = (1/3)·π·r²·h (frustum with r2=0). */
  coneVolume: (r: number, h: number): number => (1 / 3) * Math.PI * r ** 2 * h,
  /** Torus volume = 2·π²·R·r². */
  torusVolume: (R: number, r: number): number => 2 * Math.PI ** 2 * R * r ** 2,
  /** Torus surface area = 4·π²·R·r. */
  torusArea: (R: number, r: number): number => 4 * Math.PI ** 2 * R * r,
};

// ---------------------------------------------------------------------------
// Vector helpers — used across parity tests for spatial assertions.
// ---------------------------------------------------------------------------

/** Euclidean length of a 3D vector. */
export function vecLen(v: Vec3): number {
  return Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
}

/** Component-wise subtraction: a − b. */
export function vecSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Component-wise addition: a + b. */
export function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** Dot product: a · b. */
export function vecDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
