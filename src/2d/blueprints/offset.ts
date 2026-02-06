import Flatbush from 'flatbush';

import { bug } from '../../core/errors.js';
import { unwrap } from '../../core/result.js';
import type { Point2D } from '../lib/index.js';
import {
  intersectCurves,
  stitchCurves,
  make2dOffset,
  Curve2D,
  samePoint as defaultSamePoint,
  make2dSegmentCurve,
  squareDistance2d,
  make2dArcFromCenter,
  add2d,
  subtract2d,
  PRECISION_OFFSET,
} from '../lib/index.js';
import Blueprint from './Blueprint.js';
import Blueprints from './Blueprints.js';
import CompoundBlueprint from './CompoundBlueprint.js';
import type { Shape2D } from './boolean2D.js';
import { fuse2D, cut2D } from './boolean2D.js';

const samePoint = (x: Point2D, y: Point2D) => defaultSamePoint(x, y, PRECISION_OFFSET * 10);

const getIntersectionPoint = (
  line1Start: Point2D,
  line1End: Point2D,
  line2Start: Point2D,
  line2End: Point2D
): Point2D | null => {
  // Pre-compute direction differences (det([[a,1],[b,1]]) = a - b)
  const dx1 = line1Start[0] - line1End[0];
  const dy1 = line1Start[1] - line1End[1];
  const dx2 = line2Start[0] - line2End[0];
  const dy2 = line2Start[1] - line2End[1];

  // Denominator: det([[dx1, dy1], [dx2, dy2]])
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-12) return null;

  // Cross products for the line equations
  const cross1 = line1Start[0] * line1End[1] - line1Start[1] * line1End[0];
  const cross2 = line2Start[0] * line2End[1] - line2Start[1] * line2End[0];

  // Intersection point using Cramer's rule
  const x = (cross1 * dx2 - cross2 * dx1) / denom;
  const y = (cross1 * dy2 - cross2 * dy1) / denom;

  return [x, y] as Point2D;
};

function joinRound(
  appendCurve: (curve: OffsetCurvePair | Curve2D) => void,
  previousLastPoint: Point2D,
  firstPoint: Point2D,
  previousCurve: OffsetCurvePair,
  _curve: OffsetCurvePair
) {
  const arcJoiner = make2dArcFromCenter(
    previousLastPoint,
    firstPoint,
    previousCurve.original.lastPoint
  );

  appendCurve(previousCurve);
  appendCurve(arcJoiner);
}

function joinBevel(
  appendCurve: (curve: OffsetCurvePair | Curve2D) => void,
  previousLastPoint: Point2D,
  firstPoint: Point2D,
  previousCurve: OffsetCurvePair,
  _curve: OffsetCurvePair
) {
  const bevelJoiner = make2dSegmentCurve(previousLastPoint, firstPoint);

  appendCurve(previousCurve);
  appendCurve(bevelJoiner);
}

function joinMiter(
  appendCurve: (curve: OffsetCurvePair | Curve2D) => void,
  previousLastPoint: Point2D,
  firstPoint: Point2D,
  previousCurve: OffsetCurvePair,
  curve: OffsetCurvePair
) {
  const previousOtherPoint =
    previousCurve.offset instanceof Curve2D
      ? subtract2d(previousLastPoint, previousCurve.offset.tangentAt(1))
      : previousCurve.offset.firstPoint;
  const nextOtherPoint =
    curve.offset instanceof Curve2D
      ? add2d(firstPoint, curve.offset.tangentAt(0))
      : curve.offset.lastPoint;

  const offsetIntersectionPoint = getIntersectionPoint(
    previousOtherPoint,
    previousLastPoint,
    firstPoint,
    nextOtherPoint
  );

  if (!offsetIntersectionPoint) {
    // Lines are parallel — fall back to bevel join
    const bevelJoiner = make2dSegmentCurve(previousLastPoint, firstPoint);
    appendCurve(previousCurve);
    appendCurve(bevelJoiner);
    return;
  }

  const miterJoiner1 = make2dSegmentCurve(previousLastPoint, offsetIntersectionPoint);
  const miterJoiner2 = make2dSegmentCurve(offsetIntersectionPoint, firstPoint);

  appendCurve(previousCurve);
  appendCurve(miterJoiner1);
  appendCurve(miterJoiner2);
}

