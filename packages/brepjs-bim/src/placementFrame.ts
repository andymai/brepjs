/** Numeric, column-major rigid frames. Translation is in millimetres. */
import { err, ok, type Result, type MatrixTransform } from 'brepjs';
import { specError, type BimError } from './errors/bimError.js';

export type Vec3 = readonly [number, number, number];
export type Mat4x4 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export interface FrameInput {
  readonly origin: Vec3;
  readonly axisX: Vec3;
  readonly axisZ: Vec3;
}

/** Construction is private; every exposed matrix is an immutable snapshot. */
class RigidFrame {
  readonly #matrix: Mat4x4;
  private constructor(matrix: Mat4x4) {
    this.#matrix = matrix;
    Object.freeze(this);
  }
  get matrix(): Mat4x4 {
    return this.#matrix;
  }

  static fromMatrix(input: unknown): Result<RigidFrame, BimError> {
    if (!isFiniteNumbers(input) || input.length !== 16) {
      return err(specError('INVALID_RIGID_FRAME', 'Expected sixteen finite matrix components'));
    }
    const values: number[] = input;
    const [
      a = 0,
      b = 0,
      c = 0,
      d = 0,
      e = 0,
      f = 0,
      g = 0,
      h = 0,
      i = 0,
      j = 0,
      k = 0,
      l = 0,
      m = 0,
      n = 0,
      o = 0,
      p = 0,
    ] = values;
    const x: Vec3 = [a, b, c],
      y: Vec3 = [e, f, g],
      z: Vec3 = [i, j, k];
    // Inclusive intervals on computed values: [target - tolerance, target + tolerance].
    // No extra epsilon. Validate supplied values BEFORE canonicalization.
    if (
      [x, y, z].some((v) => !within(dot(v, v), 1, 1e-6)) ||
      [dot(x, y), dot(x, z), dot(y, z)].some((v) => !within(v, 0, 1e-6)) ||
      !within(dot(x, cross(y, z)), 1, 1e-6) ||
      [d, h, l].some((v) => !within(v, 0, 1e-9)) ||
      !within(p, 1, 1e-9)
    ) {
      return err(
        specError(
          'INVALID_RIGID_FRAME',
          'Expected a right-handed orthonormal basis and homogeneous row'
        )
      );
    }
    // Z first, then project X; derive Y to make all consumers use one rigid basis.
    const cz = normalize(z);
    const projection = dot(x, cz);
    const cx = normalize([
      x[0] - projection * cz[0],
      x[1] - projection * cz[1],
      x[2] - projection * cz[2],
    ]);
    const cy = cross(cz, cx);
    return ok(
      new RigidFrame(
        Object.freeze([
          cx[0],
          cx[1],
          cx[2],
          0,
          cy[0],
          cy[1],
          cy[2],
          0,
          cz[0],
          cz[1],
          cz[2],
          0,
          m,
          n,
          o,
          1,
        ])
      )
    );
  }
}

export type { RigidFrame };

export function frameFromMatrix(input: unknown): Result<RigidFrame, BimError> {
  return RigidFrame.fromMatrix(input);
}

export function frameFromPlacement(input: unknown): Result<RigidFrame, BimError> {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('origin' in input) ||
    !isVec3(input.origin) ||
    !('axisX' in input) ||
    !isVec3(input.axisX) ||
    !('axisZ' in input) ||
    !isVec3(input.axisZ)
  ) {
    return err(specError('INVALID_RIGID_FRAME', 'Expected finite origin, axisX and axisZ triples'));
  }
  const { origin: o, axisX: x, axisZ: z } = input;
  const y = cross(z, x);
  return frameFromMatrix([
    x[0],
    x[1],
    x[2],
    0,
    y[0],
    y[1],
    y[2],
    0,
    z[0],
    z[1],
    z[2],
    0,
    o[0],
    o[1],
    o[2],
    1,
  ]);
}

