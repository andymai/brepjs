import type { BimCategory } from '../types/bimTypes.js';

/**
 * A node in a {@link BimModel}'s spatial/decomposition tree. Fully serializable
 * (plain numbers/strings) so it can be posted across a worker boundary.
 */
export interface BimTreeNode {
  /** The element's local id. */
  readonly id: number;
  /** Display label — the element's name, or its category when unnamed. */
  readonly label: string;
  /** The element's IFC category. */
  readonly category: BimCategory;
  readonly children: readonly BimTreeNode[];
}

/** A serializable summary of a model's structure, rooted at the project. */
export interface BimTreeSummary {
  /** The project node and its nested spatial structure + contained elements. */
  readonly root: BimTreeNode | null;
  /** Number of nodes in the tree (the project and everything reachable from it). */
  readonly elementCount: number;
}