const OFFSET_JOINERS = {
  round: joinRound,
  bevel: joinBevel,
  miter: joinMiter,
} as const;

/**
 * Compute raw offset curves for a single blueprint without self-intersection cleanup.
 *
 * Offsets each curve individually, then joins adjacent offset curves using the
 * configured line-join strategy (round, bevel, or miter).
 *
 * @param blueprint - The blueprint to offset.
 * @param offset - Offset distance (positive = outward, negative = inward).
 * @param offsetConfig - Join style configuration.
 * @returns Array of offset curves (may contain self-intersections).
 *
 * @remarks This is the low-level building block used by {@link offsetBlueprint}.
 * Most callers should prefer {@link offset} instead.
 */
export function rawOffsets(
  blueprint: Blueprint,
  offset: number,
  offsetConfig: Offset2DConfig = {}
): Curve2D[] {
  const correctedOffset = blueprint.orientation === 'clockwise' ? -offset : offset;
  const offsetCurves: OffsetCurvePair[] = blueprint.curves.map((c) => ({
    offset: make2dOffset(c, correctedOffset),
    original: c,
  }));

  // Ideally we would use the length of the curve to make sure it is
  // not only a point, but the algo we have access to are a bit to
  // convoluted to be usable here

  const offsettedArray: Curve2D[] = [];

  let savedLastCurve: null | OffsetCurvePair = null;

  let previousCurve = offsetCurves.at(-1);

  // We have no offset curves
  if (!previousCurve) return [];

  function appendCurve(curve: OffsetCurvePair | Curve2D) {
    // There are different ways to build the array of offsetted curves.
    // This should build the array of offsetted curves depending on the shape of
    // what we are offsetting.

    // if the curve is a Curve2D we just push it
    if (curve instanceof Curve2D) {
      offsettedArray.push(curve);
      return;
    }

    if (!savedLastCurve) {
      // we make the first curve we append available to wrap when iterating
      savedLastCurve = curve;
    } else if (curve.offset instanceof Curve2D) {
      // if we have an offset curve that is a Curve2D we push it
      offsettedArray.push(curve.offset);
    } else if (!samePoint(curve.offset.firstPoint, curve.offset.lastPoint)) {
      // if the offset curve is collapsed we push a segment curve
      offsettedArray.push(make2dSegmentCurve(curve.offset.firstPoint, curve.offset.lastPoint));
    }
  }

  const iterateOffsetCurves = function* (): Generator<OffsetCurvePair> {
    for (const curve of offsetCurves.slice(0, -1)) {
      yield curve;
    }
    // This should never happen
    if (!savedLastCurve) bug('offset.rawOffsets', 'No saved curve after iterating offset segments');
    yield savedLastCurve;
  };

  for (const curve of iterateOffsetCurves()) {
    const previousLastPoint = previousCurve.offset.lastPoint;
    const firstPoint = curve.offset.firstPoint;

    // When the offset curves do still touch we do nothing
    if (samePoint(previousLastPoint, firstPoint)) {
      appendCurve(previousCurve);
      previousCurve = curve;
      continue;
    }

    let intersections: Point2D[] = [];

    if (previousCurve.offset instanceof Curve2D && curve.offset instanceof Curve2D) {
      // When the offset curves intersect we cut them and save them at
      const { intersections: pointIntersections, commonSegmentsPoints } = unwrap(
        intersectCurves(previousCurve.offset, curve.offset, PRECISION_OFFSET / 100)
      );
      intersections = [...pointIntersections, ...commonSegmentsPoints];
    }

    if (intersections.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      let intersection = intersections[0]!;
      if (intersections.length > 1) {
        // We choose the intersection point the closest to the end of the
        // original curve endpoint (why? not sure, following
        // https://github.com/jbuckmccready/cavalier_contours/)

        const originalEndpoint: Point2D = previousCurve.original.lastPoint;
        // Single-pass min distance calculation (more efficient than indexOf(Math.min(...)))
        let minDist = squareDistance2d(intersection, originalEndpoint);
        for (let i = 1; i < intersections.length; i++) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- index within bounds
          const point = intersections[i]!;
          const d = squareDistance2d(point, originalEndpoint);
          if (d < minDist) {
            minDist = d;
            intersection = point;
          }
        }
      }

      // We need to be a lot more careful here with multiple intersections
      // as well as cases where curves overlap

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const splitPreviousCurve: Curve2D = (previousCurve.offset as Curve2D).splitAt(
        [intersection],
        PRECISION_OFFSET
      )[0]!;
      const splitCurve = (curve.offset as Curve2D).splitAt([intersection], PRECISION_OFFSET).at(-1);

      if (!splitCurve) bug('offset.rawOffsets', 'Split produced no trailing curve segment');

      appendCurve({
        offset: splitPreviousCurve,
        original: previousCurve.original,
      });
      previousCurve = { offset: splitCurve, original: curve.original };
      continue;
    }

    // When the offset curves do not intersect we link them with an offset
    // joiner
    const joiner = OFFSET_JOINERS[offsetConfig.lineJoinType ?? 'round'];
    joiner(appendCurve, previousLastPoint, firstPoint, previousCurve, curve);

    previousCurve = curve;
  }

  appendCurve(previousCurve);
  return offsettedArray;
}

