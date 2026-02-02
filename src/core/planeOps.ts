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
  vecLength,
  vecRotate,
} from './vecOps.js';
import { DEG2RAD } from './constants.js';
import { makeOcAx3 } from './occtBoundary.js';
import { type Result, ok, err } from './result.js';
import { validationError } from './errors.js';

// ---------------------------------------------------------------------------
// Plane construction
// ---------------------------------------------------------------------------

/** Create a Plane from origin, optional xDir, and normal (zDir). */
export function createPlane(
  origin: Vec3,
  xDirection: Vec3 | null = null,
  normal: Vec3 = [0, 0, 1]
): Plane {
  const zDir = vecNormalize(normal);
  if (vecLength(zDir) === 0) throw new Error('Plane normal must be non-zero');

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

  if (vecLength(xDir) === 0) throw new Error('Plane xDir must be non-zero');

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

/** Create a named plane with optional origin offset. */
export function createNamedPlane(
  name: PlaneName,
  sourceOrigin: PointInput | number = [0, 0, 0]
): Result<Plane> {
  const config = PLANES_CONFIG[name];
  if (!config) return err(validationError('UNKNOWN_PLANE', `Could not find plane ${name}`));

  let origin: Vec3;
  if (typeof sourceOrigin === 'number') {
    origin = vecScale(config.normal, sourceOrigin);
  } else {
    origin = toVec3(sourceOrigin);
  }
  return ok(createPlane(origin, config.xDir, config.normal));
}

/** Resolve a PlaneInput to a Plane. */
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

/** Pivot plane by rotating around an axis. */
export function pivotPlane(plane: Plane, angleDeg: number, axis: Vec3 = [1, 0, 0]): Plane {
  const angleRad = angleDeg * DEG2RAD;
  const newZDir = vecRotate(plane.zDir, axis, angleRad);
  const newXDir = vecRotate(plane.xDir, axis, angleRad);
  const newYDir = vecNormalize(vecCross(newZDir, newXDir));
  return { origin: plane.origin, xDir: newXDir, yDir: newYDir, zDir: newZDir };
}

/** Rotate the 2D axes of the plane around its normal. */
export function rotatePlane2DAxes(plane: Plane, angleDeg: number): Plane {
  const angleRad = angleDeg * DEG2RAD;
  const newXDir = vecRotate(plane.xDir, plane.zDir, angleRad);
  const newYDir = vecNormalize(vecCross(plane.zDir, newXDir));
  return { ...plane, xDir: newXDir, yDir: newYDir };
}
