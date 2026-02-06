/**
 * Assembly graph — tree structure for managing shape hierarchies.
 *
 * An assembly is a tree of nodes. Each node has an optional shape,
 * a local transform (translation + rotation), optional metadata,
 * and child nodes. This is a pure data structure with no OCCT calls.
 *
 * Usage:
 *   const asm = createAssemblyNode('root')
 *     |> addChild(_, createAssemblyNode('part-a', { shape: boxShape, translate: [10, 0, 0] }))
 *     |> addChild(_, createAssemblyNode('part-b', { shape: cylShape }));
 */

import type { Vec3 } from '../core/types.js';
import type { AnyShape } from '../core/shapeTypes.js';

// ---------------------------------------------------------------------------
// Assembly types
// ---------------------------------------------------------------------------

export interface AssemblyNode {
  readonly name: string;
  readonly shape?: AnyShape;
  readonly translate?: Vec3;
  readonly rotate?: { angle: number; axis?: Vec3 };
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly children: ReadonlyArray<AssemblyNode>;
}

export interface AssemblyNodeOptions {
  shape?: AnyShape;
  translate?: Vec3;
  rotate?: { angle: number; axis?: Vec3 };
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

/** Create a new assembly node. */
export function createAssemblyNode(name: string, options: AssemblyNodeOptions = {}): AssemblyNode {
  return {
    name,
    children: [],
    ...(options.shape !== undefined ? { shape: options.shape } : {}),
    ...(options.translate !== undefined ? { translate: options.translate } : {}),
    ...(options.rotate !== undefined ? { rotate: options.rotate } : {}),
    ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
  };
}

// ---------------------------------------------------------------------------
// Immutable tree operations
// ---------------------------------------------------------------------------

/** Add a child node. Returns a new parent node. */
export function addChild(parent: AssemblyNode, child: AssemblyNode): AssemblyNode {
  return { ...parent, children: [...parent.children, child] };
}

/** Remove a child by name (first match). Returns a new parent node. */
export function removeChild(parent: AssemblyNode, childName: string): AssemblyNode {
  const idx = parent.children.findIndex((c) => c.name === childName);
  if (idx === -1) return parent;
  const children = [...parent.children];
  children.splice(idx, 1);
  return { ...parent, children };
}

/** Update a node's properties. Returns a new node. */
export function updateNode(
  node: AssemblyNode,
  updates: Partial<AssemblyNodeOptions>
): AssemblyNode {
  return {
    ...node,
    ...(updates.shape !== undefined ? { shape: updates.shape } : {}),
    ...(updates.translate !== undefined ? { translate: updates.translate } : {}),
    ...(updates.rotate !== undefined ? { rotate: updates.rotate } : {}),
    ...(updates.metadata !== undefined ? { metadata: updates.metadata } : {}),
  };
}

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

/** Find a node by name (depth-first). Returns undefined if not found. */
export function findNode(root: AssemblyNode, name: string): AssemblyNode | undefined {
  if (root.name === name) return root;
  for (const child of root.children) {
    const found = findNode(child, name);
    if (found) return found;
  }
  return undefined;
}

/** Walk the tree depth-first, calling visitor for each node. */
export function walkAssembly(
  root: AssemblyNode,
  visitor: (node: AssemblyNode, depth: number) => void,
  depth = 0
): void {
  visitor(root, depth);
  for (const child of root.children) {
    walkAssembly(child, visitor, depth + 1);
  }
}

/** Count all nodes in the tree. */
export function countNodes(root: AssemblyNode): number {
  let count = 1;
  for (const child of root.children) {
    count += countNodes(child);
  }
  return count;
}

/** Collect all shapes in the tree (depth-first). */
export function collectShapes(root: AssemblyNode): AnyShape[] {
  const shapes: AnyShape[] = [];
  walkAssembly(root, (node) => {
    if (node.shape) shapes.push(node.shape);
  });
  return shapes;
}