interface OffsetCurvePair {
  offset: Curve2D | { collapsed: true; firstPoint: Point2D; lastPoint: Point2D };
  original: Curve2D;
}

/** Configuration for 2D offset operations. */
export interface Offset2DConfig {
  /** Corner join style when offset curves diverge (default: `'round'`). */
  lineJoinType?: 'miter' | 'bevel' | 'round';
}

/**
 * Offset a single blueprint, resolving self-intersections and pruning invalid segments.
 *
 * Produces a new shape whose boundary is at a constant distance from the input
 * blueprint. Self-intersections introduced by the offset are resolved using
 * spatial indexing and curve splitting, following the
 * {@link https://github.com/jbuckmccready/CavalierContours | Cavalier Contours} algorithm.
 *
 * @param blueprint - The source blueprint.
 * @param offset - Offset distance (positive = outward, negative = inward).
 * @param offsetConfig - Join style configuration.
 * @returns The offset shape, or `null` if the offset collapses the blueprint.
 *
 * @see {@link offset} for the polymorphic version that handles all Shape2D types.
 */
export function offsetBlueprint(
  blueprint: Blueprint,
  offset: number,
  offsetConfig: Offset2DConfig = {}
): Shape2D {
  const offsettedArray = rawOffsets(blueprint, offset, offsetConfig);

  if (offsettedArray.length < 2) return null;

  // We remove the self intersections with the use the the algorithm as described in https://github.com/jbuckmccready/CavalierContours#offset-algorithm-and-stepwise-example

  const allIntersections: Map<number, Point2D[]> = new Map();
  const updateIntersections = (index: number, newPoints: Point2D[]) => {
    const intersections = allIntersections.get(index) || [];
    allIntersections.set(index, [...intersections, ...newPoints]);
  };

  // Build spatial index of curve bounding boxes for O(n log n) intersection filtering
  const spatialIndex = new Flatbush(offsettedArray.length);
  for (const curve of offsettedArray) {
    const [[xMin, yMin], [xMax, yMax]] = curve.boundingBox.bounds;
    spatialIndex.add(xMin, yMin, xMax, yMax);
  }
  spatialIndex.finish();

  // Use spatial index to find candidate pairs, avoiding O(n²) comparisons
  const testedPairs = new Set<string>();
  offsettedArray.forEach((firstCurve, firstIndex) => {
    const [[xMin, yMin], [xMax, yMax]] = firstCurve.boundingBox.bounds;
    const candidates = spatialIndex.search(xMin, yMin, xMax, yMax);

    for (const secondIndex of candidates) {
      // Only test pairs where secondIndex > firstIndex to avoid duplicates
      if (secondIndex <= firstIndex) continue;

      // Avoid testing the same pair twice
      const pairKey = `${firstIndex}-${secondIndex}`;
      if (testedPairs.has(pairKey)) continue;
      testedPairs.add(pairKey);

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- index from spatial query within bounds
      const secondCurve = offsettedArray[secondIndex]!;

      const { intersections: rawIntersections, commonSegmentsPoints } = unwrap(
        intersectCurves(firstCurve, secondCurve, PRECISION_OFFSET)
      );

      const intersections = [...rawIntersections, ...commonSegmentsPoints].filter(
        (intersection) => {
          const onFirstCurveExtremity =
            samePoint(intersection, firstCurve.firstPoint) ||
            samePoint(intersection, firstCurve.lastPoint);

          const onSecondCurveExtremity =
            samePoint(intersection, secondCurve.firstPoint) ||
            samePoint(intersection, secondCurve.lastPoint);

          return !(onFirstCurveExtremity && onSecondCurveExtremity);
        }
      );

      if (!intersections.length) continue;

      updateIntersections(firstIndex, intersections);
      updateIntersections(secondIndex, intersections);
    }
  });

  if (!allIntersections.size) {
    const offsettedBlueprint = new Blueprint(offsettedArray);
    if (!blueprint.intersects(offsettedBlueprint)) return offsettedBlueprint;
    return null;
  }

  const splitCurves = offsettedArray.flatMap((curve, index) => {
    if (!allIntersections.has(index)) return curve;

    const intersections = allIntersections.get(index) || [];
    const splitCurves = curve.splitAt(intersections, PRECISION_OFFSET * 100);
    return splitCurves;
  });

  // We remove all the segments that are closer to the original curve than the offset
  const prunedCurves = splitCurves.filter((curve) => {
    const closeCurve = blueprint.curves.find(
      (c) => c.distanceFrom(curve) < Math.abs(offset) - PRECISION_OFFSET
    );
    return !closeCurve;
  });

  if (!prunedCurves.length) return null;

  const curvesGrouped = stitchCurves(prunedCurves);

  const blueprints = curvesGrouped
    .filter((c) => c.length > 1)
    .map((c) => new Blueprint(c))
    .filter((b) => b.isClosed());

  if (!blueprints.length) return null;
  if (blueprints.length === 1) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return blueprints[0]!;
  }
  return new Blueprints(blueprints);
}

