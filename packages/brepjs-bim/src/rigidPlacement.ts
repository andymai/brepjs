import { locate, type AnyShape, type Dimension, type TransformOp } from 'brepjs';
import { placementToMatrix, type FrameInput, type Vec3 } from './import/placement.js';

const RAD_TO_DEG = 180 / Math.PI;
const ROTATION_EPSILON = 1e-12;

/** Applies a rigid placement as a location so the source BRep is not rebuilt. */
export function locateShapeInFrame<T extends AnyShape<Dimension>>(shape: T, frame: FrameInput): T {
  return locate(shape, placementOps(frame));
}

function placementOps(frame: FrameInput): readonly TransformOp[] {
  const matrix = placementToMatrix(frame);
  const rotation = rotationOp(matrix.linear);
  const translation: TransformOp = { type: 'translate', v: matrix.translation };
  return rotation === null ? [translation] : [rotation, translation];
}

function rotationOp(
  matrix: readonly [number, number, number, number, number, number, number, number, number]
): TransformOp | null {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = matrix;
  const trace = m00 + m11 + m22;
  let w: number;
  let x: number;
  let y: number;
  let z: number;

  if (trace > 0) {
    const scale = 2 * Math.sqrt(trace + 1);
    w = scale / 4;
    x = (m21 - m12) / scale;
    y = (m02 - m20) / scale;
    z = (m10 - m01) / scale;
  } else if (m00 > m11 && m00 > m22) {
    const scale = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / scale;
    x = scale / 4;
    y = (m01 + m10) / scale;
    z = (m02 + m20) / scale;
  } else if (m11 > m22) {
    const scale = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / scale;
    x = (m01 + m10) / scale;
    y = scale / 4;
    z = (m12 + m21) / scale;
  } else {
    const scale = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / scale;
    x = (m02 + m20) / scale;
    y = (m12 + m21) / scale;
    z = scale / 4;
  }

  const length = Math.hypot(w, x, y, z);
  const sign = w < 0 ? -1 : 1;
  const normalizedW = (sign * w) / length;
  const normalizedX = (sign * x) / length;
  const normalizedY = (sign * y) / length;
  const normalizedZ = (sign * z) / length;
  const sinHalfAngle = Math.hypot(normalizedX, normalizedY, normalizedZ);
  if (sinHalfAngle < ROTATION_EPSILON) return null;

  const axis: Vec3 = [
    normalizedX / sinHalfAngle,
    normalizedY / sinHalfAngle,
    normalizedZ / sinHalfAngle,
  ];
  return {
    type: 'rotate',
    angle: 2 * Math.atan2(sinHalfAngle, normalizedW) * RAD_TO_DEG,
    axis,
  };
}
