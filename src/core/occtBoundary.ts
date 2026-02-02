/**
 * OCCT boundary helpers — convert between Vec3 tuples and OCCT gp_* types.
 * All OCCT objects created here are temporary and must be cleaned up.
 * Use withOcVec/withOcPnt/withOcDir for scoped conversions.
 */

import type { Vec3, PointInput } from './types.js';
import { toVec3 } from './types.js';
import { getKernel } from '../kernel/index.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT types are dynamic
type OcType = any;

// ---------------------------------------------------------------------------
// Direct conversions (caller must delete)
// ---------------------------------------------------------------------------

/** Convert Vec3 to OCCT gp_Vec. Caller must call .delete() when done. */
export function toOcVec(v: Vec3): OcType {
  const oc = getKernel().oc;
  return new oc.gp_Vec_4(v[0], v[1], v[2]);
}

/** Convert Vec3 to OCCT gp_Pnt. Caller must call .delete() when done. */
export function toOcPnt(v: Vec3): OcType {
  const oc = getKernel().oc;
  return new oc.gp_Pnt_3(v[0], v[1], v[2]);
}

/** Convert Vec3 to OCCT gp_Dir. Caller must call .delete() when done. */
export function toOcDir(v: Vec3): OcType {
  const oc = getKernel().oc;
  return new oc.gp_Dir_4(v[0], v[1], v[2]);
}

/** Convert PointInput to OCCT gp_Pnt. Caller must call .delete() when done. */
export function pointToOcPnt(p: PointInput): OcType {
  return toOcPnt(toVec3(p));
}

/** Convert PointInput to OCCT gp_Dir. Caller must call .delete() when done. */
export function pointToOcDir(p: PointInput): OcType {
  return toOcDir(toVec3(p));
}

// ---------------------------------------------------------------------------
// Extraction from OCCT objects
// ---------------------------------------------------------------------------

/** Extract Vec3 from OCCT gp_Vec */
export function fromOcVec(ocVec: OcType): Vec3 {
  return [ocVec.X(), ocVec.Y(), ocVec.Z()];
}

/** Extract Vec3 from OCCT gp_Pnt */
export function fromOcPnt(ocPnt: OcType): Vec3 {
  return [ocPnt.X(), ocPnt.Y(), ocPnt.Z()];
}

/** Extract Vec3 from OCCT gp_Dir */
export function fromOcDir(ocDir: OcType): Vec3 {
  return [ocDir.X(), ocDir.Y(), ocDir.Z()];
}

// ---------------------------------------------------------------------------
// Scoped conversions (auto-cleanup)
// ---------------------------------------------------------------------------

/** Execute fn with a temporary OCCT gp_Vec, auto-deleted after. */
export function withOcVec<T>(v: Vec3, fn: (ocVec: OcType) => T): T {
  const ocVec = toOcVec(v);
  try {
    return fn(ocVec);
  } finally {
    ocVec.delete();
  }
}

/** Execute fn with a temporary OCCT gp_Pnt, auto-deleted after. */
export function withOcPnt<T>(v: Vec3, fn: (ocPnt: OcType) => T): T {
  const ocPnt = toOcPnt(v);
  try {
    return fn(ocPnt);
  } finally {
    ocPnt.delete();
  }
}

/** Execute fn with a temporary OCCT gp_Dir, auto-deleted after. */
export function withOcDir<T>(v: Vec3, fn: (ocDir: OcType) => T): T {
  const ocDir = toOcDir(v);
  try {
    return fn(ocDir);
  } finally {
    ocDir.delete();
  }
}

// ---------------------------------------------------------------------------
// Axis construction helpers
// ---------------------------------------------------------------------------

/** Create OCCT gp_Ax1 from point and direction. Caller must delete. */
export function makeOcAx1(center: Vec3, dir: Vec3): OcType {
  const oc = getKernel().oc;
  const pnt = toOcPnt(center);
  const d = toOcDir(dir);
  const ax = new oc.gp_Ax1_2(pnt, d);
  pnt.delete();
  d.delete();
  return ax;
}

/** Create OCCT gp_Ax2 from origin and z direction (+optional x direction). Caller must delete. */
export function makeOcAx2(origin: Vec3, zDir: Vec3, xDir?: Vec3): OcType {
  const oc = getKernel().oc;
  const pnt = toOcPnt(origin);
  const z = toOcDir(zDir);

  let ax: OcType;
  if (xDir) {
    const x = toOcDir(xDir);
    ax = new oc.gp_Ax2_2(pnt, z, x);
    x.delete();
  } else {
    ax = new oc.gp_Ax2_3(pnt, z);
  }

  pnt.delete();
  z.delete();
  return ax;
}

/** Create OCCT gp_Ax3 from origin, z direction, and optional x direction. Caller must delete. */
export function makeOcAx3(origin: Vec3, zDir: Vec3, xDir?: Vec3): OcType {
  const oc = getKernel().oc;
  const pnt = toOcPnt(origin);
  const z = toOcDir(zDir);

  let ax: OcType;
  if (xDir) {
    const x = toOcDir(xDir);
    ax = new oc.gp_Ax3_3(pnt, z, x);
    x.delete();
  } else {
    ax = new oc.gp_Ax3_4(pnt, z);
  }

  pnt.delete();
  z.delete();
  return ax;
}
