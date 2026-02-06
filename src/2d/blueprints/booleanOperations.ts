import { bug } from '../../core/errors.js';
import { unwrap } from '../../core/result.js';
import zip from '../../utils/zip.js';
import type { Point2D, Curve2D } from '../lib/index.js';
import {
  samePoint as defaultSamePoint,
  intersectCurves,
  removeDuplicatePoints,
  PRECISION_INTERSECTION,
} from '../lib/index.js';

import Blueprint from './Blueprint.js';
import Blueprints from './Blueprints.js';
import CompoundBlueprint from './CompoundBlueprint.js';
import { organiseBlueprints } from './lib.js';

const samePoint = (x: Point2D, y: Point2D) => defaultSamePoint(x, y, PRECISION_INTERSECTION);

const curveMidPoint = (curve: Curve2D) => {
  // (lp - fp) / 2 + fp
  const midParameter = (curve.lastParameter + curve.firstParameter) / 2;
  return curve.value(midParameter);
};

/**
 * Rotates array to start at the curve whose firstPoint matches the given point.
 * Uses hash map for O(1) lookup instead of O(n) findIndex.
 */
const rotateToStartAt = (curves: Curve2D[], point: Point2D) => {
  // Build hash map of curve start points for O(1) lookup
  const pointHash = hashPoint(point);
  let startIndex = -1;
  for (let i = 0; i < curves.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- index within array bounds
    const curve = curves[i]!;
    if (hashPoint(curve.firstPoint) === pointHash && samePoint(point, curve.firstPoint)) {
      startIndex = i;
      break;
    }
  }

  if (startIndex <= 0) return curves;
  // Rotate in-place by concatenating slices
  return curves.slice(startIndex).concat(curves.slice(0, startIndex));
};

/**
 * Rotates array to start at the curve matching the given segment.
 * Uses hash-based filtering for faster candidate identification.
 */
const rotateToStartAtSegment = (curves: Curve2D[], segment: Curve2D) => {
  const segFirstHash = hashPoint(segment.firstPoint);
  const segLastHash = hashPoint(segment.lastPoint);

  const onSegment = (curve: Curve2D) => {
    return (
      samePoint(segment.firstPoint, curve.firstPoint) &&
      samePoint(segment.lastPoint, curve.lastPoint)
    );
  };

  // Fast path: check hash before expensive samePoint comparison
  let startIndex = -1;
  for (let i = 0; i < curves.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- index within array bounds
    const curve = curves[i]!;
    if (
      hashPoint(curve.firstPoint) === segFirstHash &&
      hashPoint(curve.lastPoint) === segLastHash &&
      onSegment(curve)
    ) {
      startIndex = i;
      break;
    }
  }

  // it is also possible that the segment is oriented the other way. We still
  // need to align a start point
  if (startIndex === -1) {
    curves = reverseSegment(curves);
    for (let i = 0; i < curves.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- index within array bounds
      const curve = curves[i]!;
      if (
        hashPoint(curve.firstPoint) === segFirstHash &&
        hashPoint(curve.lastPoint) === segLastHash &&
        onSegment(curve)
      ) {
        startIndex = i;
        break;
      }
    }
    if (startIndex === -1) {
      bug('rotateToStartAtSegment', 'Failed to rotate to segment start');
    }
  }

  if (startIndex <= 0) return curves;
  return curves.slice(startIndex).concat(curves.slice(0, startIndex));
};

// Hash a point for Set/Map lookup (uses precision rounding for fuzzy matching)
// Must match PRECISION_INTERSECTION (1e-9) to avoid hash collisions for nearly-equal points
const hashPoint = (p: Point2D): string => `${p[0].toFixed(9)},${p[1].toFixed(9)}`;

// Hash a segment by both orientations for bidirectional lookup
const hashSegment = (first: Point2D, last: Point2D): string => {
  const h1 = hashPoint(first);
  const h2 = hashPoint(last);
  return h1 < h2 ? `${h1}|${h2}` : `${h2}|${h1}`;
};

