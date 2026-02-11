import { DEG2RAD } from '../core/constants.js';
import {
  normalize2d,
  distance2d,
  polarToCartesian,
  cartesianToPolar,
  rotate2d,
  make2dEllipseArc,
  type Point2D,
} from '../2d/lib/index.js';
import type { Curve2D } from '../2d/lib/index.js';
import { convertSvgEllipseParams } from './sketcherlib.js';

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
