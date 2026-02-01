/**
 * Abstract 3D finder with common spatial filters (angle, distance, containment).
 * Ported from replicad's finders/generic3dfinder.ts.
 */

import {
  type Direction,
  DIRECTIONS,
  type FaceOrEdge,
  type FilterFcn,
  Finder,
} from './definitions.js';

import { Vector, type Point, asPnt } from '../core/geometry.js';
import { DEG2RAD } from '../core/constants.js';
import type { AnyShape } from '../topology/shapes.js';
import { getKernel } from '../kernel/index.js';
import { WrappingObj } from '../core/memory.js';
import type { OcType } from '../kernel/types.js';

/**
 * Lightweight vertex wrapper used for distance queries within finders.
 * This avoids a dependency on shape-helper utilities that may not exist yet.
 */
const makeVertexOc = (point: Point): OcType => {
  const oc = getKernel().oc;
  const pnt = asPnt(point);
  const vertexMaker = new oc.BRepBuilderAPI_MakeVertex(pnt);
  const vertex = vertexMaker.Vertex();
  vertexMaker.delete();
  pnt.delete();
  return vertex;
};

/**
 * Lightweight box builder used for the `inBox` filter.
 */
const makeBoxOc = (corner1: Point, corner2: Point): OcType => {
  const oc = getKernel().oc;
  const p1 = asPnt(corner1);
  const p2 = asPnt(corner2);
  const boxMaker = new oc.BRepPrimAPI_MakeBox_4(p1, p2);
  const solid = boxMaker.Solid();
  boxMaker.delete();
  p1.delete();
  p2.delete();
  return solid;
};

/**
 * Minimal distance query that wraps BRepExtrema_DistShapeShape.
 * Keeps the first shape loaded so multiple second-shape queries are efficient.
 */
class DistanceQueryInternal extends WrappingObj<OcType> {
  constructor(shape1: OcType) {
    const oc = getKernel().oc;
    super(new oc.BRepExtrema_DistShapeShape_1());
    this.wrapped.LoadS1(shape1);
  }

  distanceTo(shape2Wrapped: OcType): number {
    this.wrapped.LoadS2(shape2Wrapped);
    this.wrapped.Perform();
    return this.wrapped.Value();
  }
}

export abstract class Finder3d<Type extends FaceOrEdge> extends Finder<Type, AnyShape> {
  /**
   * Filter to find elements following a custom function.
   *
   * @category Filter
   */
  when(filter: (filter: FilterFcn<Type>) => boolean): this {
    this.filters.push(filter);
    return this;
  }

  /**
   * Filter to find elements that are in the list.
   *
   * This deletes the elements in the list as the filter deletion.
   *
   * @category Filter
   */
  inList(elementList: Type[]): this {
    const elementInList = ({ element }: { element: Type }) => {
      return !!elementList.find((e) => e.isSame(element));
    };
    this.filters.push(elementInList);
    return this;
  }

  /**
   * Filter to find elements that are at a specified angle (in degrees) with
   * a direction.
   *
   * The element direction corresponds to its normal in the case of a face.
   *
   * @category Filter
   */
  atAngleWith(direction: Direction | Point = 'Z', angle = 0): this {
    let myDirection: Vector;
    if (typeof direction === 'string') {
      myDirection = new Vector(DIRECTIONS[direction]);
    } else {
      myDirection = new Vector(direction);
    }

    const checkAngle = ({ normal }: { normal: Vector | null }) => {
      // We do not care about the orientation
      if (!normal) return false;
      const angleOfNormal = Math.acos(Math.abs(normal.dot(myDirection)));

      return Math.abs(angleOfNormal - DEG2RAD * angle) < 1e-6;
    };

    this.filters.push(checkAngle);

    return this;
  }

  /**
   * Filter to find elements that are at a specified distance from a point.
   *
   * @category Filter
   */
  atDistance(distance: number, point: Point = [0, 0, 0]): this {
    const vertexShape = makeVertexOc(point);
    const query = new DistanceQueryInternal(vertexShape);

    const checkPoint = ({ element }: { element: Type }) => {
      return Math.abs(query.distanceTo(element.wrapped) - distance) < 1e-6;
    };

    this.filters.push(checkPoint);
    return this;
  }

  /**
   * Filter to find elements that contain a certain point
   *
   * @category Filter
   */
  containsPoint(point: Point): this {
    return this.atDistance(0, point);
  }

  /**
   * Filter to find elements that are within a certain distance from a point.
   *
   * @category Filter
   */
  withinDistance(distance: number, point: Point = [0, 0, 0]): this {
    const vertexShape = makeVertexOc(point);
    const query = new DistanceQueryInternal(vertexShape);

    const checkPoint = ({ element }: { element: Type }) => {
      return query.distanceTo(element.wrapped) - distance < 1e-6;
    };

    this.filters.push(checkPoint);
    return this;
  }

  /**
   * Filter to find elements that are within a box
   *
   * The elements that are not fully contained in the box are also found.
   *
   * @category Filter
   */
  inBox(corner1: Point, corner2: Point): this {
    const boxShape = makeBoxOc(corner1, corner2);
    return this.inShape(boxShape);
  }

  /**
   * Filter to find elements that are within a generic shape
   *
   * The elements that are not fully contained in the shape are also found.
   *
   * @category Filter
   */
  inShape(shape: OcType): this {
    const shapeWrapped =
      shape && typeof shape === 'object' && 'wrapped' in shape
        ? (shape as AnyShape).wrapped
        : shape;

    const query = new DistanceQueryInternal(shapeWrapped);

    const checkPoint = ({ element }: { element: Type }) => {
      return query.distanceTo(element.wrapped) < 1e-6;
    };

    this.filters.push(checkPoint);
    return this;
  }
}
