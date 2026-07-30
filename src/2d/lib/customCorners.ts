import { Curve2D } from './curve2D.js';
import type { Point2D } from './definitions.js';
import { isPoint2D } from './definitions.js';
import { intersectCurves } from './intersections.js';
import { unwrap, isOk } from '@/core/result.js';
import {
  make2dArcFromCenter,
  make2dCircle,
  make2dSegmentCurve,
  make2dThreePointArc,
} from './makeCurves.js';
import { make2dOffset } from './offset.js';
import { add2d, crossProduct2d, normalize2d, scalarMultiply2d } from './vectorOperations.js';

/** Unwrap an intersection, discarding the common-segment curves the caller does not use. */
function intersectionPoints(first: Curve2D, second: Curve2D): Point2D[] {
  const result = unwrap(intersectCurves(first, second));
  result.commonSegments.forEach((c) => {
    c.delete();
  });
  return result.intersections;
}

/**
 * Delete the split pieces the caller is discarding. `splitAt` returns the curve
 * itself when there is nothing to split, so the source is never deleted here.
 */
function disposeSplitPieces(pieces: Curve2D[], source: Curve2D, kept?: Curve2D): void {
  pieces.forEach((piece) => {
    if (piece !== source && piece !== kept) piece.delete();
  });
}

/**
 * Run `split` and, if it throws, dispose the pieces an earlier split already
 * produced. Splitting the second curve of a corner can fail (its parameter may
 * not project onto the offset), stranding the first curve's pieces.
 */
function splitOrDiscard(
  split: () => Curve2D[],
  earlier: { pieces: Curve2D[]; source: Curve2D }
): Curve2D[] {
  try {
    return split();
  } catch (e) {
    disposeSplitPieces(earlier.pieces, earlier.source);
    throw e;
  }
}

/**
 * Build the corner result, disposing the trimmed halves if the connecting curve
 * cannot be built. They are unreachable once the error propagates.
 */
function discardTrimsOnError(
  firstCurve: Curve2D,
  secondCurve: Curve2D,
  first: Curve2D,
  second: Curve2D,
  build: () => Curve2D[]
): Curve2D[] {
  try {
    return build();
  } catch (e) {
    if (first !== firstCurve) first.delete();
    if (second !== secondCurve) second.delete();
    throw e;
  }
}

function removeCorner(firstCurve: Curve2D, secondCurve: Curve2D, radius: number) {
  const sinAngle = crossProduct2d(firstCurve.tangentAt(1), secondCurve.tangentAt(0));

  // This cover the case when the curves are colinear
  if (Math.abs(sinAngle) < 1e-10) return null;

  const orientationCorrection = sinAngle > 0 ? -1 : 1;
  const offset = Math.abs(radius) * orientationCorrection;

  let firstOffset: ReturnType<typeof make2dOffset> | null = null;
  let secondOffset: ReturnType<typeof make2dOffset> | null = null;

  try {
    firstOffset = make2dOffset(firstCurve, offset);
    secondOffset = make2dOffset(secondCurve, offset);

    if (!(firstOffset instanceof Curve2D) || !(secondOffset instanceof Curve2D)) {
      return null;
    }
    const firstOffsetCurve: Curve2D = firstOffset;
    const secondOffsetCurve: Curve2D = secondOffset;

    const intersectionResult = intersectCurves(firstOffsetCurve, secondOffsetCurve, 1e-9);
    if (!isOk(intersectionResult)) {
      return null;
    }
    intersectionResult.value.commonSegments.forEach((c) => {
      c.delete();
    });

    const potentialCenter = intersectionResult.value.intersections.at(-1);
    if (!isPoint2D(potentialCenter)) {
      return null;
    }
    const center = potentialCenter;

    const splitForFillet = (curve: Curve2D, offsetCurve: Curve2D) => {
      const [x, y] = offsetCurve.tangentAt(center);
      const normal = normalize2d([-y, x]);
      const splitPoint = add2d(center, scalarMultiply2d(normal, offset));
      const splitParam = unwrap(curve.parameter(splitPoint, 1e-6));
      return curve.splitAt([splitParam]);
    };

    const firstSplit = splitForFillet(firstCurve, firstOffsetCurve);
    const secondSplit = splitOrDiscard(() => splitForFillet(secondCurve, secondOffsetCurve), {
      pieces: firstSplit,
      source: firstCurve,
    });
    const first = firstSplit[0];
    const second = secondSplit[1];

    // A radius that consumes a whole segment splits it at its own endpoint, so
    // splitAt hands back the curve itself and there is no trimmed half to keep.
    if (!first || !second) {
      disposeSplitPieces(firstSplit, firstCurve);
      disposeSplitPieces(secondSplit, secondCurve);
      return null;
    }

    disposeSplitPieces(firstSplit, firstCurve, first);
    disposeSplitPieces(secondSplit, secondCurve, second);
    return { first, second, center };
  } finally {
    if (firstOffset instanceof Curve2D) firstOffset.delete();
    if (secondOffset instanceof Curve2D) secondOffset.delete();
  }
}

