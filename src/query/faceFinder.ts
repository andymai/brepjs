import type { Plane, PlaneName } from '../core/planeTypes.js';
import type { Vec3, PointInput } from '../core/types.js';
import { resolvePlane } from '../core/planeOps.js';
import { vecProjectToPlane, vecEquals } from '../core/vecOps.js';

import type { Face, AnyShape, SurfaceType } from '../topology/shapes.js';
import { PLANE_TO_DIR, type StandardPlane } from './definitions.js';
import { Finder3d } from './generic3dfinder.js';

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
    if (typeof plane !== 'string' && 'zDir' in plane) {
      // Functional Plane interface with Vec3 tuples
      return this.atAngleWith(plane.zDir);
    }
    if (typeof plane !== 'string' && 'normalAt' in plane) {
      // Face - normalAt() returns Vec3 tuple
      const normal = plane.normalAt();
      return this.atAngleWith(normal);
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
  inPlane(inputPlane: PlaneName | Plane, origin?: PointInput | number): this {
    const plane = typeof inputPlane === 'string' ? resolvePlane(inputPlane, origin) : inputPlane;

    this.parallelTo(plane);

    const centerInPlane = ({ element }: { element: Face }) => {
      const center = element.center;
      const projected = vecProjectToPlane(center, plane.origin, plane.zDir);
      const result = vecEquals(center, projected);
      return result;
    };

    this.filters.push(centerInPlane);
    return this;
  }

  shouldKeep(element: Face): boolean {
    // normalAt() returns Vec3 tuple directly
    const normal: Vec3 = element.normalAt();
    const shouldKeep = this.filters.every((filter) => filter({ normal, element }));
    return shouldKeep;
  }

  protected applyFilter(shape: AnyShape): Face[] {
    return shape.faces.filter((face: Face) => {
      const shouldKeep = this.shouldKeep(face);
      return shouldKeep;
    });
  }
}
