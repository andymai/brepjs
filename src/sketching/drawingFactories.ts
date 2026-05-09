import { unwrap } from '@/core/result.js';
import { bug } from '@/core/errors.js';
import {
  make2dCircle,
  make2dEllipse,
  make2dInerpolatedBSplineCurve,
  make2dSegmentCurve,
  type Point2D,
  samePoint,
} from '@/2d/lib/index.js';
import { Blueprint, polysidesBlueprint, roundedRectangleBlueprint } from '@/2d/blueprints/index.js';
import type { BSplineApproximationOptions } from '@/topology/shapeHelpers.js';
import { textBlueprints } from '@/text/textBlueprints.js';
import { Drawing } from './drawing.js';
import { draw } from './drawingPen.js';

/**
 * Creates the `Drawing` of a rectangle with (optional) rounded corners.
 *
 * The rectangle is centered on [0, 0]
 *
 * @category Drawing
 */
export function drawRoundedRectangle(
  width: number,
  height: number,
  r: number | { rx?: number; ry?: number } = 0
): Drawing {
  return new Drawing(roundedRectangleBlueprint(width, height, r));
}

/** Alias for {@link drawRoundedRectangle}. Creates a rectangle (sharp corners when `r` is 0). */
export const drawRectangle = drawRoundedRectangle;

/**
 * Creates the `Drawing` of a circle as one single curve.
 *
 * The circle is centered on [0, 0]
 *
 * @category Drawing
 */
export function drawSingleCircle(radius: number): Drawing {
  return new Drawing(new Blueprint([make2dCircle(radius)]));
}

/**
 * Creates the `Drawing` of an ellipse as one single curve.
 *
 * The ellipse is centered on [0, 0], with axes aligned with the coordinates.
 *
 * @category Drawing
 */
export function drawSingleEllipse(majorRadius: number, minorRadius: number): Drawing {
  const [minor, major] = [majorRadius, minorRadius].sort((a, b) => a - b) as [number, number];
  const direction: Point2D = major === majorRadius ? [1, 0] : [0, 1];

  return new Drawing(new Blueprint([make2dEllipse(major, minor, direction)]));
}

/**
 * Creates the `Drawing` of a circle.
 *
 * The circle is centered on [0, 0]
 *
 * @category Drawing
 */
export function drawCircle(radius: number): Drawing {
  return draw()
    .movePointerTo([-radius, 0])
    .sagittaArc(2 * radius, 0, radius)
    .sagittaArc(-2 * radius, 0, radius)
    .close();
}

/**
 * Creates the `Drawing` of an ellipse.
 *
 * The ellipse is centered on [0, 0], with axes aligned with the coordinates.
 *
 * @category Drawing
 */
export function drawEllipse(majorRadius: number, minorRadius: number): Drawing {
  return draw()
    .movePointerTo([-majorRadius, 0])
    .halfEllipse(2 * majorRadius, 0, minorRadius)
    .halfEllipse(-2 * majorRadius, 0, minorRadius)
    .close();
}

/**
 * Creates the `Drawing` of a polygon in a defined plane
 *
 * The sides of the polygon can be arcs of circle with a defined sagitta.
 * The radius defines the outer radius of the polygon without sagitta
 *
 * @category Drawing
 */
export function drawPolysides(radius: number, sidesCount: number, sagitta = 0): Drawing {
  return new Drawing(polysidesBlueprint(radius, sidesCount, sagitta));
}

/**
 * Creates the `Drawing` of a text, in a defined font size and a font family
 * (which will be the default).
 *
 * @category Drawing
 */
export function drawText(
  text: string,
  { startX = 0, startY = 0, fontSize = 16, fontFamily = 'default' } = {}
): Drawing {
  return new Drawing(textBlueprints(text, { startX, startY, fontSize, fontFamily }));
}

/**
 * Creates the `Drawing` by interpolating points as a curve
 *
 * The drawing will be a spline approximating the points. Note that the
 * degree should be at maximum 3 if you need to export the drawing as an SVG.
 *
 * @category Drawing
 */
export const drawPointsInterpolation = (
  points: Point2D[],
  approximationConfig: BSplineApproximationOptions = {},
  options: {
    closeShape?: boolean;
  } = {}
): Drawing => {
  if (points.length < 2) {
    bug(
      'drawPointsInterpolation',
      `Need at least 2 points for interpolation, got ${points.length}`
    );
  }
  const curves = [unwrap(make2dInerpolatedBSplineCurve(points, approximationConfig))];
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  if (options.closeShape && firstPoint && lastPoint && !samePoint(firstPoint, lastPoint)) {
    curves.push(make2dSegmentCurve(lastPoint, firstPoint));
  }

  return new Drawing(new Blueprint(curves));
};

/**
 * Creates the `Drawing` of parametric function
 *
 * The drawing will be a spline approximating the function. Note that the
 * degree should be at maximum 3 if you need to export the drawing as an SVG.
 *
 * @category Drawing
 */
export const drawParametricFunction = (
  func: (t: number) => Point2D,
  { pointsCount = 400, start = 0, stop = 1, closeShape = false } = {},
  approximationConfig: BSplineApproximationOptions = {}
): Drawing => {
  const stepSize = (stop - start) / pointsCount;
  const points = [...Array(pointsCount + 1).keys()].map((t) => {
    return func(start + t * stepSize);
  });

  return drawPointsInterpolation(points, approximationConfig, { closeShape });
};
