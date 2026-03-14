/**
 * KernelMeshOps — tessellation and mesh preparation.
 *
 * Covers surface and edge tessellation for visualization, as well as
 * mesh preparation utilities. Analogous to OCCT's BRepMesh package.
 */

import type { KernelEdgeMeshResult, KernelMeshResult, KernelShape, MeshOptions } from '../types.js';

export interface KernelMeshOps {
  mesh(shape: KernelShape, options: MeshOptions): KernelMeshResult;

  /**
   * Tessellate edges for wireframe display.
   *
   * **Cross-kernel note**: brepkit only supports linear deflection;
   * `angularTolerance` is ignored (a one-time warning is emitted).
   */
  meshEdges(shape: KernelShape, tolerance: number, angularTolerance: number): KernelEdgeMeshResult;

  /** Check if a shape already has triangulation data. */
  hasTriangulation(shape: KernelShape): boolean;

  /**
   * Pre-compute mesh data for a shape (incremental meshing).
   *
   * **Cross-kernel note**: brepkit only supports linear deflection;
   * `angularTolerance` is ignored.
   */
  meshShape(shape: KernelShape, tolerance: number, angularTolerance: number): void;
}