function* createSegmentOnPoints(
  curves: Curve2D[],
  allIntersections: Point2D[],
  allCommonSegments: Curve2D[]
) {
  // Pre-compute hash sets for O(1) lookup instead of O(n) find()
  const intersectionSet = new Set(allIntersections.map(hashPoint));
  const commonSegmentSet = new Set(
    allCommonSegments.map((seg) => hashSegment(seg.firstPoint, seg.lastPoint))
  );

  const endsAtIntersection = (curve: Curve2D) => {
    return intersectionSet.has(hashPoint(curve.lastPoint));
  };

  const isCommonSegment = (curve: Curve2D) => {
    return commonSegmentSet.has(hashSegment(curve.firstPoint, curve.lastPoint));
  };

  let currentCurves: Curve2D[] = [];
  for (const curve of curves) {
    if (endsAtIntersection(curve)) {
      currentCurves.push(curve);
      yield currentCurves;
      currentCurves = [];
    } else if (isCommonSegment(curve)) {
      if (currentCurves.length) {
        yield currentCurves;
        currentCurves = [];
      }
      yield [curve];
    } else {
      currentCurves.push(curve);
    }
  }
  if (currentCurves.length) {
    yield currentCurves;
  }
}

type Segment = Array<Curve2D>;
type IntersectionSegment = [Segment, Segment | 'same'];

const startOfSegment = (s: Segment): Point2D => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return s[0]!.firstPoint;
};

const endOfSegment = (s: Segment): Point2D => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return s[s.length - 1]!.lastPoint;
};

const reverseSegment = (segment: Segment) => {
  return [...segment].reverse().map((curve) => {
    const newCurve = curve.clone();
    newCurve.reverse();
    return newCurve;
  });
};

const reverseSegments = (s: Segment[]) => {
  return [...s].reverse().map(reverseSegment);
};

function removeNonCrossingPoint(
  allIntersections: Point2D[],
  segmentedCurve: Curve2D[],
  blueprintToCheck: Blueprint
) {
  return allIntersections.filter((intersection: Point2D) => {
    const segmentsOfIntersection = segmentedCurve.filter((s) => {
      return samePoint(s.firstPoint, intersection) || samePoint(s.lastPoint, intersection);
    });
    if (segmentsOfIntersection.length % 2) {
      bug('removeNonCrossingPoint', 'Odd number of segments at intersection point (expected even)');
    }

    const isInside = segmentsOfIntersection.map((segment: Curve2D): boolean => {
      return blueprintToCheck.isInside(curveMidPoint(segment));
    });

    // Either they are all inside or outside
    const segmentsOnTheSameSide = isInside.every((i) => i) || !isInside.some((i) => i);

    return !segmentsOnTheSameSide;
  });
}

/* When two shape intersect we cut them into segments between the intersection
 * points.
 *
 * This function returns the list of segments that have the same start and end
 * at the same intersection points or null if there is no intersection.
 *
 * The function assumes that the blueprints are closed
 */
