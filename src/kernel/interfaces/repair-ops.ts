/**
 * KernelRepairOps — validation, healing, and shape fixing.
 *
 * Covers shape validation (relaxed and strict), solid/face/wire healing,
 * vertex merging, degenerate edge removal, and orientation fixing.
 * Analogous to OCCT's ShapeFix and ShapeAnalysis packages.
 */

import type { KernelShape } from '../types.js';

export interface KernelRepairOps {
  /**
   * Check if a shape is topologically and geometrically valid.
   *
   * Uses relaxed validation when available — accepts NURBS approximation
   * tolerances that strict mode would flag.
   *
   * **Cross-kernel note**: OCCT uses `BRepCheck_Analyzer` (no relaxed
   * variant). brepkit uses `validateSolidRelaxed()`.
   */
  isValid(shape: KernelShape): boolean;

  /**
   * Strict validation — fails on any geometric or topological issue,
   * including NURBS approximation gaps.
   *
   * **Cross-kernel note**: OCCT's `BRepCheck_Analyzer` is inherently
   * strict, so this is identical to `isValid`. brepkit uses
   * `validateSolid()` (strict).
   */
  isValidStrict?(shape: KernelShape): boolean;

  healSolid(shape: KernelShape): KernelShape | null;
  healFace(shape: KernelShape): KernelShape;
  healWire(wire: KernelShape, face?: KernelShape): KernelShape;

  /** Merge coincident vertices within tolerance. Returns merge count. */
  mergeCoincidentVertices(shape: KernelShape, tolerance: number): number;
  /** Remove zero-length (degenerate) edges. Returns removal count. */
  removeDegenerateEdges(shape: KernelShape, tolerance: number): number;
  /** Fix face orientations for consistent normals. Returns fix count. */
  fixFaceOrientations(shape: KernelShape): number;

  /** Run ShapeFix_Shape on a shape (fixes orientation, etc.). */
  fixShape(shape: KernelShape): KernelShape;
  /** Fix self-intersections in a wire. */
  fixSelfIntersection(wire: KernelShape): KernelShape;
}
