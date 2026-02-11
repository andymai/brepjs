import type { Point2D, Curve2D } from '../lib/index.js';
import { samePoint as defaultSamePoint, PRECISION_INTERSECTION } from '../lib/index.js';
import { bug } from '../../core/errors.js';

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
 * `point` (using hash + samePoint for fast comparison).
 * Returns -1 if no match is found.
 */
function findCurveIndexByStartPoint(curves: Curve2D[], point: Point2D): number {
  const targetHash = hashPoint(point);
  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    if (curve === undefined) continue;
    if (hashPoint(curve.firstPoint) === targetHash && samePoint(point, curve.firstPoint)) {
      return i;
    }
  }
  return -1;
}

/**
 * Find the index of the first curve in `curves` that matches the given
 * segment's start and end points (using hash + samePoint).
 * Returns -1 if no match is found.
 */
function findCurveIndexBySegment(
  curves: Curve2D[],
  segFirstHash: string,
  segLastHash: string,
  matchesFn: (curve: Curve2D) => boolean
): number {
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
 * segment. If the segment is oriented the other way, the curves are reversed
 * first.
 */
export function rotateToStartAtSegment(curves: Curve2D[], segment: Curve2D): Curve2D[] {
  const segFirstHash = hashPoint(segment.firstPoint);
  const segLastHash = hashPoint(segment.lastPoint);

  const onSegment = (curve: Curve2D): boolean =>
    samePoint(segment.firstPoint, curve.firstPoint) &&
    samePoint(segment.lastPoint, curve.lastPoint);

  // Try forward orientation
  let startIndex = findCurveIndexBySegment(curves, segFirstHash, segLastHash, onSegment);

  if (startIndex !== -1) {
    return rotateArray(curves, startIndex);
  }

  // Try reversed orientation
  const reversed = reverseSegment(curves);
  startIndex = findCurveIndexBySegment(reversed, segFirstHash, segLastHash, onSegment);

  if (startIndex === -1) {
    bug('rotateToStartAtSegment', 'failed to rotate to segment start');
  }

  return rotateArray(reversed, startIndex);
}