/**
 * Insert a circular fillet arc at the corner between two curves.
 *
 * Trims both curves and inserts a tangent arc of the given radius.
 * Returns the original curves unmodified when they are collinear.
 *
 * @example
 * ```ts
 * const segments = filletCurves(line1, line2, 5);
 * // [trimmedLine1, filletArc, trimmedLine2]
 * ```
 */
export function filletCurves(firstCurve: Curve2D, secondCurve: Curve2D, radius: number) {
  const cornerRemoved = removeCorner(firstCurve, secondCurve, radius);
  if (!cornerRemoved) {
    return [firstCurve, secondCurve];
  }

  const { first, second, center } = cornerRemoved;

  return discardTrimsOnError(firstCurve, secondCurve, first, second, () => [
    first,
    make2dArcFromCenter(first.lastPoint, second.firstPoint, center),
    second,
  ]);
}

/**
 * Insert a straight chamfer segment at the corner between two curves.
 *
 * Trims both curves and connects them with a line segment.
 * Returns the original curves unmodified when they are collinear.
 */
export function chamferCurves(firstCurve: Curve2D, secondCurve: Curve2D, radius: number) {
  const cornerRemoved = removeCorner(firstCurve, secondCurve, radius);
  if (!cornerRemoved) {
    return [firstCurve, secondCurve];
  }

  const { first, second } = cornerRemoved;

  return discardTrimsOnError(firstCurve, secondCurve, first, second, () => [
    first,
    make2dSegmentCurve(first.lastPoint, second.firstPoint),
    second,
  ]);
}

/**
 * Insert a dogbone fillet at an inner corner for CNC milling clearance.
 *
 * Creates a circular arc that extends past the original corner so that a
 * round end-mill of the given radius can fully reach the corner.
 */
export function dogboneFilletCurves(firstCurve: Curve2D, secondCurve: Curve2D, radius: number) {
  const tgt1 = normalize2d(firstCurve.tangentAt(1));
  const tgt2 = normalize2d(secondCurve.tangentAt(0));

  const sinAngle = crossProduct2d(tgt1, tgt2);
  const a = Math.asin(sinAngle);
  // This cover the case when the curves are colinear
  if (Math.abs(sinAngle) < 1e-10) return [firstCurve, secondCurve];
  const orientationCorrection = sinAngle > 0 ? -1 : 1;

  const offset = Math.abs(radius) * Math.sin(a / 2) * orientationCorrection;

  let firstOffset: ReturnType<typeof make2dOffset> | null = null;
  let secondOffset: ReturnType<typeof make2dOffset> | null = null;
  let circle: Curve2D | null = null;

  try {
    firstOffset = make2dOffset(firstCurve, offset);
    secondOffset = make2dOffset(secondCurve, offset);

    if (!(firstOffset instanceof Curve2D) || !(secondOffset instanceof Curve2D)) {
      return [firstCurve, secondCurve];
    }

    const intersectionResult2 = intersectCurves(firstOffset, secondOffset, 1e-9);
    if (!isOk(intersectionResult2)) {
      return [firstCurve, secondCurve];
    }
    intersectionResult2.value.commonSegments.forEach((c) => {
      c.delete();
    });
    const potentialCenter = intersectionResult2.value.intersections.at(-1);
    if (!isPoint2D(potentialCenter)) {
      return [firstCurve, secondCurve];
    }

    circle = make2dCircle(radius, potentialCenter);
    const firstInt = intersectionPoints(firstCurve, circle)[0];
    const secondInt = intersectionPoints(secondCurve, circle).at(-1);

    if (!firstInt || !secondInt) return [firstCurve, secondCurve];

    const firstSplit = firstCurve.splitAt([firstInt]);
    const secondSplit = splitOrDiscard(() => secondCurve.splitAt([secondInt]), {
      pieces: firstSplit,
      source: firstCurve,
    });
    const firstPart = firstSplit[0];
    const secondPart = secondSplit[secondSplit.length - 1];

    if (!firstPart || !secondPart) {
      disposeSplitPieces(firstSplit, firstCurve);
      disposeSplitPieces(secondSplit, secondCurve);
      return [firstCurve, secondCurve];
    }

    disposeSplitPieces(firstSplit, firstCurve, firstPart);
    disposeSplitPieces(secondSplit, secondCurve, secondPart);

    try {
      return [
        firstPart,
        make2dThreePointArc(firstPart.lastPoint, firstCurve.lastPoint, secondPart.firstPoint),
        secondPart,
      ];
    } catch {
      if (firstPart !== firstCurve) firstPart.delete();
      if (secondPart !== secondCurve) secondPart.delete();
      return [firstCurve, secondCurve];
    }
  } finally {
    if (firstOffset instanceof Curve2D) firstOffset.delete();
    if (secondOffset instanceof Curve2D) secondOffset.delete();
    circle?.delete();
  }
}