function blueprintsIntersectionSegments(
  first: Blueprint,
  second: Blueprint
): IntersectionSegment[] | null {
  // For each curve of each blueprint we figure out where the intersection
  // points are.
  let allIntersections: Point2D[] = [];
  const allCommonSegments: Curve2D[] = [];

  const firstCurvePoints: Point2D[][] = new Array(first.curves.length).fill(0).map(() => []);
  const secondCurvePoints: Point2D[][] = new Array(second.curves.length).fill(0).map(() => []);

  first.curves.forEach((thisCurve, firstIndex) => {
    second.curves.forEach((otherCurve, secondIndex) => {
      // The algorithm used here seems to fail for smaller precisions (it
      // detects overlaps in circle that do not exist
      const { intersections, commonSegments, commonSegmentsPoints } = unwrap(
        intersectCurves(thisCurve, otherCurve, PRECISION_INTERSECTION / 100)
      );

      allIntersections.push(...intersections);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      firstCurvePoints[firstIndex]!.push(...intersections);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      secondCurvePoints[secondIndex]!.push(...intersections);

      allCommonSegments.push(...commonSegments);
      allIntersections.push(...commonSegmentsPoints);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      firstCurvePoints[firstIndex]!.push(...commonSegmentsPoints);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      secondCurvePoints[secondIndex]!.push(...commonSegmentsPoints);
    });
  });

  allIntersections = removeDuplicatePoints(allIntersections, PRECISION_INTERSECTION);

  // If there is only one intersection point we consider that the blueprints
  // are not intersecting
  if (!allIntersections.length || allIntersections.length === 1) return null;

  // We further split the curves at the intersections
  const cutCurve = ([curve, intersections]: [Curve2D, Point2D[]]): Curve2D[] => {
    if (!intersections.length) return [curve];
    return curve.splitAt(intersections, PRECISION_INTERSECTION / 100);
  };
  let firstCurveSegments = zip([first.curves, firstCurvePoints] as [
    Curve2D[],
    Point2D[][],
  ]).flatMap(cutCurve);

  let secondCurveSegments = zip([second.curves, secondCurvePoints] as [
    Curve2D[],
    Point2D[][],
  ]).flatMap(cutCurve);

  const commonSegmentsPoints = allCommonSegments.map((c) => [c.firstPoint, c.lastPoint]);

  // We need to remove intersection points that are not crossing into each
  // other (i.e. the two blueprints are only touching in one point and not
  // intersecting there.)
  allIntersections = removeNonCrossingPoint(allIntersections, firstCurveSegments, second);

  if (!allIntersections.length && !allCommonSegments.length) return null;

  // We align the beginning of the curves
  if (!allCommonSegments.length) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const startAt = allIntersections[0]!;
    firstCurveSegments = rotateToStartAt(firstCurveSegments, startAt);
    secondCurveSegments = rotateToStartAt(secondCurveSegments, startAt);
  } else {
    // When there are common segments we always start on one
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const startSegment = allCommonSegments[0]!;
    firstCurveSegments = rotateToStartAtSegment(firstCurveSegments, startSegment);
    secondCurveSegments = rotateToStartAtSegment(secondCurveSegments, startSegment);
  }

  // We group curves in segments
  const firstIntersectedSegments = Array.from(
    createSegmentOnPoints(firstCurveSegments, allIntersections, allCommonSegments)
  );
  let secondIntersectedSegments = Array.from(
    createSegmentOnPoints(secondCurveSegments, allIntersections, allCommonSegments)
  );
  if (
    !samePoint(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      endOfSegment(secondIntersectedSegments[0]!),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      endOfSegment(firstIntersectedSegments[0]!)
    ) ||
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    (allCommonSegments.length > 0 && secondIntersectedSegments[0]!.length !== 1)
  ) {
    secondIntersectedSegments = reverseSegments(secondIntersectedSegments);
  }

  return zip([firstIntersectedSegments, secondIntersectedSegments]).map(
    ([first, second]): IntersectionSegment => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const firstSegment = first!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const secondSegment = second!;
      const currentStart = startOfSegment(firstSegment);
      const currentEnd = endOfSegment(firstSegment);

      if (
        commonSegmentsPoints.find(([startPoint, endPoint]) => {
          return (
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            (samePoint(startPoint!, currentStart) &&
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              samePoint(endPoint!, currentEnd)) ||
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            (samePoint(startPoint!, currentEnd) &&
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              samePoint(startPoint!, currentStart))
          );
        })
      ) {
        return [firstSegment, 'same'];
      }
      return [firstSegment, secondSegment];
    }
  );
}

