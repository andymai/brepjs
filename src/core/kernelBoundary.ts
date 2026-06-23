/**
 * Geometry boundary helpers — convert between Vec3 tuples and kernel geometry types.
 *
 * These functions create kernel-internal geometry objects (points, vectors,
 * directions, axes) from Vec3 tuples. They delegate to KernelAdapter methods
 * and are kernel-agnostic.
 */

import type { Vec3 } from './types.js';
import type { KernelType } from '@/kernel/types.js';
import { getKernel } from '@/kernel/index.js';

// ---------------------------------------------------------------------------
// Direct conversions (caller must delete)
// ---------------------------------------------------------------------------

/** Convert Vec3 to a kernel 3D vector. Caller must call .delete() when done. */
export function toKernelVec(v: Vec3): KernelType {
  return getKernel().createVector3d(v[0], v[1], v[2]);
}

/** Convert Vec3 to a kernel 3D point. Caller must call .delete() when done. */
export function toKernelPnt(v: Vec3): KernelType {
  return getKernel().createPoint3d(v[0], v[1], v[2]);
}

/** Convert Vec3 to a kernel 3D direction. Caller must call .delete() when done. */
export function toKernelDir(v: Vec3): KernelType {
  return getKernel().createDirection3d(v[0], v[1], v[2]);
}

// ---------------------------------------------------------------------------
// Extraction from kernel objects
// ---------------------------------------------------------------------------

/** Extract Vec3 from a kernel 3D vector */
export function fromKernelVec(ocVec: KernelType): Vec3 {
  return [ocVec.X(), ocVec.Y(), ocVec.Z()];
}

/** Extract Vec3 from a kernel 3D point */
export function fromKernelPnt(ocPnt: KernelType): Vec3 {
  return [ocPnt.X(), ocPnt.Y(), ocPnt.Z()];
}

/** Extract Vec3 from a kernel 3D direction */
export function fromKernelDir(ocDir: KernelType): Vec3 {
  return [ocDir.X(), ocDir.Y(), ocDir.Z()];
}

// ---------------------------------------------------------------------------
// Scoped conversions (auto-cleanup)
// ---------------------------------------------------------------------------

/** Execute fn with a temporary kernel 3D vector, auto-deleted after. */
export function withKernelVec<T>(v: Vec3, fn: (ocVec: KernelType) => T): T {
  const ocVec = toKernelVec(v);
  try {
    return fn(ocVec);
  } finally {
    ocVec.delete();
  }
}

/** Execute fn with a temporary kernel 3D point, auto-deleted after. */
export function withKernelPnt<T>(v: Vec3, fn: (ocPnt: KernelType) => T): T {
  const ocPnt = toKernelPnt(v);
  try {
    return fn(ocPnt);
  } finally {
    ocPnt.delete();
  }
}

/** Execute fn with a temporary kernel 3D direction, auto-deleted after. */
export function withKernelDir<T>(v: Vec3, fn: (ocDir: KernelType) => T): T {
  const ocDir = toKernelDir(v);
  try {
    return fn(ocDir);
  } finally {
    ocDir.delete();
  }
}

// ---------------------------------------------------------------------------
// Axis construction helpers
// ---------------------------------------------------------------------------

/**
 * Create a kernel 3D axis-1 from point and direction. Caller must delete.
 * @testOnly Exercised by tests/occtBoundary.test.ts.
 */
export function makeKernelAx1(center: Vec3, dir: Vec3): KernelType {
  return getKernel().createAxis1(center[0], center[1], center[2], dir[0], dir[1], dir[2]);
}

/**
 * Create a kernel 3D axis-2 from origin and z direction (+optional x direction). Caller must delete.
 * @testOnly Exercised by tests/occtBoundary.test.ts.
 */
export function makeKernelAx2(origin: Vec3, zDir: Vec3, xDir?: Vec3): KernelType {
  if (xDir) {
    return getKernel().createAxis2(
      origin[0],
      origin[1],
      origin[2],
      zDir[0],
      zDir[1],
      zDir[2],
      xDir[0],
      xDir[1],
      xDir[2]
    );
  }
  return getKernel().createAxis2(origin[0], origin[1], origin[2], zDir[0], zDir[1], zDir[2]);
}

/**
 * Create a kernel 3D axis-3 from origin, z direction, and optional x direction. Caller must delete.
 * @testOnly Exercised by tests/occtBoundary.test.ts.
 */
export function makeKernelAx3(origin: Vec3, zDir: Vec3, xDir?: Vec3): KernelType {
  if (xDir) {
    return getKernel().createAxis3(
      origin[0],
      origin[1],
      origin[2],
      zDir[0],
      zDir[1],
      zDir[2],
      xDir[0],
      xDir[1],
      xDir[2]
    );
  }
  return getKernel().createAxis3(origin[0], origin[1], origin[2], zDir[0], zDir[1], zDir[2]);
}
