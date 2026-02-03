import type { Point, Plane, PlaneName, Vector } from '../core/geometry.js';
import { makePlane } from '../core/geometryHelpers.js';
import { localGC } from '../core/memory.js';
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
    const [r, gc] = localGC();
    if (typeof plane === 'string') return this.atAngleWith(PLANE_TO_DIR[plane], 90);
    if (typeof plane !== 'string' && plane instanceof PlaneClass)
      return this.atAngleWith(plane.zDir, 90);
    if (typeof plane !== 'string' && 'normalAt' in plane) {
      const normal = r(plane.normalAt());
      // Extract primitive values to avoid capturing Vector in closure
      const normalPoint: Point = [normal.x, normal.y, normal.z];
      gc();
      return this.atAngleWith(normalPoint, 90);
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

    const firstPointInPlane = ({ element }: { element: Edge }) => {
      const [r, gc] = localGC();
      const startPoint = element.startPoint;
      const projected = r(startPoint.projectToPlane(plane));
      const result = startPoint.equals(projected);
      gc();
      return result;
    };

    this.filters.push(firstPointInPlane);
    return this;
  }

  shouldKeep(element: Edge): boolean {
    const [r, gc] = localGC();
    let normal: Vector | null = null;
    let tangent: Vector | null = null;

    try {
      tangent = r(element.tangentAt());
      normal = r(tangent.normalized());
    } catch {
      // Degenerate edges may lack a valid tangent — filters should handle null normal
    }

    const result = this.filters.every((filter) => filter({ normal, element }));
    gc();

    return result;
  }

  protected applyFilter(shape: AnyShape): Edge[] {
    return shape.edges.filter((edge: Edge) => {
      const shouldKeep = this.shouldKeep(edge);
      return shouldKeep;
    });
  }
}
