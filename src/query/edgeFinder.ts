import type { Plane, PlaneName } from '../core/planeTypes.js';
import type { Vec3, PointInput } from '../core/types.js';
import { resolvePlane } from '../core/planeOps.js';
import { vecNormalize, vecProjectToPlane, vecEquals } from '../core/vecOps.js';

import type { Face, AnyShape, Edge, CurveType } from '../topology/shapes.js';
import type { Direction } from './definitions.js';
import { PLANE_TO_DIR, type StandardPlane } from './definitions.js';
import { Finder3d } from './generic3dfinder.js';

/**
 * Find edges within a shape by chaining declarative filters.
 *
 * Filters are combined with AND logic by default. Use `.either()` for OR
 * and `.not()` for negation (inherited from {@link Finder3d}).
 *
 * @example
 * ```ts
 * const topEdges = new EdgeFinder()
 *   .inDirection("Z")
 *   .ofLength(10)
 *   .find(box);
 * ```
 *
 * @category Finders
 */
export class EdgeFinder extends Finder3d<Edge> {
  /**
   * Filter to find edges that are aligned with a direction.
   *
   * Equivalent to `atAngleWith(direction, 0)`.
   *
   * @param direction - An axis name ("X", "Y", "Z") or arbitrary vector.
   * @category Filter
   */
  inDirection(direction: Direction | PointInput): this {
    return this.atAngleWith(direction, 0);
  }

  /**
   * Filter to find edges of a certain length.
   *
   * @param length - Exact length to match, or a predicate for custom comparison.
   * @category Filter
   */
  ofLength(length: number | ((l: number) => boolean)): this {
    const check = ({ element }: { element: Edge }) => {
      if (typeof length === 'number') return Math.abs(element.length - length) < 1e-9;
      return length(element.length);
    };
    this.filters.push(check);
    return this;
  }

  /**
   * Filter to find edges that are of a certain curve type.
   *
   * @category Filter
   */
  ofCurveType(curveType: CurveType): this {
    const check = ({ element }: { element: Edge }) => {
      return element.geomType === curveType;
    };
    this.filters.push(check);
    return this;
  }

  /**
   * Filter to find edges that are parallel to a plane.
   *
   * @remarks Only meaningful for linear edges. Non-linear edges may
   * produce unexpected results because only the tangent direction is tested.
   *
   * @param plane - A standard plane name ("XY", "XZ", "YZ"), a Plane object, or a Face.
   * @category Filter
   */
  parallelTo(plane: Plane | StandardPlane | Face): this {
    if (typeof plane === 'string') return this.atAngleWith(PLANE_TO_DIR[plane], 90);
    if (typeof plane !== 'string' && 'zDir' in plane) {
      // Functional Plane interface with Vec3 tuples
      return this.atAngleWith(plane.zDir, 90);
    }
    if (typeof plane !== 'string' && 'normalAt' in plane) {
      // Face - normalAt() returns Vec3 tuple
      const normal = plane.normalAt();
      return this.atAngleWith(normal, 90);
    }
    return this;
  }

  /**
   * Filter to find edges that lie within a plane.
   *
   * Checks both that the edge is parallel to the plane and that its
   * start point projects onto the plane.
   *
   * @remarks Only meaningful for linear edges. Non-linear edges may
   * produce unexpected results.
   *
   * @param inputPlane - A plane name or Plane object.
   * @param origin - Plane origin offset (number for standard planes, or a point).
   * @category Filter
   */
  inPlane(inputPlane: PlaneName | Plane, origin?: PointInput | number): this {
    const plane = typeof inputPlane === 'string' ? resolvePlane(inputPlane, origin) : inputPlane;

    this.parallelTo(plane);

    const firstPointInPlane = ({ element }: { element: Edge }) => {
      const startPoint = element.startPoint;
      const projected = vecProjectToPlane(startPoint, plane.origin, plane.zDir);
      const result = vecEquals(startPoint, projected);
      return result;
    };

    this.filters.push(firstPointInPlane);
    return this;
  }

  shouldKeep(element: Edge): boolean {
    let normal: Vec3 | null = null;

    try {
      // tangentAt() returns a Vec3 tuple
      const tangent = element.tangentAt();
      normal = vecNormalize(tangent);
    } catch {
      // Degenerate edges may lack a valid tangent — filters should handle null normal
    }

    const result = this.filters.every((filter) => filter({ normal, element }));

    return result;
  }

  protected applyFilter(shape: AnyShape): Edge[] {
    return shape.edges.filter((edge: Edge) => {
      const shouldKeep = this.shouldKeep(edge);
      return shouldKeep;
    });
  }
}
