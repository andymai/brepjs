/**
 * Principal-axes bounding box: a solid's extent measured in the frame of its
 * principal axes of inertia instead of the world axes.
 */

import { getKernel } from '@/kernel/index.js';
import type { Matrix3 } from '@/kernel/interfaces/measureOps.js';
import type { Vec3 } from '@/core/types.js';
import { castResultShape, type AnyShape, type Dimension } from '@/core/shapeTypes.js';
import { type Result, type Err, ok, err } from '@/core/result.js';
import { kernelCallRaw } from '@/core/kernelCall.js';
import { type BrepError, BrepErrorCode, unsupportedError, validationError } from '@/core/errors.js';
import { vecCross } from '@/core/vecOps.js';
import { wasmIndex } from '@/utils/vec3.js';
import { subShapeCount } from '@/topology/topologyQueryFns.js';

/** A box aligned to a solid's principal axes of inertia. */
export interface PrincipalBoundingBox {
  /** Box center in world coordinates. */
  readonly center: Vec3;
  /** Box axes: orthonormal, right-handed, ordered by decreasing extent. */
  readonly axes: readonly [Vec3, Vec3, Vec3];
  /** Full edge lengths along `axes`, largest first. */
  readonly size: Vec3;
}

const ZERO_VOLUME_TOLERANCE = 1e-9;
// Off-diagonal inertia entries this small relative to the matrix norm are
// integration noise. Treating them as zero gives a solid already on the world
// axes exactly the world axes back.
const OFF_DIAGONAL_TOLERANCE = 1e-12;
const JACOBI_MAX_SWEEPS = 32;
const JACOBI_PLANES = [
  [0, 1],
  [0, 2],
  [1, 2],
] as const;
const ORIGIN: Vec3 = [0, 0, 0];

function validatePrincipalBoxInput(shape: AnyShape<Dimension>): Err<BrepError> | undefined {
  const kernel = getKernel();
  if (kernel.isNull(shape.wrapped)) {
    return err(
      validationError(BrepErrorCode.NULL_SHAPE_INPUT, 'principalBoundingBox: shape is a null shape')
    );
  }
  const type = kernel.shapeType(shape.wrapped);
  if (type !== 'solid' && type !== 'compsolid' && type !== 'compound') {
    return err(
      validationError(
        BrepErrorCode.NOT_A_SOLID,
        `principalBoundingBox: expected a solid, got a ${type}`,
        undefined,
        { shapeType: type },
        'Use getBounds() for faces, wires, and shells'
      )
    );
  }
  const volume = kernelCallRaw(
    () =>
      type === 'solid' || subShapeCount(shape, 'solid') > 0 ? kernel.volume(shape.wrapped) : 0,
    BrepErrorCode.PRINCIPAL_BOX_FAILED,
    'principalBoundingBox: failed to measure volume'
  );
  if (!volume.ok) return volume;
  if (volume.value <= ZERO_VOLUME_TOLERANCE) {
    return err(
      validationError(
        BrepErrorCode.ZERO_VOLUME,
        'principalBoundingBox: shape encloses no volume',
        undefined,
        { volume: volume.value },
        'Use getBounds() for shapes without volume, or build a solid first'
      )
    );
  }
  return undefined;
}

/** One cyclic-Jacobi rotation that zeroes `a[p][q]`, accumulated into the eigenvector matrix `v`. */
function jacobiRotate(a: number[], v: number[], p: number, q: number): void {
  const apq = wasmIndex(a, p * 3 + q);
  const theta = (wasmIndex(a, q * 3 + q) - wasmIndex(a, p * 3 + p)) / (2 * apq);
  const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
  const c = 1 / Math.sqrt(t * t + 1);
  const s = t * c;
  for (let k = 0; k < 3; k++) {
    const akp = wasmIndex(a, k * 3 + p);
    const akq = wasmIndex(a, k * 3 + q);
    a[k * 3 + p] = c * akp - s * akq;
    a[k * 3 + q] = s * akp + c * akq;
  }
  for (let k = 0; k < 3; k++) {
    const apk = wasmIndex(a, p * 3 + k);
    const aqk = wasmIndex(a, q * 3 + k);
    a[p * 3 + k] = c * apk - s * aqk;
    a[q * 3 + k] = s * apk + c * aqk;
    const vkp = wasmIndex(v, k * 3 + p);
    const vkq = wasmIndex(v, k * 3 + q);
    v[k * 3 + p] = c * vkp - s * vkq;
    v[k * 3 + q] = s * vkp + c * vkq;
  }
  a[p * 3 + q] = 0;
  a[q * 3 + p] = 0;
}

/**
 * Eigenvectors of a symmetric 3x3 matrix by cyclic Jacobi. Every rotation is
 * proper, so the returned axes form a right-handed orthonormal frame.
 */
function principalAxes(m: Matrix3): [Vec3, Vec3, Vec3] {
  const a = [...m];
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const threshold = OFF_DIAGONAL_TOLERANCE * Math.hypot(...m);
  for (let sweep = 0; sweep < JACOBI_MAX_SWEEPS; sweep++) {
    let rotated = false;
    for (const [p, q] of JACOBI_PLANES) {
      if (Math.abs(wasmIndex(a, p * 3 + q)) <= threshold) continue;
      jacobiRotate(a, v, p, q);
      rotated = true;
    }
    if (!rotated) break;
  }
  const column = (j: number): Vec3 => [wasmIndex(v, j), wasmIndex(v, 3 + j), wasmIndex(v, 6 + j)];
  return [column(0), column(1), column(2)];
}

