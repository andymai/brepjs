import type { Point, PlaneName } from '../core/geometry.js';
import type { Plane } from '../core/planeTypes.js';
import type { Vec3, PointInput } from '../core/types.js';
import { resolvePlane } from '../core/planeOps.js';
import { vecProjectToPlane, vecEquals } from '../core/vecOps.js';

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
      return this.atAngleWith(zDirPoint);
    }
    if (typeof plane !== 'string' && 'normalAt' in plane) {
      // Face - normalAt() returns Vec3 tuple
      const normal = plane.normalAt();
      const normalPoint: Point = [normal[0], normal[1], normal[2]];
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
      typeof inputPlane === 'string'
        ? resolvePlane(
            inputPlane,
            typeof origin === 'number' ? origin : origin ? pointToPointInput(origin) : undefined
          )
        : inputPlane;

    this.parallelTo(plane);

    const centerInPlane = ({ element }: { element: Face }) => {
      const center = element.center;
      // Handle both legacy Plane class and functional Plane interface
      const planeOrigin =
        'toVec3' in plane.origin && typeof plane.origin.toVec3 === 'function'
          ? plane.origin.toVec3()
          : plane.origin;
      const planeZDir =
        'toVec3' in plane.zDir && typeof plane.zDir.toVec3 === 'function'
          ? plane.zDir.toVec3()
          : plane.zDir;
      const projected = vecProjectToPlane(center, planeOrigin, planeZDir);
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
