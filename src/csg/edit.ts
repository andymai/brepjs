/**
 * Structural edit helpers for CSG IR trees.
 *
 * Edits are immutable — `replaceNode` returns a new tree with the
 * replacement applied wherever the predicate matches. Builders are used
 * to re-construct ancestor nodes, which transparently recomputes
 * structural hashes and free-param sets bottom-up.
 *
 * For parametric edits (changing a `Param` value) you don't need this —
 * just re-evaluate with a different env.
 */

import * as B from './builders.js';
import type { IRNode } from './types.js';

export type NodePredicate = (node: IRNode) => boolean;

/**
 * Walk the tree; whenever `pred(node)` returns true, substitute
 * `replacement`. Ancestors are re-built so hashes stay correct.
 *
 * Note: this is a multi-match operation — every matching node is
 * replaced. Use `replaceFirst` if you want single-match semantics.
 */
export function replaceNode(root: IRNode, pred: NodePredicate, replacement: IRNode): IRNode {
  return walk(root, pred, replacement, { stopAfterFirst: false });
}

export function replaceFirst(root: IRNode, pred: NodePredicate, replacement: IRNode): IRNode {
  return walk(root, pred, replacement, { stopAfterFirst: true });
}

interface WalkState {
  readonly stopAfterFirst: boolean;
}

function walk(node: IRNode, pred: NodePredicate, repl: IRNode, state: WalkState): IRNode {
  if (pred(node)) return repl;
  return rebuildChildren(node, pred, repl, state);
}

function rebuildChildren(n: IRNode, pred: NodePredicate, repl: IRNode, s: WalkState): IRNode {
  switch (n.kind) {
    case 'Box':
    case 'Sphere':
    case 'Cylinder':
    case 'Cone':
    case 'Torus':
    case 'Polygon':
    case 'Circle':
    case 'Line':
    case 'Vertex':
    case 'Empty':
      return n;
    case 'Fuse':
      return B.fuse(walk(n.a, pred, repl, s), walk(n.b, pred, repl, s), n.tolerance);
    case 'Cut':
      return B.cut(walk(n.a, pred, repl, s), walk(n.b, pred, repl, s), n.tolerance);
    case 'Intersect':
      return B.intersect(walk(n.a, pred, repl, s), walk(n.b, pred, repl, s), n.tolerance);
    case 'FuseAll':
      return B.fuseAll(
        n.shapes.map((c) => walk(c, pred, repl, s)),
        n.tolerance
      );
    case 'CutAll':
      return B.cutAll(
        walk(n.base, pred, repl, s),
        n.tools.map((c) => walk(c, pred, repl, s)),
        n.tolerance
      );
    case 'Translate':
      return B.translate(walk(n.target, pred, repl, s), n.vector);
    case 'Rotate':
      return B.rotate(walk(n.target, pred, repl, s), n.angle, {
        axis: n.axis,
        at: n.at,
      });
    case 'Scale':
      return B.scale(walk(n.target, pred, repl, s), n.factor, { center: n.center });
    case 'Mirror':
      return B.mirror(walk(n.target, pred, repl, s), { normal: n.normal, at: n.at });
    case 'Compound':
      return B.compound(n.children.map((c) => walk(c, pred, repl, s)));
  }
}

/** Visit every node in the tree (pre-order). */
export function forEachNode(root: IRNode, fn: (node: IRNode) => void): void {
  fn(root);
  for (const child of childrenOf(root)) forEachNode(child, fn);
}

function childrenOf(n: IRNode): readonly IRNode[] {
  switch (n.kind) {
    case 'Box':
    case 'Sphere':
    case 'Cylinder':
    case 'Cone':
    case 'Torus':
    case 'Polygon':
    case 'Circle':
    case 'Line':
    case 'Vertex':
    case 'Empty':
      return [];
    case 'Fuse':
    case 'Cut':
    case 'Intersect':
      return [n.a, n.b];
    case 'FuseAll':
      return n.shapes;
    case 'CutAll':
      return [n.base, ...n.tools];
    case 'Translate':
    case 'Rotate':
    case 'Scale':
    case 'Mirror':
      return [n.target];
    case 'Compound':
      return n.children;
  }
}

/** Count the total number of nodes in the tree. */
export function nodeCount(root: IRNode): number {
  let n = 0;
  forEachNode(root, () => {
    n++;
  });
  return n;
}
