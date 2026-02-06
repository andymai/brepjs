import Flatbush from 'flatbush';
import { bug } from '../../core/errors.js';
import type { Curve2D } from './Curve2D.js';

/**
 * Group a flat list of curves into connected chains by matching endpoints.
 *
 * Uses a Flatbush spatial index for fast nearest-neighbour lookups.
 * Each returned sub-array is a connected sequence where each curve's
 * start point matches the previous curve's end point within the given
 * precision.
 *
 * @param curves - Unordered input curves to stitch.
 * @param precision - Maximum distance to consider two endpoints coincident.
 * @returns An array of connected curve chains.
 */
export const stitchCurves = (curves: Curve2D[], precision = 1e-7): Curve2D[][] => {
  // We create a spacial index of the startpoints
  const startPoints = new Flatbush(curves.length);
  curves.forEach((c) => {
    const [x, y] = c.firstPoint;
    startPoints.add(x - precision, y - precision, x + precision, y + precision);
  });
  startPoints.finish();

  const stitchedCurves: Curve2D[][] = [];
  const visited = new Set<number>();

  curves.forEach((curve, index) => {
    if (visited.has(index)) return;

    const connectedCurves: Curve2D[] = [curve];
    let currentIndex = index;

    visited.add(index);

    // Once we have started a connected curve segment, we look for the next

    let maxLoops = curves.length;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- intentional infinite loop with break
    while (true) {
      if (maxLoops-- < 0) {
        bug('stitchCurves', 'Infinite loop detected');
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const lastPoint = connectedCurves[connectedCurves.length - 1]!.lastPoint;

      const [x, y] = lastPoint;
      const neighbors = startPoints.search(
        x - precision,
        y - precision,
        x + precision,
        y + precision
      );

      const indexDistance = (otherIndex: number) =>
        Math.abs((currentIndex - otherIndex) % curves.length);
      const potentialNextCurves = neighbors
        .filter((neighborIndex: number) => !visited.has(neighborIndex))
        .map((neighborIndex: number): [Curve2D, number, number] => [
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          curves[neighborIndex]!,
          neighborIndex,
          indexDistance(neighborIndex),
        ])
        .sort(
          ([, , a]: [Curve2D, number, number], [, , b]: [Curve2D, number, number]) =>
            indexDistance(a) - indexDistance(b)
        );

      if (potentialNextCurves.length === 0) {
        // No more curves to connect we should have wrapped
        stitchedCurves.push(connectedCurves);
        break;
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const [nextCurve, nextCurveIndex] = potentialNextCurves[0]!;

      connectedCurves.push(nextCurve);
      visited.add(nextCurveIndex);
      currentIndex = nextCurveIndex;
    }
  });

  return stitchedCurves;
};
