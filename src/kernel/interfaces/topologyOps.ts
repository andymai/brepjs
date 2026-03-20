/**
 * KernelTopologyOps — topological introspection and iteration.
 *
 * Covers shape iteration, type checking, identity comparison, hashing,
 * orientation queries, and adjacency queries. Analogous to OCCT's
 * TopExp_Explorer and BRepTools packages.
 */

import type { KernelShape, ShapeOrientation, ShapeType } from '@/kernel/types.js';

export interface KernelTopologyOps {
  /** Iterate sub-shapes of a given type. */
  iterShapes(shape: KernelShape, type: ShapeType): KernelShape[];
  /** Iterate a TopTools_ListOfShape, calling a callback for each item. */
  iterShapeList(list: KernelShape, callback: (item: KernelShape) => void): void;
  /** Get the topological type of a shape. */
  shapeType(shape: KernelShape): ShapeType;
  /** Test if two shapes are the same topological entity. */
  isSame(a: KernelShape, b: KernelShape): boolean;
  /** Test if two shapes are geometrically equal (same location + orientation). */
  isEqual(a: KernelShape, b: KernelShape): boolean;
  /** Downcast a shape to a more specific type (e.g., TopoDS_Shape → TopoDS_Edge). */
  downcast(shape: KernelShape, type?: ShapeType): KernelShape;
  /** Compute a hash code for a shape (used for face tracking). */
  hashCode(shape: KernelShape, upperBound: number): number;
  /** Check if a shape handle is null. */
  isNull(shape: KernelShape): boolean;
  /** Get the orientation of a shape (forward, reversed, internal, external). */
  shapeOrientation(shape: KernelShape): ShapeOrientation;
  /** Get edge-to-face adjacency map as JSON. */
  edgeToFaceMap(shape: KernelShape): string;
  /** Get shared edges between two faces. */
  sharedEdges(faceA: KernelShape, faceB: KernelShape): KernelShape[];
  /** Get faces adjacent to a given face within a shape. */
  adjacentFaces(shape: KernelShape, face: KernelShape): KernelShape[];

  /** Sew shapes together at shared edges. */
  sew(shapes: KernelShape[], tolerance?: number): KernelShape;
}
