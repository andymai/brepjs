import { DEG2RAD } from '@/core/constants.js';
import {
  normalize2d,
  distance2d,
  polarToCartesian,
  cartesianToPolar,
  rotate2d,
  make2dEllipseArc,
  type Point2D,
} from '@/2d/lib/index.js';
import type { Curve2D } from '@/2d/lib/index.js';
import { bug } from '@/core/errors.js';

/**
 * Normalized ellipse parameters after swapping axes when horizontalRadius < verticalRadius.
 */
export interface NormalizedEllipseParams {
  readonly majorRadius: number;
  readonly minorRadius: number;
  readonly rotationAngle: number;
}

/**
 * Normalize ellipse radii so that major >= minor, adjusting the rotation
 * angle by 90 degrees when the radii need to be swapped.
 */
export function normalizeEllipseRadii(
  horizontalRadius: number,
  verticalRadius: number,
  rotation: number
): NormalizedEllipseParams {
  if (horizontalRadius < verticalRadius) {
    return {
      majorRadius: verticalRadius,
      minorRadius: horizontalRadius,
      rotationAngle: rotation + 90,
    };
  }
  return {
    majorRadius: horizontalRadius,
    minorRadius: verticalRadius,
    rotationAngle: rotation,
  };
}

/**
 * Build a 2D elliptical arc curve from SVG-style endpoint parameters,
 * applying the UV coordinate conversions used by {@link BaseSketcher2d}.
 *
 * @param startUV - Start point in UV space.
 * @param endUV - End point in UV space.
 * @param majorRadius - Major radius (already normalized so major >= minor).
 * @param minorRadius - Minor radius.
 * @param rotationAngleDeg - Rotation of the ellipse in degrees.
 * @param longAxis - SVG large-arc flag.
 * @param sweep - SVG sweep flag.
 * @param convertToUV - Coordinate conversion function from user space to UV space.
 */
export function makeEllipseArcFromSvgParams(
  startUV: Point2D,
  endUV: Point2D,
  majorRadius: number,
  minorRadius: number,
  rotationAngleDeg: number,
  longAxis: boolean,
  sweep: boolean,
  convertToUV: (p: Point2D) => Point2D
): Curve2D {
  const radRotationAngle = rotationAngleDeg * DEG2RAD;

  const convertAxis = (ax: Point2D): number => distance2d(convertToUV(ax));
  const r1 = convertAxis(polarToCartesian(majorRadius, radRotationAngle));
  const r2 = convertAxis(polarToCartesian(minorRadius, radRotationAngle + Math.PI / 2));

  const xDir = normalize2d(convertToUV(rotate2d([1, 0], radRotationAngle)));
  const [, newRotationAngle] = cartesianToPolar(xDir);

  const { cx, cy, startAngle, endAngle, clockwise, rx, ry } = convertSvgEllipseParams(
    startUV,
    endUV,
    r1,
    r2,
    newRotationAngle,
    longAxis,
    sweep
  );

  const arc = make2dEllipseArc(
    rx,
    ry,
    clockwise ? startAngle : endAngle,
    clockwise ? endAngle : startAngle,
    [cx, cy],
    xDir
  );

  if (!clockwise) {
    arc.reverse();
  }

  return arc;
}

/**
 * Compute start/delta/end angles from the unit-circle parameterization
 * of an SVG elliptical arc (F6.5.5–F6.5.6).
 */
function computeArcAngles(
  xcr1: number,
  ycr1: number,
  xcr2: number,
  ycr2: number,
  fS: boolean
): { startAngle: number; deltaAngle: number; endAngle: number } {
  const PIx2 = Math.PI * 2.0;

  const startAngle = radianAngle(1.0, 0.0, xcr1, ycr1);

  let deltaAngle = radianAngle(xcr1, ycr1, -xcr2, -ycr2);
  while (deltaAngle > PIx2) {
    deltaAngle -= PIx2;
  }
  while (deltaAngle < 0.0) {
    deltaAngle += PIx2;
  }
  if (!fS) {
    deltaAngle -= PIx2;
  }
  let endAngle = startAngle + deltaAngle;
  while (endAngle > PIx2) {
    endAngle -= PIx2;
  }
  while (endAngle < 0.0) {
    endAngle += PIx2;
  }

  return { startAngle, deltaAngle, endAngle };
}

