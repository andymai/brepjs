// Edits are immutable: rebuild from the bottom up via builders so hashes and
// freeParams stay correct. For parameter changes, use `evaluate(tree, env)`.
import * as B from './builders.js';
import type { IRNode } from './types.js';

export type NodePredicate = (node: IRNode) => boolean;

export function replaceNode(root: IRNode, pred: NodePredicate, replacement: IRNode): IRNode {
  return walk(root, pred, replacement);
}

function walk(node: IRNode, pred: NodePredicate, repl: IRNode): IRNode {
  if (pred(node)) return repl;
  return rebuildChildren(node, pred, repl);
}

function rebuildChildren(n: IRNode, pred: NodePredicate, repl: IRNode): IRNode {
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
      return B.fuse(walk(n.a, pred, repl), walk(n.b, pred, repl), n.tolerance);
    case 'Cut':
      return B.cut(walk(n.a, pred, repl), walk(n.b, pred, repl), n.tolerance);
    case 'Intersect':
      return B.intersect(walk(n.a, pred, repl), walk(n.b, pred, repl), n.tolerance);
    case 'FuseAll':
      return B.fuseAll(
        n.shapes.map((c) => walk(c, pred, repl)),
        n.tolerance
      );
    case 'CutAll':
      return B.cutAll(
        walk(n.base, pred, repl),
        n.tools.map((c) => walk(c, pred, repl)),
        n.tolerance
      );
    case 'Translate':
      return B.translate(walk(n.target, pred, repl), n.vector);
    case 'Rotate':
      return B.rotate(walk(n.target, pred, repl), n.angle, { axis: n.axis, at: n.at });
    case 'Scale':
      return B.scale(walk(n.target, pred, repl), n.factor, { center: n.center });
    case 'Mirror':
      return B.mirror(walk(n.target, pred, repl), { normal: n.normal, at: n.at });
    case 'Compound':
      return B.compound(n.children.map((c) => walk(c, pred, repl)));
  }
}

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

export function nodeCount(root: IRNode): number {
  let n = 0;
  forEachNode(root, () => {
    n++;
  });
  return n;
}