const splitPaths = (curves: Curve2D[]) => {
  const startPoints = curves.map((c) => c.firstPoint);
  let endPoints = curves.map((c) => c.lastPoint);
  endPoints = endPoints.slice(-1).concat(endPoints.slice(0, -1));

  const discontinuities = zip([startPoints, endPoints])
    .map(([startPoint, endPoint], index) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (!samePoint(startPoint!, endPoint!)) {
        return index;
      }
      return null;
    })
    .filter((f) => f !== null);

  if (!discontinuities.length) return [curves];

  const paths = zip([discontinuities.slice(0, -1), discontinuities.slice(1)]).map(
    ([start, end]) => {
      return curves.slice(start, end);
    }
  );

  let lastPath = curves.slice(discontinuities[discontinuities.length - 1]);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  if (discontinuities[0]! !== 0) {
    lastPath = lastPath.concat(curves.slice(0, discontinuities[0]));
  }
  paths.push(lastPath);

  return paths;
};

function booleanOperation(
  first: Blueprint,
  second: Blueprint,
  {
    firstInside,
    secondInside,
  }: {
    firstInside: 'keep' | 'remove';
    secondInside: 'keep' | 'remove';
  }
):
  | Blueprint
  | Blueprints
  | null
  | { identical: true }
  | {
      firstCurveInSecond: boolean;
      secondCurveInFirst: boolean;
      identical: false;
    } {
  const segments = blueprintsIntersectionSegments(first, second);

  // The case where we have no intersections
  if (!segments) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const firstBlueprintPoint = curveMidPoint(first.curves[0]!);
    const firstCurveInSecond = second.isInside(firstBlueprintPoint);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const secondBlueprintPoint = curveMidPoint(second.curves[0]!);
    const secondCurveInFirst = first.isInside(secondBlueprintPoint);

    return {
      identical: false,
      firstCurveInSecond,
      secondCurveInFirst,
    };
  }

  if (segments.every(([, secondSegment]) => secondSegment === 'same')) {
    return { identical: true };
  }

  let lastWasSame: null | Segment = null;
  let segmentsIn: number | null = null;

  const s = segments.flatMap(([firstSegment, secondSegment]) => {
    let segments: Segment = [];
    let segmentsOut = 0;

    // When two segments are on top of each other we base our decision on the
    // fact that every point should have one segment entering, and one going
    // out.
    if (secondSegment === 'same') {
      if (segmentsIn === 1) {
        segmentsIn = 1;
        return [...firstSegment];
      }

      if (segmentsIn === 2 || segmentsIn === 0) {
        segmentsIn = null;
        return [];
      }

      if (segmentsIn === null) {
        if (!lastWasSame) lastWasSame = firstSegment;
        else lastWasSame = [...lastWasSame, ...firstSegment];
        return [];
      }

      // segmentsIn has a value other than 0, 1, 2, or null — should not happen
      return [];
    }

    // Every segment is kept or removed according to the fact that it is within
    // or not of the other closed blueprint

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const firstSegmentPoint = curveMidPoint(firstSegment[0]!);
    const firstSegmentInSecondShape = second.isInside(firstSegmentPoint);
    if (
      (firstInside === 'keep' && firstSegmentInSecondShape) ||
      (firstInside === 'remove' && !firstSegmentInSecondShape)
    ) {
      segmentsOut += 1;
      segments.push(...firstSegment);
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const secondSegmentPoint = curveMidPoint(secondSegment[0]!);
    const secondSegmentInFirstShape = first.isInside(secondSegmentPoint);

    if (
      (secondInside === 'keep' && secondSegmentInFirstShape) ||
      (secondInside === 'remove' && !secondSegmentInFirstShape)
    ) {
      let segmentsToAdd = secondSegment;

      // When there are only two segments we cannot know if we are in the
      // same until here - so it is possible that they are mismatched.
      if (segmentsOut === 1) {
        segmentsToAdd = reverseSegment(secondSegment);
      }
      segmentsOut += 1;
      segments.push(...segmentsToAdd);
    }

    // This is the case where the information about the segments entering the
    // previous node where not known and no segment was selected
    if (segmentsIn === null && segmentsOut === 1 && lastWasSame) {
      segments = [...lastWasSame, ...segments];
    }

    if (segmentsOut === 1) {
      segmentsIn = segmentsOut;
      lastWasSame = null;
    }
    return segments;
  });

  // It is possible to have more than one resulting out blueprint, we make sure
  // to split them
  const paths = splitPaths(s)
    .filter((b) => b.length)
    .map((b) => new Blueprint(b));

  if (paths.length === 0) return null;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  if (paths.length === 1) return paths[0]!;

  return organiseBlueprints(paths);
}

