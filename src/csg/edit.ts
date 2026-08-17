// Edits are immutable: rebuild from the bottom up via builders so hashes and
// freeParams stay correct. For parameter changes, use `evaluate(tree, env)`.
import * as B from './builders.js';
import type {
  IRNode,
  ExtrudeNode,
  RevolveNode,
  LoftNode,
  SweepNode,
  ColorNode,
  FilletNode,
  ChamferNode,
  ShellNode,
} from './types.js';

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
    case 'Path':
    case 'Profile':
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
    case 'Instance':
      return B.instance(walk(n.source, pred, repl), n.placements, n.fuse);
    case 'Extrude':
    case 'Revolve':
    case 'Loft':
    case 'Sweep':
    case 'Color':
    case 'Fillet':
    case 'Chamfer':
    case 'Shell':
      return rebuildFeature(n, pred, repl);
  }
}

function rebuildFeature(
  n:
    | ExtrudeNode
    | RevolveNode
    | LoftNode
    | SweepNode
    | ColorNode
    | FilletNode
    | ChamferNode
    | ShellNode,
  pred: NodePredicate,
  repl: IRNode
): IRNode {
  switch (n.kind) {
    case 'Extrude':
      return B.extrude(walk(n.profile, pred, repl), n.vector);
    case 'Revolve':
      return B.revolve(walk(n.profile, pred, repl), n.angle, { axis: n.axis, at: n.at });
    case 'Loft':
      return B.loft(
        n.sections.map((s) => walk(s, pred, repl)),
        { ruled: n.ruled }
      );
    case 'Sweep':
      return B.sweep(walk(n.profile, pred, repl), walk(n.spine, pred, repl), {
        frenet: n.frenet,
      });
    case 'Color':
      return B.color(walk(n.target, pred, repl), [...n.color]);
    case 'Fillet':
      return B.fillet(walk(n.target, pred, repl), n.ref, n.radius);
    case 'Chamfer':
      return B.chamfer(walk(n.target, pred, repl), n.ref, n.distance);
    case 'Shell':
      return B.shell(walk(n.target, pred, repl), n.refs, n.thickness);
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
    case 'Path':
    case 'Profile':
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
    case 'Color':
    case 'Fillet':
    case 'Chamfer':
    case 'Shell':
      return [n.target];
    case 'Compound':
      return n.children;
    case 'Instance':
      return [n.source];
    case 'Extrude':
    case 'Revolve':
      return [n.profile];
    case 'Loft':
      return n.sections;
    case 'Sweep':
      return [n.profile, n.spine];
  }
}

export function nodeCount(root: IRNode): number {
  let n = 0;
  forEachNode(root, () => {
    n++;
  });
  return n;
}
