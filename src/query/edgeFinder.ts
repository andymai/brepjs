import type { Point, PlaneName } from '../core/geometry.js';
import type { Plane } from '../core/planeTypes.js';
import type { Vec3, PointInput } from '../core/types.js';
import { resolvePlane } from '../core/planeOps.js';
import { vecNormalize, vecProjectToPlane, vecEquals } from '../core/vecOps.js';

/** Helper to convert legacy Point type to PointInput */
function pointToPointInput(p: Point): PointInput {
  if (Array.isArray(p)) {
    return p as PointInput;
  } else if ('x' in p && 'y' in p && 'z' in p) {
    // Vector class instance
    return [p.x, p.y, p.z];
  } else {
    // OCCT point-like object
    const xyz = p.XYZ();
    const vec: Vec3 = [xyz.X(), xyz.Y(), xyz.Z()];
    xyz.delete();
    return vec;
  }
}
import type { Face, AnyShape, Edge, CurveType } from '../topology/shapes.js';
import type { Direction } from './definitions.js';
import { PLANE_TO_DIR, type StandardPlane } from './definitions.js';
import { Finder3d } from './generic3dfinder.js';

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
    if (typeof plane === 'string') return this.atAngleWith(PLANE_TO_DIR[plane], 90);
    if (typeof plane !== 'string' && 'zDir' in plane) {
      // Check if it's a legacy Plane class or functional Plane interface
      const zDir = plane.zDir;
      let zDirPoint: Point;
      if ('toVec3' in zDir && typeof zDir.toVec3 === 'function') {
        // Legacy Plane class with Vector instances
        zDirPoint = zDir.toVec3();
      } else if (Array.isArray(zDir)) {
        // Functional Plane interface with Vec3 tuples
        zDirPoint = [zDir[0], zDir[1], zDir[2]];
      } else {
        return this;
      }
      return this.atAngleWith(zDirPoint, 90);
    }
    if (typeof plane !== 'string' && 'normalAt' in plane) {
      // Face - normalAt() returns Vec3 tuple
      const normal = plane.normalAt();
      const normalPoint: Point = [normal[0], normal[1], normal[2]];
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
      typeof inputPlane === 'string'
        ? resolvePlane(
            inputPlane,
            typeof origin === 'number' ? origin : origin ? pointToPointInput(origin) : undefined
          )
        : inputPlane;

    this.parallelTo(plane);

    const firstPointInPlane = ({ element }: { element: Edge }) => {
      const startPoint = element.startPoint;
      // Handle both legacy Plane class and functional Plane interface
      const planeOrigin =
        'toVec3' in plane.origin && typeof plane.origin.toVec3 === 'function'
          ? plane.origin.toVec3()
          : plane.origin;
      const planeZDir =
        'toVec3' in plane.zDir && typeof plane.zDir.toVec3 === 'function'
          ? plane.zDir.toVec3()
          : plane.zDir;
      const projected = vecProjectToPlane(startPoint, planeOrigin, planeZDir);
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