/**
 * Compute the boolean union of two simple blueprints.
 *
 * Segments each blueprint at their intersection points, discards segments
 * inside the other shape, and reassembles the remaining curves.
 *
 * @param first - First blueprint operand.
 * @param second - Second blueprint operand.
 * @returns The fused outline, a {@link Blueprints} if the result is
 *   disjoint, or `null` if the operation produces no geometry.
 *
 * @remarks Both blueprints must be closed. For compound or multi-blueprint
 * inputs, use {@link fuse2D} instead.
 */
export const fuseBlueprints = (
  first: Blueprint,
  second: Blueprint
): null | Blueprint | Blueprints => {
  const result = booleanOperation(first, second, {
    firstInside: 'remove',
    secondInside: 'remove',
  });

  if (result === null || result instanceof Blueprint || result instanceof Blueprints) return result;

  if (result.identical) {
    return first.clone();
  }

  if (result.firstCurveInSecond) {
    return second.clone();
  }

  if (result.secondCurveInFirst) {
    return first.clone();
  }

  return new Blueprints([first, second]);
};

/**
 * Compute the boolean difference of two simple blueprints (first minus second).
 *
 * Segments the blueprints at their intersections, keeps segments of the first
 * that are outside the second, and segments of the second that are inside the
 * first (reversed to form the boundary of the cut).
 *
 * @param first - Base blueprint to cut from.
 * @param second - Tool blueprint to subtract.
 * @returns The remaining outline, or `null` if nothing remains.
 *
 * @remarks Both blueprints must be closed. For compound inputs use {@link cut2D}.
 */
export const cutBlueprints = (
  first: Blueprint,
  second: Blueprint
): null | Blueprint | Blueprints => {
  const result = booleanOperation(first, second, {
    firstInside: 'remove',
    secondInside: 'keep',
  });

  if (result === null || result instanceof Blueprint || result instanceof Blueprints) return result;

  if (result.identical) {
    return null;
  }

  if (result.firstCurveInSecond) {
    return null;
  }

  if (result.secondCurveInFirst) {
    return new Blueprints([new CompoundBlueprint([first, second])]);
  }

  return first.clone();
};

/**
 * Compute the boolean intersection of two simple blueprints.
 *
 * Keeps only the segments of each blueprint that lie inside the other,
 * producing the overlapping region.
 *
 * @param first - First blueprint operand.
 * @param second - Second blueprint operand.
 * @returns The intersection outline, or `null` if the blueprints do not overlap.
 *
 * @remarks Both blueprints must be closed. For compound inputs use {@link intersect2D}.
 */
export const intersectBlueprints = (
  first: Blueprint,
  second: Blueprint
): null | Blueprint | Blueprints => {
  const result = booleanOperation(first, second, {
    firstInside: 'keep',
    secondInside: 'keep',
  });

  if (result === null || result instanceof Blueprint || result instanceof Blueprints) return result;

  if (result.identical) {
    return first.clone();
  }

  if (result.firstCurveInSecond) {
    return first.clone();
  }

  if (result.secondCurveInFirst) {
    return second.clone();
  }

  return null;
};
