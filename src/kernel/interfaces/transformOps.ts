/**
 * KernelTransformOps — spatial transformations and pattern generation.
 *
 * Covers translate, rotate, mirror, scale, general transforms (orthogonal
 * and non-orthogonal), curve positioning, and linear/circular/grid patterns.
 * Analogous to OCCT's BRepBuilderAPI_Transform.
 *
 * @see {@link KernelEvolutionOps} for history-tracking transform variants.
 */

import type { KernelShape, KernelType } from '@/kernel/types.js';

/** A single entry in a batch transform operation. */
export type TransformEntry =
  | {
      readonly type: 'translate';
      readonly shape: KernelShape;
      readonly x: number;
      readonly y: number;
      readonly z: number;
    }
  | {
      readonly type: 'rotate';
      readonly shape: KernelShape;
      readonly angle: number;
      readonly axis: readonly [number, number, number];
      readonly center: readonly [number, number, number];
    }
  | {
      readonly type: 'scale';
      readonly shape: KernelShape;
      readonly center: readonly [number, number, number];
      readonly factor: number;
    }
  | {
      readonly type: 'mirror';
      readonly shape: KernelShape;
      readonly origin: readonly [number, number, number];
      readonly normal: readonly [number, number, number];
    };

export interface KernelTransformOps {
  /** Create a composed transform from a sequence of translate/rotate operations. Returns an opaque handle. */
  composeTransform(
    ops: Array<
      | { type: 'translate'; x: number; y: number; z: number }
      | {
          type: 'rotate';
          angle: number;
          axis?: readonly [number, number, number] | undefined;
          center?: readonly [number, number, number] | undefined;
        }
    >
  ): { handle: KernelType; dispose: () => void };

  transform(shape: KernelShape, trsf: KernelType): KernelShape;

  /**
   * Apply a rigid transform as a *location re-tag* that shares the source's
   * underlying geometry instead of deep-copying its topology — O(1) vs
   * O(topology size). `trsf` MUST be a rigid motion (rotation + translation,
   * e.g. built from translate/rotate via {@link composeTransform}); non-rigid
   * input (scale/shear) is unsupported. Kernels with no cheap-location concept
   * fall back to a copying {@link transform}: the result is geometrically
   * identical, only the cost differs.
   */
  locate(shape: KernelShape, trsf: KernelType): KernelShape;
  translate(shape: KernelShape, x: number, y: number, z: number): KernelShape;
  rotate(
    shape: KernelShape,
    angle: number,
    axis?: readonly [number, number, number],
    center?: readonly [number, number, number]
  ): KernelShape;
  mirror(
    shape: KernelShape,
    origin: readonly [number, number, number],
    normal: readonly [number, number, number]
  ): KernelShape;
  scale(shape: KernelShape, center: readonly [number, number, number], factor: number): KernelShape;
  generalTransform(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number],
    isOrthogonal: boolean
  ): KernelShape;

  /** Apply a non-orthogonal general transform (gp_GTrsf path for shear / non-uniform scale). */
  generalTransformNonOrthogonal(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number]
  ): KernelShape;

  /** Position a shape at a parameter along a spine curve (Frenet frame transform). */
  positionOnCurve(shape: KernelShape, spine: KernelShape, param: number): KernelShape;

  /** Generate a linear pattern of shapes with pooled transforms for performance. */
  linearPattern(
    shape: KernelShape,
    direction: [number, number, number],
    spacing: number,
    count: number
  ): KernelShape[];
  /** Generate a circular pattern of shapes. */
  circularPattern(
    shape: KernelShape,
    center: [number, number, number],
    axis: [number, number, number],
    angleStep: number,
    count: number
  ): KernelShape[];
  /** Generate a 2D grid pattern (brepkit-native). Returns a compound. */
  gridPattern?(
    shape: KernelShape,
    directionX: [number, number, number],
    directionY: [number, number, number],
    spacingX: number,
    spacingY: number,
    countX: number,
    countY: number
  ): KernelShape;

  /** Apply N transforms in a single call. */
  transformBatch(entries: TransformEntry[]): KernelShape[];
}
