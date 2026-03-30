import zip from '@/utils/zip.js';
import type { Curve2D } from '@/2d/lib/index.js';
import { make2dSegmentCurve, crossProduct2d, subtract2d } from '@/2d/lib/index.js';

import Blueprint from './blueprint.js';
import type Blueprints from './blueprints.js';
import { organiseBlueprints } from './lib.js';
import { samePoint, curveMidPoint, reverseSegment } from './booleanHelpers.js';
import type { Segment } from './booleanHelpers.js';
import { blueprintsIntersectionSegments } from './intersectionSegments.js';

// ---------------------------------------------------------------------------
// Collinear segment merging
// ---------------------------------------------------------------------------

/**
 * Merge adjacent collinear line segments into single segments.
 *
 * Boolean operations can split a line at intersection points that lie on the
 * line itself (e.g. when a cut rectangle's edge is collinear with the
 * profile's edge). The extra split creates a C0 discontinuity in swept
 * surfaces. Merging eliminates unnecessary vertices.
 */
function mergeCollinearSegments(curves: Curve2D[]): Curve2D[] {
  if (curves.length < 2) return curves;
  const result: Curve2D[] = [];
  let i = 0;

  while (i < curves.length) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounded by length check
    const current = curves[i]!;

    if (current.geomType !== 'LINE') {
      result.push(current);
      i++;
      continue;
    }

    // Accumulate consecutive collinear lines
    let endPoint = current.lastPoint;
    let j = i + 1;

    while (j < curves.length) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounded by length check
      const next = curves[j]!;
      if (next.geomType !== 'LINE') break;
      if (!samePoint(endPoint, next.firstPoint)) break;

      const dir1 = subtract2d(endPoint, current.firstPoint);
      const dir2 = subtract2d(next.lastPoint, next.firstPoint);
      if (Math.abs(crossProduct2d(dir1, dir2)) > 1e-9) break;

      endPoint = next.lastPoint;
      j++;
    }

    if (j > i + 1) {
      result.push(make2dSegmentCurve(current.firstPoint, endPoint));
    } else {
      result.push(current);
    }
    i = j;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Path splitting: detect discontinuities and split into separate loops
// ---------------------------------------------------------------------------

/**
 * Split an array of curves into separate continuous paths. A discontinuity
 * occurs where one curve's lastPoint does not match the next curve's
 * firstPoint.
 */
export function splitPaths(curves: Curve2D[]): Curve2D[][] {
  const startPoints = curves.map((c) => c.firstPoint);
  const shiftedEndPoints = curves.map((c) => c.lastPoint);
  // Rotate endPoints so endPoints[i] is the lastPoint of the previous curve
  const endPoints = shiftedEndPoints.slice(-1).concat(shiftedEndPoints.slice(0, -1));

  const discontinuities = zip([startPoints, endPoints])
    .map(([startPoint, endPoint], index): number | null => {
      if (startPoint === undefined || endPoint === undefined) return null;
      return samePoint(startPoint, endPoint) ? null : index;
    })
    .filter((f): f is number => f !== null);

  if (discontinuities.length === 0) return [curves];

  // Build paths between consecutive discontinuities
  const paths = zip([discontinuities.slice(0, -1), discontinuities.slice(1)]).map(([start, end]) =>
    curves.slice(start, end)
  );

  // Handle the wrap-around path (from last discontinuity back to first)
  let lastPath = curves.slice(discontinuities[discontinuities.length - 1]);
  const firstDiscontinuity = discontinuities[0];
  if (firstDiscontinuity !== undefined && firstDiscontinuity !== 0) {
    lastPath = lastPath.concat(curves.slice(0, firstDiscontinuity));
  }
  paths.push(lastPath);

  return paths;
}

// ---------------------------------------------------------------------------
// Boolean operation result types
// ---------------------------------------------------------------------------

interface NoIntersectionResult {
  readonly identical: false;
  readonly firstCurveInSecond: boolean;
  readonly secondCurveInFirst: boolean;
}

interface IdenticalResult {
  readonly identical: true;
}

export type BooleanOperationResult =
  | Blueprint
  | Blueprints
  | null
  | IdenticalResult
  | NoIntersectionResult;

// ---------------------------------------------------------------------------
// Boolean operation core
// ---------------------------------------------------------------------------

interface BooleanOperationConfig {
  readonly firstInside: 'keep' | 'remove';
  readonly secondInside: 'keep' | 'remove';
}

/**
 * Handle the case where two segments overlap ("same"). The decision depends
 * on how many segments are entering the current intersection node.
 */
function handleSameSegment(
  firstSegment: Segment,
  segmentsIn: number | null,
  lastWasSame: Segment | null
): {
  curves: Segment;
  segmentsIn: number | null;
  lastWasSame: Segment | null;
} {
  if (segmentsIn === 1) {
    return { curves: [...firstSegment], segmentsIn: 1, lastWasSame: null };
  }

  if (segmentsIn === 2 || segmentsIn === 0) {
    return { curves: [], segmentsIn: null, lastWasSame: null };
  }

  // segmentsIn === null: accumulate same-segments until we can resolve
  if (segmentsIn === null) {
    const accumulated = lastWasSame ? [...lastWasSame, ...firstSegment] : firstSegment;
    return { curves: [], segmentsIn: null, lastWasSame: accumulated };
  }

  // Should not reach here
  return { curves: [], segmentsIn, lastWasSame };
}

