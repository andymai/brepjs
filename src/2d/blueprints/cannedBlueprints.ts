import type Blueprint from './Blueprint.js';
import { BlueprintSketcher } from '../../sketching/Sketcher2d.js';

/**
 * Create a regular polygon blueprint inscribed in a circle of the given radius.
 *
 * @param radius - Circumscribed circle radius.
 * @param sidesCount - Number of sides (3 = triangle, 6 = hexagon, etc.).
 * @param sagitta - When non-zero, sides are replaced by sagitta arcs (bulge height).
 * @returns A closed Blueprint representing the polygon.
 *
 * @example
 * ```ts
 * const hexagon = polysidesBlueprint(10, 6);
 * const roundedTriangle = polysidesBlueprint(10, 3, 2);
 * ```
 */
export const polysidesBlueprint = (radius: number, sidesCount: number, sagitta = 0): Blueprint => {
  const points: [number, number][] = [...Array(sidesCount).keys()].map((i) => {
    const theta = -((Math.PI * 2) / sidesCount) * i;
    return [radius * Math.sin(theta), radius * Math.cos(theta)] as [number, number];
  });

  // We start with the last point to make sure the shape is complete
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const lastPoint = points[points.length - 1]!;
  const blueprint = new BlueprintSketcher().movePointerTo([lastPoint[0], lastPoint[1]]);

  if (sagitta) {
    points.forEach(([x, y]) => blueprint.sagittaArcTo([x, y], sagitta));
  } else {
    points.forEach(([x, y]) => blueprint.lineTo([x, y]));
  }

  return blueprint.done();
};

/**
 * Create an axis-aligned rectangle blueprint with optional rounded corners.
 *
 * The rectangle is centered at the origin. When `r` is zero the corners
 * are sharp; otherwise they are filleted with circular or elliptical arcs.
 *
 * @param width - Total width of the rectangle.
 * @param height - Total height of the rectangle.
 * @param r - Corner radius. Pass a number for uniform rounding, or
 *   `{ rx, ry }` for elliptical corners. Clamped to half the respective
 *   dimension.
 * @returns A closed Blueprint representing the rectangle.
 *
 * @example
 * ```ts
 * const sharp = roundedRectangleBlueprint(20, 10);
 * const rounded = roundedRectangleBlueprint(20, 10, 3);
 * const elliptical = roundedRectangleBlueprint(20, 10, { rx: 4, ry: 2 });
 * ```
 */
export const roundedRectangleBlueprint = (
  width: number,
  height: number,
  r: number | { rx?: number; ry?: number } = 0
) => {
  const { rx: inputRx = 0, ry: inputRy = 0 } = typeof r === 'number' ? { ry: r, rx: r } : r;

  let rx = Math.min(inputRx, width / 2);
  let ry = Math.min(inputRy, height / 2);

  const withRadius = rx && ry;
  if (!withRadius) {
    rx = 0;
    ry = 0;
  }
  const symmetricRadius = rx === ry;

  const sk = new BlueprintSketcher([Math.min(0, -(width / 2 - rx)), -height / 2]);

  const addFillet = (xDist: number, yDist: number) => {
    if (withRadius) {
      if (symmetricRadius) sk.tangentArc(xDist, yDist);
      else sk.ellipse(xDist, yDist, rx, ry, 0, false, true);
    }
  };

  if (rx < width / 2) {
    sk.hLine(width - 2 * rx);
  }
  addFillet(rx, ry);
  if (ry < height / 2) {
    sk.vLine(height - 2 * ry);
  }
  addFillet(-rx, ry);
  if (rx < width / 2) {
    sk.hLine(-(width - 2 * rx));
  }
  addFillet(-rx, -ry);
  if (ry < height / 2) {
    sk.vLine(-(height - 2 * ry));
  }
  addFillet(rx, -ry);
  return sk.close();
};
