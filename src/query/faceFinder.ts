import type { Point, Plane, PlaneName } from '../core/geometry.js';
import { makePlane } from '../core/geometryHelpers.js';
import type { Face, AnyShape, SurfaceType } from '../topology/shapes.js';
import { PLANE_TO_DIR, type StandardPlane } from './definitions.js';
import { Finder3d } from './generic3dfinder.js';
import { Plane as PlaneClass } from '../core/geometry.js';

/**
 * With a FaceFinder you can apply a set of filters to find specific faces
 * within a shape.
 *
 * @category Finders
 */
export class FaceFinder extends Finder3d<Face> {
  /** Filter to find faces that are parallel to plane or another face
   *
   * Note that this will work only in planar faces (but the method does not
   * check this assumption).
   *
   * @category Filter
   */
  parallelTo(plane: Plane | StandardPlane | Face): this {
    if (typeof plane === 'string') return this.atAngleWith(PLANE_TO_DIR[plane]);
    if (typeof plane !== 'string' && plane instanceof PlaneClass)
      return this.atAngleWith(plane.zDir);
    if (typeof plane !== 'string' && 'normalAt' in plane) {
      const normal = plane.normalAt();
      // Extract primitive values to avoid capturing Vector in closure
      const normalPoint: Point = [normal.x, normal.y, normal.z];
      normal.delete();
      return this.atAngleWith(normalPoint);
    }
    return this;
  }

  /**
   * Filter to find faces that are of a certain surface type.
   *
   * @category Filter
   */
  ofSurfaceType(surfaceType: SurfaceType): this {
    const check = ({ element }: { element: Face }) => {
      return element.geomType === surfaceType;
    };
    this.filters.push(check);
    return this;
  }

  /** Filter to find faces that are contained in a plane.
   *
   * Note that this will work only in planar faces (but the method does not
   * check this assumption).
   *
   * @category Filter
   */
  inPlane(inputPlane: PlaneName | Plane, origin?: Point | number): this {
    const plane =
      inputPlane instanceof PlaneClass ? makePlane(inputPlane) : makePlane(inputPlane, origin);

    this.parallelTo(plane);

    const centerInPlane = ({ element }: { element: Face }) => {
      const center = element.center;
      const projected = center.projectToPlane(plane);
      const result = center.equals(projected);
      projected.delete();
      return result;
    };

    this.filters.push(centerInPlane);
    return this;
  }

  shouldKeep(element: Face): boolean {
    const normal = element.normalAt();
    const shouldKeep = this.filters.every((filter) => filter({ normal, element }));
    normal.delete();
    return shouldKeep;
  }

  protected applyFilter(shape: AnyShape): Face[] {
    return shape.faces.filter((face: Face) => {
      const shouldKeep = this.shouldKeep(face);
      return shouldKeep;
    });
  }
}
