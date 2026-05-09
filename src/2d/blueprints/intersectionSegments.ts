import Flatbush from 'flatbush';

import { unwrap } from '@/core/result.js';
import zip from '@/utils/zip.js';
import { wasmIndex } from '@/utils/vec3.js';
import type { Point2D, Curve2D } from '@/2d/lib/index.js';
import { intersectCurves, removeDuplicatePoints, PRECISION_INTERSECTION } from '@/2d/lib/index.js';

import type Blueprint from './blueprint.js';
import {
  samePoint,
  hashPoint,
  hashSegment,
  startOfSegment,
  endOfSegment,
  reverseSegments,
  curveMidPoint,
  rotateToStartAt,
  rotateToStartAtSegment,
} from './booleanHelpers.js';
import type { Segment, IntersectionSegment } from './booleanHelpers.js';

// ---------------------------------------------------------------------------
// Segment generator: splits curves at intersection points and common segments
// ---------------------------------------------------------------------------

function* createSegmentOnPoints(
  curves: Curve2D[],
  allIntersections: Point2D[],
  allCommonSegments: Curve2D[]
): Generator<Segment> {
  // Pre-compute hash sets for fast O(1) lookup (first pass)
  const intersectionSet = new Set(allIntersections.map(hashPoint));
  const commonSegmentSet = new Set(
    allCommonSegments.map((seg) => hashSegment(seg.firstPoint, seg.lastPoint))
  );

  // Hash-then-tolerance lookup: handles toFixed(9) rounding boundary mismatches
  const matchesIntersection = (point: Point2D): boolean => {
    if (intersectionSet.has(hashPoint(point))) return true;
    return allIntersections.some((p) => samePoint(p, point));
  };

  const matchesCommonSegment = (first: Point2D, last: Point2D): boolean => {
    if (commonSegmentSet.has(hashSegment(first, last))) return true;
    return allCommonSegments.some(
      (seg) =>
        (samePoint(seg.firstPoint, first) && samePoint(seg.lastPoint, last)) ||
        (samePoint(seg.firstPoint, last) && samePoint(seg.lastPoint, first))
    );
  };

  let currentCurves: Curve2D[] = [];
  for (const curve of curves) {
    // Degenerate curves (both endpoints within tolerance) from prior boolean
    // operations are absorbed into the current accumulator without triggering
    // a segment break — they carry no meaningful geometry.
    if (samePoint(curve.firstPoint, curve.lastPoint)) {
      currentCurves.push(curve);
      continue;
    }

    const endsAtIntersection = matchesIntersection(curve.lastPoint);
    const isCommon = matchesCommonSegment(curve.firstPoint, curve.lastPoint);

    if (endsAtIntersection) {
      currentCurves.push(curve);
      yield currentCurves;
      currentCurves = [];
    } else if (isCommon) {
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

// ---------------------------------------------------------------------------
// Non-crossing point removal
// ---------------------------------------------------------------------------

/**
 * Filter out intersection points where the curves only touch but do not
 * actually cross from one side to the other.
 */
function removeNonCrossingPoints(
  allIntersections: Point2D[],
  segmentedCurve: Curve2D[],
  blueprintToCheck: Blueprint
): Point2D[] {
  return allIntersections.filter((intersection) => {
    const touching = segmentedCurve.filter(
      (s) => samePoint(s.firstPoint, intersection) || samePoint(s.lastPoint, intersection)
    );
    // When a prior boolean operation left near-zero-length curves at corner
    // junctions, a single intersection point can touch an odd number of
    // segments: the two expected segments on either side plus the degenerate
    // bystander whose both endpoints fall within PRECISION_INTERSECTION.
    // Exclude such bystanders to restore the even-parity invariant.
    const effectiveTouching =
      touching.length % 2
        ? touching.filter(
            (s) => !(samePoint(s.firstPoint, intersection) && samePoint(s.lastPoint, intersection))
          )
        : touching;

    // If nothing is left, or the count is still odd after removing
    // bystanders, the intersection geometry is degenerate — conservatively
    // classify as non-crossing so downstream segment pairing stays balanced.
    if (effectiveTouching.length === 0 || effectiveTouching.length % 2) return false;

    const insideFlags = effectiveTouching.map((segment) =>
      blueprintToCheck.isInside(curveMidPoint(segment))
    );

    // Either all inside or all outside means no crossing
    const allSameSide = insideFlags.every(Boolean) || insideFlags.every((f) => !f);
    return !allSameSide;
  });
}

// ---------------------------------------------------------------------------
// Curve intersection and splitting
// ---------------------------------------------------------------------------

interface CurveIntersectionResult {
  allIntersections: Point2D[];
  allCommonSegments: Curve2D[];
  firstCurvePoints: Point2D[][];
  secondCurvePoints: Point2D[][];
}

/**
 * Find all intersection points and common segments between two blueprints'
 * curves. Returns per-curve intersection points for subsequent splitting.
 */
function findAllIntersections(first: Blueprint, second: Blueprint): CurveIntersectionResult {
  const allIntersections: Point2D[] = [];
  const allCommonSegments: Curve2D[] = [];
  const firstCurvePoints: Point2D[][] = first.curves.map(() => []);
  const secondCurvePoints: Point2D[][] = second.curves.map(() => []);

  const secondIndex = new Flatbush(second.curves.length);
  for (const curve of second.curves) {
    const [[xMin, yMin], [xMax, yMax]] = curve.boundingBox.bounds;
    secondIndex.add(xMin, yMin, xMax, yMax);
  }
  secondIndex.finish();

  first.curves.forEach((thisCurve, firstIdx) => {
    const [[xMin, yMin], [xMax, yMax]] = thisCurve.boundingBox.bounds;
    const candidates = secondIndex.search(xMin, yMin, xMax, yMax);

    for (const secondIdx of candidates) {
      const otherCurve = wasmIndex(second.curves, secondIdx);
      const { intersections, commonSegments, commonSegmentsPoints } = unwrap(
        intersectCurves(thisCurve, otherCurve, PRECISION_INTERSECTION / 100)
      );

      allIntersections.push(...intersections);
      firstCurvePoints[firstIdx]?.push(...intersections);
      secondCurvePoints[secondIdx]?.push(...intersections);

      allCommonSegments.push(...commonSegments);
      allIntersections.push(...commonSegmentsPoints);
      firstCurvePoints[firstIdx]?.push(...commonSegmentsPoints);
      secondCurvePoints[secondIdx]?.push(...commonSegmentsPoints);
    }
  });

  return {
    allIntersections: removeDuplicatePoints(allIntersections, PRECISION_INTERSECTION),
    allCommonSegments,
    firstCurvePoints,
    secondCurvePoints,
  };
}

/**
 * Split each curve at its intersection points and return the resulting
 * sub-curves.
 */
function splitCurvesAtIntersections(curves: Curve2D[], curvePoints: Point2D[][]): Curve2D[] {
  return zip([curves, curvePoints] as [Curve2D[], Point2D[][]]).flatMap(
    ([curve, intersections]: [Curve2D, Point2D[]]) => {
      if (intersections.length === 0) return [curve];
      return curve.splitAt(intersections, PRECISION_INTERSECTION / 100);
    }
  );
}

// ---------------------------------------------------------------------------
// Common segment matching
// ---------------------------------------------------------------------------

/**
 * Check whether a segment's start/end points match one of the common segment
 * point pairs.
 */
export function isCommonSegmentMatch(
  commonSegmentsPoints: Point2D[][],
  segmentStart: Point2D,
  segmentEnd: Point2D
): boolean {
  return commonSegmentsPoints.some(([startPoint, endPoint]) => {
    if (startPoint === undefined || endPoint === undefined) return false;
    return (
      (samePoint(startPoint, segmentStart) && samePoint(endPoint, segmentEnd)) ||
      (samePoint(startPoint, segmentEnd) && samePoint(endPoint, segmentStart))
    );
  });
}

// ---------------------------------------------------------------------------
// Main entry: blueprintsIntersectionSegments
// ---------------------------------------------------------------------------

/**
 * Given two closed blueprints, find their intersection points, split each
 * blueprint's curves at those points, and pair up the resulting segments.
 *
 * Returns an array of paired segments (one from each blueprint) that share
 * the same start/end intersection points, or `null` if the blueprints do not
 * intersect.
 */
export function blueprintsIntersectionSegments(
  first: Blueprint,
  second: Blueprint
): IntersectionSegment[] | null {
  // Find all intersection points between the two blueprints' curves
  const {
    allIntersections: rawIntersections,
    allCommonSegments,
    firstCurvePoints,
    secondCurvePoints,
  } = findAllIntersections(first, second);

  // Need at least two intersection points for a meaningful intersection
  if (rawIntersections.length <= 1) return null;

  // Split curves at intersection points
  let firstCurveSegments = splitCurvesAtIntersections(first.curves, firstCurvePoints);
  let secondCurveSegments = splitCurvesAtIntersections(second.curves, secondCurvePoints);

  const commonSegmentsPoints = allCommonSegments.map((c) => [c.firstPoint, c.lastPoint]);

  // Remove intersection points that only touch but don't cross
  const filteredByFirst = removeNonCrossingPoints(rawIntersections, firstCurveSegments, second);
  const allIntersections = removeNonCrossingPoints(filteredByFirst, secondCurveSegments, first);

  if (allIntersections.length === 0 && allCommonSegments.length === 0) return null;

  // Align the beginning of both curve arrays to the same starting point
  if (allCommonSegments.length === 0) {
    const startAt = allIntersections[0];
    if (startAt === undefined) return null;
    firstCurveSegments = rotateToStartAt(firstCurveSegments, startAt);
    secondCurveSegments = rotateToStartAt(secondCurveSegments, startAt);
  } else {
    // When there are common segments, always start on the first one
    const startSegment = allCommonSegments[0];
    if (startSegment === undefined) return null;
    firstCurveSegments = rotateToStartAtSegment(firstCurveSegments, startSegment);
    secondCurveSegments = rotateToStartAtSegment(secondCurveSegments, startSegment);
  }

  // Group curves into segments between intersection points
  const firstIntersectedSegments = Array.from(
    createSegmentOnPoints(firstCurveSegments, allIntersections, allCommonSegments)
  );
  let secondIntersectedSegments = Array.from(
    createSegmentOnPoints(secondCurveSegments, allIntersections, allCommonSegments)
  );

  // Ensure the second blueprint's segments are oriented to match the first
  const firstSeg = firstIntersectedSegments[0];
  const secondSeg = secondIntersectedSegments[0];
  if (firstSeg !== undefined && secondSeg !== undefined) {
    const endpointsMismatch = !samePoint(endOfSegment(secondSeg), endOfSegment(firstSeg));
    const commonSegmentLengthMismatch = allCommonSegments.length > 0 && secondSeg.length !== 1;

    if (endpointsMismatch || commonSegmentLengthMismatch) {
      secondIntersectedSegments = reverseSegments(secondIntersectedSegments);
    }
  }

  // Pair up segments and mark common ones.
  // When segment counts differ (e.g. tangent intersections splitting
  // asymmetrically), pad the shorter list to avoid silent truncation.
  const maxLen = Math.max(firstIntersectedSegments.length, secondIntersectedSegments.length);
  const result: IntersectionSegment[] = [];

  for (let i = 0; i < maxLen; i++) {
    const firstSeg2 = firstIntersectedSegments[i];
    const secondSeg2 = secondIntersectedSegments[i];

    if (firstSeg2 === undefined || secondSeg2 === undefined) {
      const available = firstSeg2 ?? secondSeg2;
      if (available === undefined) continue;
      result.push([available, available]);
      continue;
    }

    const currentStart = startOfSegment(firstSeg2);
    const currentEnd = endOfSegment(firstSeg2);

    if (isCommonSegmentMatch(commonSegmentsPoints, currentStart, currentEnd)) {
      result.push([firstSeg2, 'same']);
    } else {
      result.push([firstSeg2, secondSeg2]);
    }
  }

  return result;
}