const fuseAll = (blueprints: Shape2D[]): Shape2D => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  let fused: Shape2D = blueprints[0]!;
  for (let i = 1; i < blueprints.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    fused = fuse2D(fused, blueprints[i]!);
  }
  return fused;
};

/**
 * Offset any 2D shape (Blueprint, CompoundBlueprint, or Blueprints) by a distance.
 *
 * Dispatches to {@link offsetBlueprint} for simple blueprints and recursively
 * handles compound and multi-blueprint shapes.
 *
 * @param bp - The shape to offset.
 * @param offsetDistance - Offset distance (positive = outward, negative = inward).
 * @param offsetConfig - Join style configuration.
 * @returns The offset shape, or `null` if the offset collapses entirely.
 *
 * @example
 * ```ts
 * const expanded = offset(blueprint, 2);
 * const shrunk = offset(blueprint, -1, { lineJoinType: 'miter' });
 * ```
 */
export default function offset(
  bp: Shape2D,
  offsetDistance: number,
  offsetConfig: Offset2DConfig = {}
): Shape2D {
  if (bp instanceof Blueprint) {
    return offsetBlueprint(bp, offsetDistance, offsetConfig);
  } else if (bp instanceof Blueprints) {
    return fuseAll(bp.blueprints.map((b) => offset(b, offsetDistance, offsetConfig)));
  } else if (bp instanceof CompoundBlueprint) {
    const innerShape = fuseAll(
      bp.blueprints.slice(1).map((b) => offset(b, offsetDistance, offsetConfig))
    );
    return cut2D(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      offset(bp.blueprints[0]!, offsetDistance, offsetConfig),
      innerShape
    );
  }
  return null;
}
