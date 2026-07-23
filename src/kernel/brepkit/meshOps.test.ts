import { describe, it, expect } from 'vitest';
import { meshEdges } from './meshOps.js';
import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { KernelShape } from '../types.js';

/**
 * brepkit returns one polyline per edge; `lines` is consumed as GL_LINES.
 * Two edges: a 2-point straight edge and a 3-point (odd) polyline. The odd
 * count is what used to leak a segment across the edge boundary.
 */
function stubKernel(): BrepkitKernel {
  return {
    meshEdgesAll: () => ({
      positions: new Float32Array([
        0, 0, 0, 1, 0, 0, // edge 0: straight, 2 points
        5, 0, 0, 5, 1, 0, 5, 2, 0, // edge 1: 3 points (odd)
      ]),
      offsets: new Uint32Array([0, 6]),
      edgeCount: 2,
    }),
  } as unknown as BrepkitKernel;
}

describe('brepkit meshEdges', () => {
  const shape = { __brepkit: true, type: 'solid', id: 1 } as unknown as KernelShape;

  it('expands per-edge polylines into disjoint segment pairs', () => {
    const { lines } = meshEdges(stubKernel(), shape, 0.1, 0.35);
    // edge 0 -> 1 segment, edge 1 -> 2 segments; 3 segments = 6 vertices.
    expect(Array.from(lines)).toEqual([
      0, 0, 0, 1, 0, 0,
      5, 0, 0, 5, 1, 0,
      5, 1, 0, 5, 2, 0,
    ]);
  });

  it('never joins one edge to the next', () => {
    const { lines } = meshEdges(stubKernel(), shape, 0.1, 0.35);
    for (let i = 0; i < lines.length; i += 6) {
      const [ax, ay, az, bx, by, bz] = [
        lines[i]!, lines[i + 1]!, lines[i + 2]!,
        lines[i + 3]!, lines[i + 4]!, lines[i + 5]!,
      ];
      const len = Math.hypot(bx - ax, by - ay, bz - az);
      // The stray segment would run from (1,0,0) to (5,0,0): length 4.
      expect(len).toBeLessThan(2);
    }
  });

  it('reports edgeGroups indexing the expanded buffer', () => {
    const { lines, edgeGroups } = meshEdges(stubKernel(), shape, 0.1, 0.35);
    expect(edgeGroups).toEqual([
      { start: 0, count: 2, edgeHash: 0 },
      { start: 2, count: 4, edgeHash: 1 },
    ]);
    const last = edgeGroups[edgeGroups.length - 1]!;
    expect(last.start + last.count).toBe(lines.length / 3);
  });
});
