/**
 * KernelPrimitiveOps — geometric solid primitives.
 *
 * Covers box, cylinder, sphere, cone, torus, ellipsoid, and rectangle
 * construction. These are the simplest shape factories with fixed
 * parametric forms. Analogous to OCCT's BRepPrimAPI package.
 *
 * @see {@link KernelBuilderOps} for extended edge/wire/face/surface builders.
 */

import type { KernelShape } from '../types.js';

export interface KernelPrimitiveOps {
  makeBox(width: number, height: number, depth: number): KernelShape;
  makeCylinder(
    radius: number,
    height: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape;
  makeSphere(radius: number, center?: [number, number, number]): KernelShape;
  makeCone(
    radius1: number,
    radius2: number,
    height: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape;
  makeTorus(
    majorRadius: number,
    minorRadius: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape;

  /** Build an ellipsoid solid with the given axis half-lengths. */
  makeEllipsoid(aLength: number, bLength: number, cLength: number): KernelShape;

  makeBoxFromCorners(p1: [number, number, number], p2: [number, number, number]): KernelShape;
  makeRectangle(width: number, height: number): KernelShape;
}
