/**
 * DAG-aware tree walks — forEachNode/nodeCount/replaceNode/optimize on
 * self-sharing graphs. Before identity memoization these expanded a shared
 * DAG to its exponential path count (a 30-level doubling graph has 2^31-1
 * paths over 31 distinct nodes).
 */

import { describe, expect, it } from 'vitest';
import {
  box,
  fuse,
  nodeCount,
  forEachNode,
  optimize,
  replaceNode,
  type IRNode,
} from '@/csg/index.js';

function doublingDag(depth: number): IRNode {
  let node: IRNode = box(1, 1, 1);
  for (let i = 0; i < depth; i++) {
    node = fuse(node, node);
  }
  return node;
}

describe('DAG-aware walks', () => {
  it('nodeCount counts distinct nodes, not paths', () => {
    const dag = doublingDag(30);
    expect(nodeCount(dag)).toBe(31);
  });

  it('forEachNode visits each distinct node once', () => {
    const dag = doublingDag(30);
    let visits = 0;
    forEachNode(dag, () => {
      visits++;
    });
    expect(visits).toBe(31);
  });

  it('replaceNode evaluates its predicate once per distinct node and preserves sharing', () => {
    const dag = doublingDag(30);
    let calls = 0;
    const edited = replaceNode(
      dag,
      (n) => {
        calls++;
        return n.kind === 'Box';
      },
      box(9, 9, 9)
    );
    expect(calls).toBe(31);
    expect(nodeCount(edited)).toBe(31);
    // Sharing survives the rebuild: each fuse's two child slots hold the
    // same rebuilt object.
    let shared = true;
    forEachNode(edited, (n) => {
      if (n.kind === 'Fuse' && n.a !== n.b) shared = false;
    });
    expect(shared).toBe(true);
  });

  it('optimize completes on a deep shared DAG', () => {
    const dag = doublingDag(40);
    const out = optimize(dag);
    expect(nodeCount(out)).toBe(41);
  });
});
