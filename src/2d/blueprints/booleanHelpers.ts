import type { Point2D, Curve2D } from '@/2d/lib/index.js';
import { samePoint as defaultSamePoint, PRECISION_INTERSECTION } from '@/2d/lib/index.js';
import { bug } from '@/core/errors.js';

// ---------------------------------------------------------------------------
// Precision-aware point comparison
// ---------------------------------------------------------------------------

export const samePoint = (x: Point2D, y: Point2D): boolean =>
  defaultSamePoint(x, y, PRECISION_INTERSECTION);

// ---------------------------------------------------------------------------
// Hashing utilities for O(1) lookup of points and segments
// ---------------------------------------------------------------------------

/**
 * Hash a point for Set/Map lookup using precision rounding.
 * Must match PRECISION_INTERSECTION (1e-9) to avoid hash collisions for
 * nearly-equal points.
 */
export function hashPoint(p: Point2D): string {
  return `${p[0].toFixed(9)},${p[1].toFixed(9)}`;
}

/**
 * Hash a segment by both orientations for bidirectional lookup.
 * The smaller hash comes first so that (A,B) and (B,A) produce the same key.
 */
export function hashSegment(first: Point2D, last: Point2D): string {
  const h1 = hashPoint(first);
  const h2 = hashPoint(last);
  return h1 < h2 ? `${h1}|${h2}` : `${h2}|${h1}`;
}

// ---------------------------------------------------------------------------
// Segment type and accessors
// ---------------------------------------------------------------------------

export type Segment = Curve2D[];
export type IntersectionSegment = [Segment, Segment | 'same'];

export function startOfSegment(s: Segment): Point2D {
  const first = s[0];
  if (first === undefined) {
    bug('startOfSegment', 'empty segment');
  }
  return first.firstPoint;
}

export function endOfSegment(s: Segment): Point2D {
  const last = s[s.length - 1];
  if (last === undefined) {
    bug('endOfSegment', 'empty segment');
  }
  return last.lastPoint;
}

export function reverseSegment(segment: Segment): Segment {
  return [...segment].reverse().map((curve) => {
    const newCurve = curve.clone();
    newCurve.reverse();
    return newCurve;
  });
}

export function reverseSegments(segments: Segment[]): Segment[] {
  return [...segments].reverse().map(reverseSegment);
}

// ---------------------------------------------------------------------------
// Curve midpoint evaluation
// ---------------------------------------------------------------------------

export function curveMidPoint(curve: Curve2D): Point2D {
  const midParameter = (curve.lastParameter + curve.firstParameter) / 2;
  return curve.value(midParameter);
}

// ---------------------------------------------------------------------------
// Array rotation helpers
// ---------------------------------------------------------------------------

/**
 * Find the index of the first curve in `curves` whose firstPoint matches
 * `point`. Uses hash for a fast first pass, then falls back to tolerance-only
 * comparison to handle floating-point rounding at `toFixed(9)` boundaries.
 * Returns -1 if no match is found.
 */
function findCurveIndexByStartPoint(curves: Curve2D[], point: Point2D): number {
  const targetHash = hashPoint(point);
  // Fast path: hash + tolerance
  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    if (curve === undefined) continue;
    if (hashPoint(curve.firstPoint) === targetHash && samePoint(point, curve.firstPoint)) {
      return i;
    }
  }
  // Fallback: tolerance-only (handles hash mismatches at rounding boundaries)
  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    if (curve === undefined) continue;
    if (samePoint(point, curve.firstPoint)) {
      return i;
    }
  }
  return -1;
}

/**
 * Find the index of the first curve in `curves` that matches the given
 * segment's start and end points. Uses hash for a fast first pass, then
 * falls back to tolerance-only comparison.
 * Returns -1 if no match is found.
 */
function findCurveIndexBySegment(
  curves: Curve2D[],
  segFirstHash: string,
  segLastHash: string,
  matchesFn: (curve: Curve2D) => boolean
): number {
  // Fast path: hash + tolerance
  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    if (curve === undefined) continue;
    if (
      hashPoint(curve.firstPoint) === segFirstHash &&
      hashPoint(curve.lastPoint) === segLastHash &&
      matchesFn(curve)
    ) {
      return i;
    }
  }
  // Fallback: tolerance-only (handles hash mismatches at rounding boundaries)
  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    if (curve === undefined) continue;
    if (matchesFn(curve)) {
      return i;
    }
  }
  return -1;
}

/** Rotate an array so that element at `startIndex` becomes the first element. */
function rotateArray<T>(arr: T[], startIndex: number): T[] {
  if (startIndex <= 0) return arr;
  return arr.slice(startIndex).concat(arr.slice(0, startIndex));
}

/**
 * Rotate the curves array so that it starts at the curve whose firstPoint
 * matches the given point.
 */
export function rotateToStartAt(curves: Curve2D[], point: Point2D): Curve2D[] {
  const startIndex = findCurveIndexByStartPoint(curves, point);
  return rotateArray(curves, startIndex);
}

/**
 * Rotate the curves array so that it starts at the curve matching the given
 * segment. Tries both segment orientations (forward and flipped) against both
 * curve orientations (original and reversed chain) to handle cases where
 * `intersectCurves` returns a common segment oriented opposite to the
 * matching curve in the split result.
 */
export function rotateToStartAtSegment(curves: Curve2D[], segment: Curve2D): Curve2D[] {
  const segFirstHash = hashPoint(segment.firstPoint);
  const segLastHash = hashPoint(segment.lastPoint);

  // matchesForward: curve runs in the same direction as segment (first→last)
  const matchesForward = (curve: Curve2D): boolean =>
    samePoint(segment.firstPoint, curve.firstPoint) &&
    samePoint(segment.lastPoint, curve.lastPoint);

  // matchesFlipped: curve runs opposite to segment (last→first)
  const matchesFlipped = (curve: Curve2D): boolean =>
    samePoint(segment.lastPoint, curve.firstPoint) &&
    samePoint(segment.firstPoint, curve.lastPoint);

  // Attempt to locate the segment in `chain` and return a rotated result.
  // Returns null when the segment is not found in the chain.
  function tryRotate(
    chain: Curve2D[],
    firstHash: string,
    lastHash: string,
    matchFn: (curve: Curve2D) => boolean
  ): Curve2D[] | null {
    const idx = findCurveIndexBySegment(chain, firstHash, lastHash, matchFn);
    return idx !== -1 ? rotateArray(chain, idx) : null;
  }

  // Try forward segment on forward curves
  const fwdFwd = tryRotate(curves, segFirstHash, segLastHash, matchesForward);
  if (fwdFwd !== null) return fwdFwd;

  // Try flipped segment on forward curves (common segment oriented opposite).
  // Expected to trigger only for secondCurveSegments — allCommonSegments[0]
  // is oriented with the first blueprint's curve direction, so firstCurveSegments
  // should always match via fwdFwd. The downstream reversal in
  // blueprintsIntersectionSegments always flips secondIntersectedSegments.
  const flipFwd = tryRotate(curves, segLastHash, segFirstHash, matchesFlipped);
  if (flipFwd !== null) return flipFwd;

  // Reverse the chain once; try both segment orientations against it
  const reversed = reverseSegment(curves);

  const fwdRev = tryRotate(reversed, segFirstHash, segLastHash, matchesForward);
  if (fwdRev !== null) return fwdRev;

  const flipRev = tryRotate(reversed, segLastHash, segFirstHash, matchesFlipped);
  if (flipRev !== null) return flipRev;

  bug('rotateToStartAtSegment', 'failed to rotate to segment start');
}
