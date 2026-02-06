import { DEG2RAD } from '../core/constants.js';
import { angle2d, distance2d, samePoint } from '../2d/lib/vectorOperations.js';
import type { Point2D } from '../2d/lib/definitions.js';
import type { Curve2D } from '../2d/lib/Curve2D.js';
import { Finder } from './definitions.js';

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

const blueprintCorners = function (blueprint: BlueprintLike): Corner[] {
  return blueprint.curves.map((curve, index) => {
    return {
      firstCurve: curve,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      secondCurve: blueprint.curves[(index + 1) % blueprint.curves.length]!,
      point: curve.lastPoint,
    };
  });
};

const PI_2 = 2 * Math.PI;
const positiveHalfAngle = (angle: number) => {
  const limitedAngle = angle % PI_2;

  const coterminalAngle = limitedAngle < 0 ? limitedAngle + PI_2 : limitedAngle;
  if (coterminalAngle < Math.PI) return coterminalAngle;
  if (coterminalAngle === Math.PI) return 0;
  return Math.abs(coterminalAngle - PI_2);
};

/**
 * Find corners within a 2D blueprint by chaining declarative filters.
 *
 * A corner is the junction between two consecutive curves.
 * Filters are combined with AND logic by default.
 *
 * @example
 * ```ts
 * const rightAngles = new CornerFinder()
 *   .ofAngle(90)
 *   .find(blueprint);
 * ```
 *
 * @category Finders
 */
export class CornerFinder extends Finder<Corner, BlueprintLike> {
  /**
   * Filter to find corners whose point matches one from the list.
   *
   * @param elementList - Points to match against using geometric equality.
   * @category Filter
   */
  inList(elementList: Point2D[]): this {
    const elementInList = ({ element }: { element: Corner }) => {
      return !!elementList.find((e) => samePoint(e, element.point));
    };
    this.filters.push(elementInList);
    return this;
  }

  /**
   * Filter to find corners at a specified distance from a point.
   *
   * @param distance - Target distance from the reference point.
   * @param point - Reference point. Default: origin [0, 0].
   * @category Filter
   */
  atDistance(distance: number, point: Point2D = [0, 0]): this {
    function elementAtDistance({ element }: { element: Corner }) {
      return Math.abs(distance2d(point, element.point) - distance) < 1e-9;
    }
    this.filters.push(elementAtDistance);
    return this;
  }

  /**
   * Filter to find corners located at an exact point.
   *
   * @param point - The 2D point to match.
   * @category Filter
   */
  atPoint(point: Point2D): this {
    function elementAtPoint({ element }: { element: Corner }) {
      return samePoint(point, element.point);
    }
    this.filters.push(elementAtPoint);
    return this;
  }

  /**
   * Filter to find corners within an axis-aligned bounding box.
   *
   * @param corner1 - First corner of the bounding box.
   * @param corner2 - Opposite corner of the bounding box.
   * @category Filter
   */
  inBox(corner1: Point2D, corner2: Point2D): this {
    const [x1, y1] = corner1;
    const [x2, y2] = corner2;

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);

    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    function elementInBox({ element }: { element: Corner }) {
      const [x, y] = element.point;
      return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }
    this.filters.push(elementInBox);
    return this;
  }

  /**
   * Filter to find corners with a specific interior angle (in degrees).
   *
   * The angle is measured between the tangent vectors of the two curves
   * at the corner point and is folded to the range 0--180.
   *
   * @param angle - Target angle in degrees (0--180).
   * @category Filter
   */
  ofAngle(angle: number): this {
    function elementOfAngle({ element }: { element: Corner }) {
      const tgt1 = element.firstCurve.tangentAt(1);
      const tgt2 = element.secondCurve.tangentAt(0);

      return (
        Math.abs(positiveHalfAngle(angle2d(tgt1, tgt2)) - positiveHalfAngle(DEG2RAD * angle)) < 1e-9
      );
    }

    this.filters.push(elementOfAngle);
    return this;
  }

  shouldKeep(element: Corner): boolean {
    const shouldKeep = this.filters.every((filter) => filter({ normal: null, element }));
    return shouldKeep;
  }

  protected applyFilter(blueprint: BlueprintLike): Corner[] {
    return blueprintCorners(blueprint).filter((corner: Corner) => {
      const shouldKeep = this.shouldKeep(corner);
      return shouldKeep;
    });
  }
}
