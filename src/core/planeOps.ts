/**
 * Pure plane operations — replaces the old Plane class methods.
 * All functions return new immutable Plane objects.
 */

import type { Vec3, Vec2, PointInput } from './types.js';
import { toVec3 } from './types.js';
import type { Plane, PlaneName, PlaneInput } from './planeTypes.js';
import {
  vecAdd,
  vecSub,
  vecScale,
  vecDot,
  vecCross,
  vecNormalize,
  vecIsZero,
  vecRotate,
} from './vecOps.js';
import { DEG2RAD } from './constants.js';
import { type Result, ok, err, unwrap } from './result.js';
import { validationError } from './errors.js';

// ---------------------------------------------------------------------------
// Plane construction
// ---------------------------------------------------------------------------

/**
 * Create a {@link Plane} from an origin, optional X direction, and a normal.
 *
 * If `xDirection` is omitted, the X axis is derived automatically via kernel `gp_Ax3`.
 *
 * @param origin - Origin point of the plane.
 * @param xDirection - Explicit X axis direction, or `null` to auto-derive.
 * @param normal - Plane normal (Z direction).
 * @throws If the normal or derived xDir is zero-length.
 */
export function createPlane(
  origin: Vec3,
  xDirection: Vec3 | null = null,
  normal: Vec3 = [0, 0, 1]
): Plane {
  const zDir = vecNormalize(normal);
  if (vecIsZero(zDir)) throw new Error('Plane normal must be non-zero');

  let xDir: Vec3;
  if (!xDirection) {
    // Derive xDir perpendicular to zDir (same algorithm as kernel gp_Ax3)
    const [nx, ny, nz] = zDir;
    const absX = Math.abs(nx),
      absY = Math.abs(ny),
      absZ = Math.abs(nz);
    // Pick the axis least aligned with zDir to cross-product with
    let candidate: Vec3;
    if (absX <= absY && absX <= absZ) candidate = [1, 0, 0];
    else if (absY <= absZ) candidate = [0, 1, 0];
    else candidate = [0, 0, 1];
    // xDir = normalize(candidate × zDir)
    const cx = candidate[1] * nz - candidate[2] * ny;
    const cy = candidate[2] * nx - candidate[0] * nz;
    const cz = candidate[0] * ny - candidate[1] * nx;
    const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
    xDir = len > 1e-12 ? vecNormalize([cx, cy, cz]) : [1, 0, 0];
  } else {
    xDir = vecNormalize(xDirection);
  }

  if (vecIsZero(xDir)) throw new Error('Plane xDir must be non-zero');

  const yDir = vecNormalize(vecCross(zDir, xDir));

  return { origin, xDir, yDir, zDir };
}

// ---------------------------------------------------------------------------
// Named plane configs
// ---------------------------------------------------------------------------

const PLANES_CONFIG: Record<PlaneName, { xDir: Vec3; normal: Vec3 }> = {
  XY: { xDir: [1, 0, 0], normal: [0, 0, 1] },
  YZ: { xDir: [0, 1, 0], normal: [1, 0, 0] },
  ZX: { xDir: [0, 0, 1], normal: [0, 1, 0] },
  XZ: { xDir: [1, 0, 0], normal: [0, -1, 0] },
  YX: { xDir: [0, 1, 0], normal: [0, 0, -1] },
  ZY: { xDir: [0, 0, 1], normal: [-1, 0, 0] },
  front: { xDir: [1, 0, 0], normal: [0, 0, 1] },
  back: { xDir: [-1, 0, 0], normal: [0, 0, -1] },
  left: { xDir: [0, 0, 1], normal: [-1, 0, 0] },
  right: { xDir: [0, 0, -1], normal: [1, 0, 0] },
  top: { xDir: [1, 0, 0], normal: [0, 1, 0] },
  bottom: { xDir: [1, 0, 0], normal: [0, -1, 0] },
};

