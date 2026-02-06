import type { Matrix2X2, Point2D } from './definitions.js';
import { PRECISION_POINT } from './precision.js';
import { bug } from '../../core/errors.js';

/** Test whether two 2D points are equal within a given precision. */
export const samePoint = (
  [x0, y0]: Point2D,
  [x1, y1]: Point2D,
  precision = PRECISION_POINT
): boolean => {
  return Math.abs(x0 - x1) <= precision && Math.abs(y0 - y1) <= precision;
};

/** Add two 2D vectors component-wise. */
export const add2d = ([x0, y0]: Point2D, [x1, y1]: Point2D): Point2D => {
  return [x0 + x1, y0 + y1];
};

/** Subtract the second 2D vector from the first. */
export const subtract2d = ([x0, y0]: Point2D, [x1, y1]: Point2D): Point2D => {
  return [x0 - x1, y0 - y1];
};

/** Multiply a 2D vector by a scalar. */
export const scalarMultiply2d = ([x0, y0]: Point2D, scalar: number): Point2D => {
  return [x0 * scalar, y0 * scalar];
};

/** Compute the Euclidean distance between two 2D points (defaults to distance from origin). */
export const distance2d = ([x0, y0]: Point2D, [x1, y1]: Point2D = [0, 0]): number => {
  return Math.sqrt((x0 - x1) ** 2 + (y0 - y1) ** 2);
};

/** Compute the squared Euclidean distance between two 2D points (avoids a sqrt). */
export const squareDistance2d = ([x0, y0]: Point2D, [x1, y1]: Point2D = [0, 0]): number => {
  return (x0 - x1) ** 2 + (y0 - y1) ** 2;
};

/** Compute the 2D cross product (z-component of the 3D cross product). */
export function crossProduct2d([x0, y0]: Point2D, [x1, y1]: Point2D): number {
  return x0 * y1 - y0 * x1;
}

/** Compute the dot product of two 2D vectors. */
export function dotProduct2d([x0, y0]: Point2D, [x1, y1]: Point2D): number {
  return x0 * x1 + y0 * y1;
}

/** Compute the signed angle (in radians) between two 2D vectors. */
export const angle2d = ([x0, y0]: Point2D, [x1, y1]: Point2D = [0, 0]): number => {
  return Math.atan2(y1 * x0 - y0 * x1, x0 * x1 + y0 * y1);
};

/** Compute the polar angle (in radians) from the first point to the second. */
export const polarAngle2d = ([x0, y0]: Point2D, [x1, y1]: Point2D = [0, 0]): number => {
  return Math.atan2(y1 - y0, x1 - x0);
};

/**
 * Normalize a 2D vector to unit length.
 *
 * @throws When the vector has near-zero length.
 */
export const normalize2d = ([x0, y0]: Point2D): Point2D => {
  const l = distance2d([x0, y0]);
  if (l < 1e-12) {
    bug('normalize2d', 'Cannot normalize zero-length vector');
  }
  return [x0 / l, y0 / l];
};

/**
 * Rotate a 2D point around a center by a given angle (in radians).
 *
 * @example
 * ```ts
 * rotate2d([1, 0], Math.PI / 2); // approximately [0, 1]
 * ```
 */
export const rotate2d = (point: Point2D, angle: number, center: Point2D = [0, 0]): Point2D => {
  const [px0, py0] = point;
  const [cx, cy] = center;

  const px = px0 - cx;
  const py = py0 - cy;

  const sinA = Math.sin(angle);
  const cosA = Math.cos(angle);

  const xnew = px * cosA - py * sinA;
  const ynew = px * sinA + py * cosA;

  return [xnew + cx, ynew + cy];
};

/** Convert polar coordinates (r, theta) to a Cartesian Point2D. */
export const polarToCartesian = (r: number, theta: number): Point2D => {
  const x = Math.cos(theta) * r;
  const y = Math.sin(theta) * r;
  return [x, y];
};

/**
 * Convert a Cartesian Point2D to polar coordinates.
 *
 * @returns A tuple of `[radius, theta]`.
 */
export const cartesianToPolar = ([x, y]: Point2D): [number, number] => {
  const r = distance2d([x, y]);
  const theta = Math.atan2(y, x);

  return [r, theta];
};

/** Compute the determinant of a 2x2 matrix. */
export const determinant2x2 = (matrix: Matrix2X2) => {
  return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
};
