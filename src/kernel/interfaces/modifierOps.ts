/**
 * KernelModifierOps — shape modification operations.
 *
 * Covers fillet, chamfer, shell, offset, thicken, draft, and defeaturing.
 * Analogous to OCCT's BRepFilletAPI and BRepOffsetAPI packages.
 *
 * @see {@link KernelEvolutionOps} for history-tracking modifier variants.
 */

import type { KernelShape } from '@/kernel/types.js';

export interface KernelModifierOps {
  fillet(
    shape: KernelShape,
    edges: KernelShape[],
    radius: number | [number, number] | ((edge: KernelShape) => number | [number, number])
  ): KernelShape;
  chamfer(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number | [number, number] | ((edge: KernelShape) => number | [number, number])
  ): KernelShape;
  chamferDistAngle(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number,
    angleDeg: number
  ): KernelShape;
  shell(
    shape: KernelShape,
    faces: KernelShape[],
    thickness: number,
    tolerance?: number
  ): KernelShape;
  thicken(shape: KernelShape, thickness: number): KernelShape;
  offset(shape: KernelShape, distance: number, tolerance?: number): KernelShape;

  /** Variable-radius fillet. Each entry specifies edges and radii per edge. */
  filletVariable(shape: KernelShape, spec: string): KernelShape;

  /**
   * Draft (taper) faces of a solid along a pull direction about a neutral plane.
   *
   * The neutral plane is the surface where material is neither added nor removed.
   * Angle is in degrees; positive tapers outward from the pull direction.
   *
   * @param angleDeg - Uniform angle, or per-face callback returning degrees (null to skip).
   */
  draft(
    shape: KernelShape,
    faces: KernelShape[],
    pullDirection: [number, number, number],
    neutralPlane: [number, number, number],
    angleDeg: number | ((face: KernelShape) => number)
  ): KernelShape;

  /** Remove faces from a solid (defeaturing). */
  defeature(shape: KernelShape, faces: KernelShape[]): KernelShape;

  /** 2D offset for wires on a plane. */
  offsetWire2D(
    wire: KernelShape,
    offset: number,
    joinType?: number | 'arc' | 'intersection' | 'tangent'
  ): KernelShape;

  /** Simplify a shape by merging same-domain faces and edges. */
  simplify(shape: KernelShape): KernelShape;

  /** Return a copy of the shape with reversed orientation. */
  reverseShape(shape: KernelShape): KernelShape;
}
