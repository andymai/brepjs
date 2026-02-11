/**
 * Corner finder — 2D blueprint corner filtering.
 *
 * Unlike the shape finders, corners are not OCCT topology objects.
 * They live in the 2D world and operate on `BlueprintLike` profiles.
 */

import type { Point2D } from '../2d/lib/definitions.js';
import type { Curve2D } from '../2d/lib/Curve2D.js';
import { angle2d, distance2d, samePoint } from '../2d/lib/vectorOperations.js';
import { DEG2RAD } from '../core/constants.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Predicate<T> = (element: T) => boolean;

const PI_2 = 2 * Math.PI;

function positiveHalfAngle(angle: number): number {
  const limitedAngle = angle % PI_2;
  const coterminalAngle = limitedAngle < 0 ? limitedAngle + PI_2 : limitedAngle;
  if (coterminalAngle < Math.PI) return coterminalAngle;
  if (coterminalAngle === Math.PI) return 0;
  return Math.abs(coterminalAngle - PI_2);
}

/**
 * Minimal Blueprint interface for corner extraction.
 *
 * The full Blueprint class lives in the sketching layer; this interface
 * keeps the query layer decoupled from it so that corner finding does
 * not pull in Layer 3 dependencies.
 */
export interface BlueprintLike {
  /** Ordered sequence of curves forming the profile. */
  curves: Curve2D[];
}

/** A junction between two consecutive curves in a 2D profile. */
export type Corner = {
  /** The curve arriving at the corner point. */
  firstCurve: Curve2D;
  /** The curve departing from the corner point. */
  secondCurve: Curve2D;
  /** The shared endpoint where the two curves meet. */
  point: Point2D;
};

export interface CornerFilter {
  readonly shouldKeep: (corner: Corner) => boolean;
}

export interface CornerFinderFn extends CornerFilter {
  /** Add a custom predicate filter. Returns new finder. */
  readonly when: (predicate: (corner: Corner) => boolean) => CornerFinderFn;
  /** Filter to corners whose point matches one from the list. */
  readonly inList: (points: Point2D[]) => CornerFinderFn;
  /** Filter to corners at a specific distance from a point. */
  readonly atDistance: (distance: number, point?: Point2D) => CornerFinderFn;
  /** Filter to corners at an exact point. */
  readonly atPoint: (point: Point2D) => CornerFinderFn;
  /** Filter to corners within an axis-aligned bounding box. */
  readonly inBox: (corner1: Point2D, corner2: Point2D) => CornerFinderFn;
  /** Filter to corners with a specific interior angle (in degrees). */
  readonly ofAngle: (angle: number) => CornerFinderFn;
  /** Invert a filter. Returns new finder. */
  readonly not: (fn: (f: CornerFinderFn) => CornerFinderFn) => CornerFinderFn;
  /** Combine filters with OR. Returns new finder. */
  readonly either: (fns: ((f: CornerFinderFn) => CornerFinderFn)[]) => CornerFinderFn;
  /** Find matching corners from a blueprint. */
  readonly find: (blueprint: BlueprintLike) => Corner[];
}

// ---------------------------------------------------------------------------
// Corner extraction helper
// ---------------------------------------------------------------------------

function blueprintCorners(blueprint: BlueprintLike): Corner[] {
  return blueprint.curves.map((curve, index) => ({
    firstCurve: curve,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    secondCurve: blueprint.curves[(index + 1) % blueprint.curves.length]!,
    point: curve.lastPoint,
  }));
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function buildCornerFinder(filters: ReadonlyArray<Predicate<Corner>>): CornerFinderFn {
  const withFilter = (pred: Predicate<Corner>): CornerFinderFn =>
    buildCornerFinder([...filters, pred]);

  const shouldKeep = (corner: Corner): boolean => filters.every((f) => f(corner));

  return {
    shouldKeep,

    when: (pred) => withFilter(pred),

    inList: (points) => withFilter((corner) => points.some((p) => samePoint(p, corner.point))),

    atDistance: (distance, point: Point2D = [0, 0]) =>
      withFilter((corner) => Math.abs(distance2d(point, corner.point) - distance) < 1e-9),

    atPoint: (point) => withFilter((corner) => samePoint(point, corner.point)),

    inBox: (corner1, corner2) => {
      const minX = Math.min(corner1[0], corner2[0]);
      const maxX = Math.max(corner1[0], corner2[0]);
      const minY = Math.min(corner1[1], corner2[1]);
      const maxY = Math.max(corner1[1], corner2[1]);
      return withFilter((corner) => {
        const [x, y] = corner.point;
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
      });
    },

    ofAngle: (angle) =>
      withFilter((corner) => {
        const tgt1 = corner.firstCurve.tangentAt(1);
        const tgt2 = corner.secondCurve.tangentAt(0);
        return (
          Math.abs(positiveHalfAngle(angle2d(tgt1, tgt2)) - positiveHalfAngle(DEG2RAD * angle)) <
          1e-9
        );
      }),

    not: (fn) => {
      const inner = fn(buildCornerFinder([]));
      return withFilter((corner) => !inner.shouldKeep(corner));
    },

    either: (fns) => {
      const builtFinders = fns.map((fn) => fn(buildCornerFinder([])));
      return withFilter((corner) => builtFinders.some((f) => f.shouldKeep(corner)));
    },

    find: (blueprint) => blueprintCorners(blueprint).filter(shouldKeep),
  };
}

/** Create an immutable corner finder for 2D blueprint corners. */
export function cornerFinder(): CornerFinderFn {
  return buildCornerFinder([]);
}