/**
 * Create a standard named plane with an optional origin offset.
 *
 * @param name - One of the predefined {@link PlaneName} values.
 * @param sourceOrigin - Origin point, or a scalar offset along the plane normal.
 * @returns `Ok<Plane>` on success, or `Err` if the name is unknown.
 */
export function createNamedPlane(
  name: PlaneName,
  sourceOrigin: PointInput | number = [0, 0, 0]
): Result<Plane> {
  const config = PLANES_CONFIG[name] as { xDir: Vec3; normal: Vec3 } | undefined;
  if (!config) return err(validationError('UNKNOWN_PLANE', `Could not find plane ${name}`));

  let origin: Vec3;
  if (typeof sourceOrigin === 'number') {
    origin = vecScale(config.normal, sourceOrigin);
  } else {
    origin = toVec3(sourceOrigin);
  }
  return ok(createPlane(origin, config.xDir, config.normal));
}

/**
 * Resolve a {@link PlaneInput} to a concrete {@link Plane}.
 *
 * @returns `Ok<Plane>` on success, or `Err` if the named plane cannot be resolved.
 */
export function resolvePlane(input: PlaneInput, origin?: PointInput | number): Result<Plane> {
  if (typeof input === 'string') {
    return createNamedPlane(input, origin);
  }
  return ok(input);
}

// ---------------------------------------------------------------------------
// makePlane — convenience constructor (migrated from geometryHelpers.ts)
// ---------------------------------------------------------------------------

/**
 * Create or copy a {@link Plane}.
 *
 * When called with a `Plane` object, returns a shallow copy.
 * When called with a `PlaneName` string (or no arguments), resolves the named
 * plane with an optional origin offset.
 *
 * @param plane - A `Plane` object to copy, or a `PlaneName` string to resolve.
 * @param origin - Origin point or scalar offset along the plane normal.
 * @default plane `'XY'`
 */
function makePlane(plane: Plane): Plane;
function makePlane(plane?: PlaneName, origin?: PointInput | number): Plane;
function makePlane(plane?: PlaneInput, origin?: PointInput | number): Plane {
  if (plane && typeof plane !== 'string') {
    // Already a Plane object - return a copy
    return { ...plane };
  } else {
    return unwrap(resolvePlane(plane ?? 'XY', origin));
  }
}

export { makePlane };

// ---------------------------------------------------------------------------
// Coordinate transforms
// ---------------------------------------------------------------------------

/** Convert 2D local coordinates to 3D world coordinates on the plane. */
export function planeToWorld(plane: Plane, local: Vec2): Vec3 {
  const [u, v] = local;
  return vecAdd(vecAdd(plane.origin, vecScale(plane.xDir, u)), vecScale(plane.yDir, v));
}

/**
 * Convert 3D world coordinates to 2D local coordinates on the plane.
 * @testOnly Exercised by tests/planeOps.test.ts.
 */
export function planeToLocal(plane: Plane, world: Vec3): Vec2 {
  const relative = vecSub(world, plane.origin);
  return [vecDot(relative, plane.xDir), vecDot(relative, plane.yDir)];
}

// ---------------------------------------------------------------------------
// Plane transformations (all return new Plane)
// ---------------------------------------------------------------------------

/** Translate a plane by a vector. */
export function translatePlane(plane: Plane, offset: Vec3): Plane {
  return { ...plane, origin: vecAdd(plane.origin, offset) };
}

/**
 * Pivot a plane by rotating its axes around a world-space axis.
 *
 * @param angleDeg - Rotation angle in **degrees**.
 * @param axis - World-space axis to rotate around.
 */
export function pivotPlane(plane: Plane, angleDeg: number, axis: Vec3 = [1, 0, 0]): Plane {
  const angleRad = angleDeg * DEG2RAD;
  const newZDir = vecRotate(plane.zDir, axis, angleRad);
  const newXDir = vecRotate(plane.xDir, axis, angleRad);
  const newYDir = vecNormalize(vecCross(newZDir, newXDir));
  return { origin: plane.origin, xDir: newXDir, yDir: newYDir, zDir: newZDir };
}
