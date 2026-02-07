import type { Plane, PlaneName } from '../core/planeTypes.js';
import type { Vec3, PointInput } from '../core/types.js';
import { resolvePlane } from '../core/planeOps.js';
import { vecProjectToPlane, vecEquals } from '../core/vecOps.js';

import type { Face, AnyShape } from '../core/shapeTypes.js';
import type { SurfaceType } from '../topology/faceFns.js';
import { faceGeomType, faceCenter, normalAt } from '../topology/faceFns.js';
import { getFaces } from '../topology/shapeFns.js';
import { measureArea } from '../measurement/measureFns.js';
import { PLANE_TO_DIR, type StandardPlane } from './definitions.js';
import { Finder3d } from './generic3dfinder.js';

/**
 * Find faces within a shape by chaining declarative filters.
 *
 * Filters are combined with AND logic by default. Use `.either()` for OR
 * and `.not()` for negation (inherited from {@link Finder3d}).
 *
 * @example
 * ```ts
 * const topFace = new FaceFinder()
 *   .parallelTo("XY")
 *   .ofArea(100)
 *   .find(box, { unique: true });
 * ```
 *
 * @category Finders
 */
export class FaceFinder extends Finder3d<Face> {
  /**
   * Filter to find faces whose normal is parallel to a plane's normal or another face's normal.
   *
   * @remarks Only meaningful for planar faces. Curved faces use the normal
   * at the face center, which may not represent the whole surface.
   *
   * @param plane - A standard plane name ("XY", "XZ", "YZ"), a Plane object, or a Face.
   * @category Filter
   */
  parallelTo(plane: Plane | StandardPlane | Face): this {
    if (typeof plane === 'string') return this.atAngleWith(PLANE_TO_DIR[plane]);
    if (typeof plane !== 'string' && 'zDir' in plane) {
      // Functional Plane interface with Vec3 tuples
      return this.atAngleWith(plane.zDir);
    }
    if (typeof plane !== 'string' && 'wrapped' in plane) {
      // Face - normalAt() returns Vec3 tuple
      const normal = normalAt(plane);
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
      return faceGeomType(element) === surfaceType;
    };
    this.filters.push(check);
    return this;
  }

  /**
   * Filter to find faces that have a specific area.
   *
   * @param area - Target surface area.
   * @param tolerance - Absolute tolerance for the area comparison. Default: 1e-3.
   * @category Filter
   */
  ofArea(area: number, tolerance = 1e-3): this {
    const check = ({ element }: { element: Face }) => {
      return Math.abs(measureArea(element) - area) < tolerance;
    };
    this.filters.push(check);
    return this;
  }

  /**
   * Filter to find faces that lie within a plane.
   *
   * Checks both that the face is parallel to the plane and that its
   * center point projects onto the plane.
   *
   * @remarks Only meaningful for planar faces.
   *
   * @param inputPlane - A plane name or Plane object.
   * @param origin - Plane origin offset (number for standard planes, or a point).
   * @category Filter
   */
  inPlane(inputPlane: PlaneName | Plane, origin?: PointInput | number): this {
    const plane = typeof inputPlane === 'string' ? resolvePlane(inputPlane, origin) : inputPlane;

    this.parallelTo(plane);

    const centerInPlane = ({ element }: { element: Face }) => {
      const center = faceCenter(element);
      const projected = vecProjectToPlane(center, plane.origin, plane.zDir);
      const result = vecEquals(center, projected);
      return result;
    };

    this.filters.push(centerInPlane);
    return this;
  }

  shouldKeep(element: Face): boolean {
    // normalAt() returns Vec3 tuple directly
    const normal: Vec3 = normalAt(element);
    const shouldKeep = this.filters.every((filter) => filter({ normal, element }));
    return shouldKeep;
  }

  protected applyFilter(shape: AnyShape): Face[] {
    return getFaces(shape).filter((face: Face) => {
      const shouldKeep = this.shouldKeep(face);
      return shouldKeep;
    });
  }
}
