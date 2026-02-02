/**
 * EdgeFinder — filter and select edges within a shape.
 * Ported from replicad's finders/edgeFinder.ts.
 */

import type { Point, Plane, PlaneName, Vector } from '../core/geometry.js';
import { makePlane } from '../core/geometryHelpers.js';
import type { Face, AnyShape, Edge, CurveType } from '../topology/shapes.js';
import type { Direction } from './definitions.js';
import { PLANE_TO_DIR, type StandardPlane } from './definitions.js';
import { Finder3d } from './generic3dfinder.js';
import { Plane as PlaneClass } from '../core/geometry.js';

/**
 * With an EdgeFinder you can apply a set of filters to find specific edges
 * within a shape.
 *
 * @category Finders
 */
export class EdgeFinder extends Finder3d<Edge> {
  /**
   * Filter to find edges that are in a certain direction
   *
   * @category Filter
   */
  inDirection(direction: Direction | Point): this {
    return this.atAngleWith(direction, 0);
  }

  /**
   * Filter to find edges of a certain length
   *
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
   * Note that this will work only in lines (but the method does not
   * check this assumption).
   *
   * @category Filter
   */
  parallelTo(plane: Plane | StandardPlane | Face): this {
    if (typeof plane === 'string' && PLANE_TO_DIR[plane])
      return this.atAngleWith(PLANE_TO_DIR[plane], 90);
    if (typeof plane !== 'string' && plane instanceof PlaneClass)
      return this.atAngleWith(plane.zDir, 90);
    if (typeof plane !== 'string' && 'normalAt' in plane) {
      const normal = plane.normalAt();
      this.atAngleWith(normal, 90);
      return this;
    }
    return this;
  }

  /**
   * Filter to find edges that within a plane.
   *
   * Note that this will work only in lines (but the method does not
   * check this assumption).
   *
   * @category Filter
   */
  inPlane(inputPlane: PlaneName | Plane, origin?: Point | number): this {
    const plane =
      inputPlane instanceof PlaneClass ? makePlane(inputPlane) : makePlane(inputPlane, origin);

    this.parallelTo(plane);

    const firstPointInPlane = ({ element }: { element: Edge }) =>
      element.startPoint.equals(element.startPoint.projectToPlane(plane));

    this.filters.push(firstPointInPlane);
    return this;
  }

  shouldKeep(element: Edge): boolean {
    let normal: Vector | null = null;

    try {
      normal = element.tangentAt().normalized();
    } catch (error) {
      console.error('Failed to compute edge tangent', error);
    }

    return this.filters.every((filter) => filter({ normal, element }));
  }

  protected applyFilter(shape: AnyShape): Edge[] {
    return shape.edges.filter((edge: Edge) => {
      const shouldKeep = this.shouldKeep(edge);
      return shouldKeep;
    });
  }
}
