import type { OpNode } from './opGraph.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- manifold-3d object type gap
export type ManifoldSolid = any;

export interface ManifoldShape {
  readonly manifold: ManifoldSolid;
  readonly node: OpNode;
}

export function wrap(manifold: ManifoldSolid, node: OpNode): ManifoldShape {
  return { manifold, node };
}

export function unwrap(shape: ManifoldShape): ManifoldSolid {
  return shape.manifold;
}

export function nodeOf(shape: ManifoldShape): OpNode {
  return shape.node;
}
