/**
 * Oriented bounding box — a box aligned to a shape's principal axes of inertia.
 *
 * Gives a shape its own frame: a board turned 30° reports its 600 × 400 × 18
 * size and the axes it lies along, which the world-axis `getBounds` cannot.
 */

import { getKernel } from '@/kernel/index.js';
import type { Vec3 } from '@/core/types.js';
import type { Shape3D } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { validationError, unsupportedError, BrepErrorCode } from '@/core/errors.js';
import { vecCross } from '@/core/vecOps.js';

/** A box in its own frame: centre, axes and edge lengths. */
export interface OrientedBoundingBox {
  /** Centre of the box, in world coordinates. */
  readonly center: Vec3;
  /**
   * The box's axes: orthonormal and right-handed (`axes[2] = axes[0] × axes[1]`),
   * ordered by decreasing `size`. Each of the first two points along the world
   * direction it is closest to, so a shape already on the world axes keeps them.
   */
  readonly axes: readonly [Vec3, Vec3, Vec3];
  /** Full edge length along each axis, largest first. */
  readonly size: Vec3;
}

type Mat3 = [number, number, number, number, number, number, number, number, number];

/**
 * Eigenvectors of a symmetric 3×3 matrix (row-major) by cyclic Jacobi rotations.
 * Returns the eigenvectors as the columns of a row-major matrix.
 */
function symmetricEigenvectors(m: readonly number[]): Mat3 {
  const a: Mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 9; i++) a[i] = m[i] ?? 0;
  const v: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const at = (r: number, c: number): number => a[r * 3 + c] ?? 0;
  const scale = Math.abs(at(0, 0)) + Math.abs(at(1, 1)) + Math.abs(at(2, 2));
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(at(0, 1)) + Math.abs(at(0, 2)) + Math.abs(at(1, 2));
    if (off <= 1e-15 * scale) break;
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      const apq = at(p, q);
      if (apq === 0) continue;
      const theta = (at(q, q) - at(p, p)) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      // A ← Jᵀ A J and V ← V J, with J the rotation in the (p, q) plane.
      for (let k = 0; k < 3; k++) {
        const akp = at(k, p);
        const akq = at(k, q);
        a[k * 3 + p] = c * akp - s * akq;
        a[k * 3 + q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = at(p, k);
        const aqk = at(q, k);
        a[p * 3 + k] = c * apk - s * aqk;
        a[q * 3 + k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k * 3 + p] ?? 0;
        const vkq = v[k * 3 + q] ?? 0;
        v[k * 3 + p] = c * vkp - s * vkq;
        v[k * 3 + q] = s * vkp + c * vkq;
      }
    }
  }
  return v;
}

/** Flip `v` so its largest-magnitude component is positive. */
function canonicalSign(v: Vec3): Vec3 {
  let big = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(v[i] ?? 0) > Math.abs(v[big] ?? 0)) big = i;
  return (v[big] ?? 0) < 0 ? [-v[0], -v[1], -v[2]] : v;
}

/**
 * Measure a solid's oriented bounding box: the box aligned to its principal
 * axes of inertia, measured with the kernel's exact bounds in that frame.
 *
 * The axes are exact when the principal moments are distinct (a board, a
 * rectangular part, any shape without rotational symmetry). When two or three
 * moments coincide — a cube, a cylinder, a square plate — the axes within that
 * plane are not unique; the result is still a bounding box of the shape, but
 * not necessarily the tightest one. It is not the minimum-volume box.
 *
 * Needs a kernel with mass properties (`KernelMeasureOps.inertia`); on others it
 * returns an `UNSUPPORTED` error.
 *
 * @param shape - A solid, or a compound of solids.
 * @returns `Result` containing the box's centre, axes and size.
 */
export function orientedBoundingBox(shape: Shape3D): Result<OrientedBoundingBox> {
  const kernel = getKernel();
  if (kernel.isNull(shape.wrapped)) {
    return err(
      validationError(BrepErrorCode.NULL_SHAPE_INPUT, 'orientedBoundingBox: shape is a null shape')
    );
  }
  if (!kernel.inertia) {
    return err(
      unsupportedError(
        BrepErrorCode.UNSUPPORTED_CAPABILITY,
        'orientedBoundingBox: the active kernel does not report a matrix of inertia'
      )
    );
  }
  const type = kernel.shapeType(shape.wrapped);
  if (type !== 'solid' && type !== 'compsolid' && type !== 'compound') {
    return err(
      validationError(
        BrepErrorCode.VALIDATION_FAILED,
        `orientedBoundingBox: needs a solid or a compound, got a ${type}`
      )
    );
  }

  const v = symmetricEigenvectors(kernel.inertia(shape.wrapped));
  const column = (j: number): Vec3 => [v[j] ?? 0, v[3 + j] ?? 0, v[6 + j] ?? 0];
  const e0 = column(0);
  const e1 = column(1);
  const e2 = vecCross(e0, e1);

  // Rotate the shape so the eigenvectors become the world axes (rows of the
  // rotation are the eigenvectors), and read its exact bounds there.
  const moved = kernel.generalTransform(shape.wrapped, [...e0, ...e1, ...e2], [0, 0, 0], true);
  let min: readonly [number, number, number];
  let max: readonly [number, number, number];
  try {
    ({ min, max } = kernel.boundingBox(moved));
  } finally {
    kernel.dispose(moved);
  }

  const eigen = [e0, e1, e2];
  const sizes = eigen.map((_, i) => (max[i] ?? 0) - (min[i] ?? 0));
  const mids = eigen.map((_, i) => ((max[i] ?? 0) + (min[i] ?? 0)) / 2);
  // The centre, back in world coordinates: Σ midᵢ · eᵢ.
  const centerAlong = (c: 0 | 1 | 2): number =>
    eigen.reduce((sum, axis, i) => sum + (mids[i] ?? 0) * axis[c], 0);
  const center: Vec3 = [centerAlong(0), centerAlong(1), centerAlong(2)];

  const order = [0, 1, 2].sort((p, q) => (sizes[q] ?? 0) - (sizes[p] ?? 0));
  const [i0 = 0, i1 = 1, i2 = 2] = order;
  const x = canonicalSign(eigen[i0] ?? e0);
  const y = canonicalSign(eigen[i1] ?? e1);
  return ok({
    center,
    axes: [x, y, vecCross(x, y)],
    size: [sizes[i0] ?? 0, sizes[i1] ?? 0, sizes[i2] ?? 0],
  });
}
