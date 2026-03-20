/**
 * KernelBooleanOps — boolean algebra on solids and shape splitting.
 *
 * Covers union (fuse), subtraction (cut), intersection, cross-section,
 * multi-operand variants, splitting, and mesh-level booleans. Analogous to
 * OCCT's BRepAlgoAPI package.
 *
 * @see {@link KernelEvolutionOps} for history-tracking boolean variants.
 */

import type { BooleanOptions, KernelMeshResult, KernelShape } from '@/kernel/types.js';

export interface KernelBooleanOps {
  /** Fuse (union) two shapes. */
  fuse(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape;
  /** Cut (subtract) tool from shape. */
  cut(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape;
  /** Intersect two shapes. */
  intersect(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape;
  /** Cross-section: intersect shape with a plane. */
  section(shape: KernelShape, plane: KernelShape, approximation?: boolean): KernelShape;
  /** Fuse all shapes in one operation (N-way union). */
  fuseAll(shapes: KernelShape[], options?: BooleanOptions): KernelShape;
  /** Cut all tools from shape sequentially. */
  cutAll(shape: KernelShape, tools: KernelShape[], options?: BooleanOptions): KernelShape;

  /** Split shape by tool shapes. */
  split(shape: KernelShape, tools: KernelShape[]): KernelShape;

  /**
   * Boolean operation on raw triangle data. Returns merged mesh.
   *
   * **Cross-kernel note**: Only brepkit supports mesh booleans natively.
   * OCCT adapter throws.
   */
  meshBoolean(
    positionsA: number[],
    indicesA: number[],
    positionsB: number[],
    indicesB: number[],
    op: string,
    tolerance: number
  ): KernelMeshResult;
}