export function decomposeFrame(frame: RigidFrame): FrameInput {
  const m = frame.matrix;
  return Object.freeze({
    origin: Object.freeze<Vec3>([m[12], m[13], m[14]]),
    axisX: Object.freeze<Vec3>([m[0], m[1], m[2]]),
    axisZ: Object.freeze<Vec3>([m[8], m[9], m[10]]),
  });
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function isVec3(value: unknown): value is Vec3 {
  return isFiniteNumbers(value) && value.length === 3;
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
}
export function rotationFrame(
  angleDeg: number,
  axis: unknown = [0, 0, 1],
  at: unknown = [0, 0, 0]
): Result<RigidFrame, BimError> {
  if (!Number.isFinite(angleDeg) || !isVec3(axis) || !isVec3(at) || axis.every((v) => v === 0)) {
    return err(
      specError(
        'INVALID_RIGID_FRAME',
        'Rotation requires a finite angle, pivot and nonzero direction'
      )
    );
  }
  // Scale before normalization to avoid overflow and underflow in direction length.
  const scale = Math.max(...axis.map(Math.abs));
  const [x, y, z] = normalize([axis[0] / scale, axis[1] / scale, axis[2] / scale]);
  const t = (angleDeg % 360) * (Math.PI / 180);
  const c = Math.cos(t);
  const s = Math.sin(t);
  const C = 1 - c;
  // Row-major rotation matrix entries (standard Rodrigues form).
  const r00 = c + x * x * C;
  const r01 = x * y * C - z * s;
  const r02 = x * z * C + y * s;
  const r10 = y * x * C + z * s;
  const r11 = c + y * y * C;
  const r12 = y * z * C - x * s;
  const r20 = z * x * C - y * s;
  const r21 = z * y * C + x * s;
  const r22 = c + z * z * C;
  // Pivot: translation = at - R.at.
  const rat0 = r00 * at[0] + r01 * at[1] + r02 * at[2];
  const rat1 = r10 * at[0] + r11 * at[1] + r12 * at[2];
  const rat2 = r20 * at[0] + r21 * at[1] + r22 * at[2];
  // Column-major: columns are R.e0, R.e1, R.e2; translation in column 3.
  return frameFromMatrix([
    r00,
    r10,
    r20,
    0,
    r01,
    r11,
    r21,
    0,
    r02,
    r12,
    r22,
    0,
    at[0] - rat0,
    at[1] - rat1,
    at[2] - rat2,
    1,
  ]);
}

export const IDENTITY_FRAME = (() => {
  const identity = frameFromMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  if (!identity.ok) throw new Error('Invalid identity constant');
  return identity.value;
})();

export function translationFrame(v: unknown): Result<RigidFrame, BimError> {
  if (!isVec3(v))
    return err(specError('INVALID_RIGID_FRAME', 'Translation requires three finite coordinates'));
  return frameFromPlacement({ origin: v, axisX: [1, 0, 0], axisZ: [0, 0, 1] });
}

/** Right operand acts first. Revalidate the result, including translation overflow. */
export function frameMul(a: RigidFrame, b: RigidFrame): Result<RigidFrame, BimError> {
  if (!(a instanceof RigidFrame) || !(b instanceof RigidFrame))
    return err(specError('INVALID_RIGID_FRAME', 'Composition requires validated frames'));
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++)
        sum += (a.matrix[k * 4 + row] ?? 0) * (b.matrix[col * 4 + k] ?? 0);
      out[col * 4 + row] = sum;
    }
  return frameFromMatrix(out);
}

export function frameInverse(frame: RigidFrame): Result<RigidFrame, BimError> {
  if (!(frame instanceof RigidFrame))
    return err(specError('INVALID_RIGID_FRAME', 'Inversion requires a validated frame'));
  const f = frame.matrix;
  const t: Vec3 = [f[12], f[13], f[14]];
  return frameFromMatrix([
    f[0],
    f[4],
    f[8],
    0,
    f[1],
    f[5],
    f[9],
    0,
    f[2],
    f[6],
    f[10],
    0,
    -dot([f[0], f[1], f[2]], t),
    -dot([f[4], f[5], f[6]], t),
    -dot([f[8], f[9], f[10]], t),
    1,
  ]);
}
export function frameOrigin(frame: RigidFrame): Vec3 {
  return decomposeFrame(frame).origin;
}
export function isPureTranslation(frame: RigidFrame): boolean {
  return frame.matrix
    .slice(0, 12)
    .every((v, i) => Math.abs(v - (IDENTITY_FRAME.matrix[i] ?? 0)) <= 1e-12);
}

/** Row-major linear transform for native geometry consumers of a validated frame. */
export function frameToMatrix(frame: RigidFrame): MatrixTransform {
  const m = frame.matrix;
  return {
    linear: [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]],
    translation: [m[12], m[13], m[14]],
  };
}

function isFiniteNumbers(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    Array.from(value).every((v: unknown) => typeof v === 'number' && Number.isFinite(v))
  );
}
function within(value: number, target: number, tolerance: number): boolean {
  return value >= target - tolerance && value <= target + tolerance;
}