/**
 * Determine which non-overlapping segments to keep based on
 * inside/outside status relative to the other blueprint.
 */
function selectSegments(
  firstSegment: Segment,
  secondSegment: Segment,
  first: Blueprint,
  second: Blueprint,
  config: BooleanOperationConfig,
  segmentsIn: number | null,
  lastWasSame: Segment | null
): {
  curves: Segment;
  segmentsIn: number | null;
  lastWasSame: Segment | null;
} {
  let segments: Segment = [];
  let segmentsOut = 0;

  // Check first segment
  const firstCurve = firstSegment[0];
  if (firstCurve !== undefined) {
    const firstSegmentPoint = curveMidPoint(firstCurve);
    const firstInSecond = second.isInside(firstSegmentPoint);
    if (
      (config.firstInside === 'keep' && firstInSecond) ||
      (config.firstInside === 'remove' && !firstInSecond)
    ) {
      segmentsOut += 1;
      segments.push(...firstSegment);
    }
  }

  // Check second segment
  const secondCurve = secondSegment[0];
  if (secondCurve !== undefined) {
    const secondSegmentPoint = curveMidPoint(secondCurve);
    const secondInFirst = first.isInside(secondSegmentPoint);
    if (
      (config.secondInside === 'keep' && secondInFirst) ||
      (config.secondInside === 'remove' && !secondInFirst)
    ) {
      let segmentsToAdd = secondSegment;
      // When there are only two segments we cannot know if we are in the
      // same direction until here, so it is possible they are mismatched.
      if (segmentsOut === 1) {
        segmentsToAdd = reverseSegment(secondSegment);
      }
      segmentsOut += 1;
      segments.push(...segmentsToAdd);
    }
  }

  // When the previous node had unknown segment info and only one segment
  // was selected, prepend the accumulated same-segments
  if (segmentsIn === null && segmentsOut === 1 && lastWasSame !== null) {
    segments = [...lastWasSame, ...segments];
  }

  const newSegmentsIn = segmentsOut === 1 ? segmentsOut : segmentsIn;
  const newLastWasSame = segmentsOut === 1 ? null : lastWasSame;

  return { curves: segments, segmentsIn: newSegmentsIn, lastWasSame: newLastWasSame };
}

/**
 * Core boolean operation between two simple (non-compound) blueprints.
 *
 * Segments both blueprints at their intersection points, then selects which
 * segments to keep based on the `firstInside`/`secondInside` configuration.
 */
export function booleanOperation(
  first: Blueprint,
  second: Blueprint,
  config: BooleanOperationConfig
): BooleanOperationResult {
  const segments = blueprintsIntersectionSegments(first, second);

  // No intersections: determine containment relationship
  if (segments === null) {
    return buildNoIntersectionResult(first, second);
  }

  // If all segments are identical, the blueprints are the same shape
  if (segments.every(([, secondSegment]) => secondSegment === 'same')) {
    return { identical: true };
  }

  // Assemble output curves by iterating through paired segments
  let segmentsIn: number | null = null;
  let lastWasSame: Segment | null = null;

  let assembledCurves: Curve2D[] = segments.flatMap(([firstSegment, secondSegment]) => {
    if (secondSegment === 'same') {
      const result = handleSameSegment(firstSegment, segmentsIn, lastWasSame);
      segmentsIn = result.segmentsIn;
      lastWasSame = result.lastWasSame;
      return result.curves;
    }

    const result = selectSegments(
      firstSegment,
      secondSegment,
      first,
      second,
      config,
      segmentsIn,
      lastWasSame
    );
    segmentsIn = result.segmentsIn;
    lastWasSame = result.lastWasSame;
    return result.curves;
  });

  // Resolve any trailing same-segments that were accumulated but never flushed.
  // handleSameSegment accumulates into lastWasSame only when segmentsIn is null,
  // and clears it when segmentsIn is 1. The combined state (lastWasSame != null
  // AND segmentsIn == 1) occurs when: trailing 'same' segments accumulate at the
  // end of the sequence, then a non-same segment resolves segmentsIn to 1 but
  // the loop ends before the accumulated curves can be prepended by selectSegments.
  // Note: segmentsIn and lastWasSame are mutated inside the flatMap callback;
  // TypeScript narrows them to their initial values, so we cast to the actual type.
  const finalLastWasSame = lastWasSame as Segment | null;
  const finalSegmentsIn = segmentsIn as number | null;
  if (finalLastWasSame !== null && finalSegmentsIn === 1) {
    assembledCurves = [...finalLastWasSame, ...assembledCurves];
  }

  // Merge collinear lines created by splits at intersection points, then
  // split into separate paths and build blueprints.
  const paths = splitPaths(mergeCollinearSegments(assembledCurves))
    .filter((b) => b.length > 0)
    .map((b) => new Blueprint(b));

  if (paths.length === 0) return null;
  if (paths.length === 1) {
    const single = paths[0];
    if (single === undefined) return null;
    return single;
  }

  return organiseBlueprints(paths);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildNoIntersectionResult(first: Blueprint, second: Blueprint): NoIntersectionResult {
  const firstCurve = first.curves[0];
  const secondCurve = second.curves[0];

  const firstCurveInSecond = firstCurve !== undefined && second.isInside(curveMidPoint(firstCurve));
  const secondCurveInFirst =
    secondCurve !== undefined && first.isInside(curveMidPoint(secondCurve));

  return {
    identical: false,
    firstCurveInSecond,
    secondCurveInFirst,
  };
}
