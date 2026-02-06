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
import { makeOcAx3 } from './occtBoundary.js';
import { type Result, ok, err } from './result.js';
import { validationError } from './errors.js';

// ---------------------------------------------------------------------------
// Plane construction
// ---------------------------------------------------------------------------

/**
 * Create a {@link Plane} from an origin, optional X direction, and a normal.
 *
 * If `xDirection` is omitted, the X axis is derived automatically via OCCT `gp_Ax3`.
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
    // Derive xDir from OCCT Ax3
    const ax3 = makeOcAx3(origin, zDir);
    const ocXDir = ax3.XDirection();
    xDir = vecNormalize([ocXDir.X(), ocXDir.Y(), ocXDir.Z()]);
    ocXDir.delete();
    ax3.delete();
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
 * @throws If a named plane cannot be resolved.
 */
export function resolvePlane(input: PlaneInput, origin?: PointInput | number): Plane {
  if (typeof input === 'string') {
    const result = createNamedPlane(input, origin);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  }
  return input;
}

// ---------------------------------------------------------------------------
// Coordinate transforms
// ---------------------------------------------------------------------------

/** Convert 2D local coordinates to 3D world coordinates on the plane. */
export function planeToWorld(plane: Plane, local: Vec2): Vec3 {
  const [u, v] = local;
  return vecAdd(vecAdd(plane.origin, vecScale(plane.xDir, u)), vecScale(plane.yDir, v));
}

/** Convert 3D world coordinates to 2D local coordinates on the plane. */
export function planeToLocal(plane: Plane, world: Vec3): Vec2 {
  const relative = vecSub(world, plane.origin);
  return [vecDot(relative, plane.xDir), vecDot(relative, plane.yDir)];
}

/** Convert 3D local coordinates to 3D world coordinates on the plane. */
export function planeToWorldVec3(plane: Plane, local: Vec3): Vec3 {
  const [u, v, w] = local;
  return vecAdd(
    vecAdd(vecAdd(plane.origin, vecScale(plane.xDir, u)), vecScale(plane.yDir, v)),
    vecScale(plane.zDir, w)
  );
}

/** Convert 3D world coordinates to 3D local coordinates on the plane. */
export function planeToLocalVec3(plane: Plane, world: Vec3): Vec3 {
  const relative = vecSub(world, plane.origin);
  return [vecDot(relative, plane.xDir), vecDot(relative, plane.yDir), vecDot(relative, plane.zDir)];
}

// ---------------------------------------------------------------------------
// Plane transformations (all return new Plane)
// ---------------------------------------------------------------------------

/** Translate a plane by a vector. */
export function translatePlane(plane: Plane, offset: Vec3): Plane {
  return { ...plane, origin: vecAdd(plane.origin, offset) };
}

/** Translate a plane to a new origin. */
export function translatePlaneTo(plane: Plane, newOrigin: Vec3): Plane {
  return { ...plane, origin: newOrigin };
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

/**
 * Rotate the X/Y axes of a plane around its normal (Z direction).
 *
 * @param angleDeg - Rotation angle in **degrees**.
 */
export function rotatePlane2DAxes(plane: Plane, angleDeg: number): Plane {
  const angleRad = angleDeg * DEG2RAD;
  const newXDir = vecRotate(plane.xDir, plane.zDir, angleRad);
  const newYDir = vecNormalize(vecCross(plane.zDir, newXDir));
  return { ...plane, xDir: newXDir, yDir: newYDir };
}