/** Flip `v` so its largest-magnitude component is positive. */
function canonicalSign(v: Vec3): Vec3 {
  const x = Math.abs(v[0]);
  const y = Math.abs(v[1]);
  const z = Math.abs(v[2]);
  const dominant = x >= y && x >= z ? v[0] : y >= z ? v[1] : v[2];
  return dominant < 0 ? [-v[0], -v[1], -v[2]] : v;
}

// Negation and cross products leave -0 components; adding 0 turns them into +0
// so a world-aligned result compares equal to the plain world axes.
function withoutNegativeZero(v: Vec3): Vec3 {
  return [v[0] + 0, v[1] + 0, v[2] + 0];
}

function boundsInFrame(
  shape: AnyShape<Dimension>,
  axes: readonly [Vec3, Vec3, Vec3]
): { min: Vec3; max: Vec3 } {
  const kernel = getKernel();
  const [a0, a1, a2] = axes;
  using framed = castResultShape(
    kernel.generalTransform(shape.wrapped, [...a0, ...a1, ...a2], ORIGIN, true)
  );
  return kernel.boundingBox(framed.wrapped);
}

function assembleBox(
  axes: readonly [Vec3, Vec3, Vec3],
  bounds: { min: Vec3; max: Vec3 }
): PrincipalBoundingBox {
  const extents = axes.map((axis, i) => ({
    axis,
    size: wasmIndex(bounds.max, i) - wasmIndex(bounds.min, i),
    mid: (wasmIndex(bounds.min, i) + wasmIndex(bounds.max, i)) / 2,
  }));
  const centerAlong = (c: number): number =>
    extents.reduce((sum, e) => sum + e.mid * wasmIndex(e.axis, c), 0);
  const sorted = [...extents].sort((p, q) => q.size - p.size);
  const major = canonicalSign(wasmIndex(sorted, 0).axis);
  const middle = canonicalSign(wasmIndex(sorted, 1).axis);
  return {
    center: [centerAlong(0), centerAlong(1), centerAlong(2)],
    axes: [
      withoutNegativeZero(major),
      withoutNegativeZero(middle),
      withoutNegativeZero(vecCross(major, middle)),
    ],
    size: [wasmIndex(sorted, 0).size, wasmIndex(sorted, 1).size, wasmIndex(sorted, 2).size],
  };
}

/**
 * Measure a solid's bounding box on its principal axes of inertia.
 *
 * `getBounds` answers in world axes, so a board turned 30 degrees reports an
 * inflated box with no frame. This box follows the part's own frame instead:
 * it is the axis-aligned box in the frame of the principal axes of the volume
 * inertia tensor about the center of mass.
 *
 * This is NOT a minimum-volume oriented bounding box. When principal moments
 * coincide, the principal axes in that plane are not unique and the box can be
 * larger than the tightest one: a 100 x 100 x 2 plate rotated 30 degrees about
 * Z reports 136.6 x 136.6 x 2, because any in-plane pair of axes is principal
 * for a square plate.
 *
 * @param shape - A solid, compsolid, or compound containing solids.
 * @returns `Result` with the box center in world coordinates, orthonormal
 *   right-handed axes ordered by decreasing extent, and the full edge lengths
 *   along those axes. Fails with `NOT_A_SOLID` for any other shape type
 *   (face, wire, shell, ...), `ZERO_VOLUME` when the shape encloses no volume
 *   (e.g. a compound of faces), and an `UNSUPPORTED` error on kernels without
 *   an inertia query.
 *
 * @example
 * ```ts
 * const { size, axes, center } = unwrap(principalBoundingBox(board));
 * // size: [length, width, thickness]; axes[2] is the board's normal
 * ```
 */
export function principalBoundingBox(shape: AnyShape<Dimension>): Result<PrincipalBoundingBox> {
  const invalid = validatePrincipalBoxInput(shape);
  if (invalid) return invalid;

  const kernel = getKernel();
  const inertiaOf = kernel.inertia?.bind(kernel);
  if (!inertiaOf) {
    return err(
      unsupportedError(
        BrepErrorCode.UNSUPPORTED_CAPABILITY,
        `principalBoundingBox: the ${kernel.kernelId} kernel has no inertia query`,
        undefined,
        { kernel: kernel.kernelId },
        'Use the occt-wasm kernel, which provides the inertia query'
      )
    );
  }

  const inertia = kernelCallRaw(
    () => inertiaOf(shape.wrapped),
    BrepErrorCode.PRINCIPAL_BOX_FAILED,
    'principalBoundingBox: failed to compute the matrix of inertia'
  );
  if (!inertia.ok) return inertia;

  const axes = principalAxes(inertia.value);
  const bounds = kernelCallRaw(
    () => boundsInFrame(shape, axes),
    BrepErrorCode.PRINCIPAL_BOX_FAILED,
    'principalBoundingBox: failed to measure bounds in the principal frame'
  );
  if (!bounds.ok) return bounds;
  return ok(assembleBox(axes, bounds.value));
}