// adapted from https://stackoverflow.com/a/12329083
function radianAngle(ux: number, uy: number, vx: number, vy: number): number {
  const dot = ux * vx + uy * vy;
  const mod = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
  if (mod < 1e-12) {
    bug('radianAngle', 'Cannot compute angle between zero-length vectors');
  }
  let rad = Math.acos(Math.max(-1, Math.min(1, dot / mod)));
  if (ux * vy - uy * vx < 0.0) {
    rad = -rad;
  }
  return rad;
}

/**
 * Convert SVG-style elliptical arc endpoint parameters to center-parametrization.
 *
 * Implements the SVG spec F.6.5 / F.6.6 algorithm for converting (x1,y1)-(x2,y2)
 * arc notation into center, radii, and angle ranges.
 *
 * @returns Center coordinates, corrected radii, start/end/delta angles, and winding direction.
 */
export function convertSvgEllipseParams(
  [x1, y1]: [number, number],
  [x2, y2]: [number, number],
  rx: number,
  ry: number,
  phi: number,
  fA: boolean,
  fS: boolean
): {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  startAngle: number;
  deltaAngle: number;
  endAngle: number;
  clockwise: boolean;
} {
  if (rx < 0) {
    rx = -rx;
  }
  if (ry < 0) {
    ry = -ry;
  }
  if (rx < 1e-10 || ry < 1e-10) {
    bug('convertSvgEllipseParams', 'rx and ry cannot be 0');
  }

  const s_phi = Math.sin(phi);
  const c_phi = Math.cos(phi);
  const hd_x = (x1 - x2) / 2.0;
  const hd_y = (y1 - y2) / 2.0;
  const hs_x = (x1 + x2) / 2.0;
  const hs_y = (y1 + y2) / 2.0;

  // F6.5.1
  const x1_ = c_phi * hd_x + s_phi * hd_y;
  const y1_ = c_phi * hd_y - s_phi * hd_x;

  // F.6.6 Correction of out-of-range radii
  const lambda = (x1_ * x1_) / (rx * rx) + (y1_ * y1_) / (ry * ry);
  if (lambda > 1) {
    rx = rx * Math.sqrt(lambda);
    ry = ry * Math.sqrt(lambda);
  }

  const rxry = rx * ry;
  const rxy1_ = rx * y1_;
  const ryx1_ = ry * x1_;
  const sum_of_sq = rxy1_ * rxy1_ + ryx1_ * ryx1_;
  if (!sum_of_sq) {
    bug('convertSvgEllipseParams', 'Start point cannot be same as end point');
  }
  let coe = Math.sqrt(Math.abs((rxry * rxry - sum_of_sq) / sum_of_sq));
  if (fA === fS) {
    coe = -coe;
  }

  // F6.5.2
  const cx_ = (coe * rxy1_) / ry;
  const cy_ = (-coe * ryx1_) / rx;

  // F6.5.3
  const cx = c_phi * cx_ - s_phi * cy_ + hs_x;
  const cy = s_phi * cx_ + c_phi * cy_ + hs_y;

  const xcr1 = (x1_ - cx_) / rx;
  const xcr2 = (x1_ + cx_) / rx;
  const ycr1 = (y1_ - cy_) / ry;
  const ycr2 = (y1_ + cy_) / ry;

  const { startAngle, deltaAngle, endAngle } = computeArcAngles(xcr1, ycr1, xcr2, ycr2, fS);

  return {
    cx,
    cy,
    startAngle,
    deltaAngle,
    endAngle,
    clockwise: fS,
    rx,
    ry,
  };
}
