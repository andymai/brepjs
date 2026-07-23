import { describe, it, expect } from 'vitest';
import { meshEdges } from './meshOps.js';
import type { BrepkitKernel } from './brepkitWasmTypes.js';
import { vec3At } from '@/utils/vec3.js';

/**
 * brepkit returns one polyline per edge; `lines` is consumed as GL_LINES.
 * Two edges here: a 2-point straight edge and a 3-point (odd) polyline. The
 * odd count is what used to leak a segment across the edge boundary.
 */
function stubKernel(): BrepkitKernel {
  const partial: Partial<BrepkitKernel> = {
    meshEdgesAll: () => ({
      positions: new Float64Array([
        0,
        0,
        0,
        1,
        0,
        0, // edge 0: straight, 2 points
        5,
        0,
        0,
        5,
        1,
        0,
        5,
        2,
        0, // edge 1: 3 points (odd)
      ]),
      offsets: new Uint32Array([0, 6]),
      edgeCount: 2,
    }),
  };
  return partial as BrepkitKernel;
}

// `KernelShape` is an opaque `any`, so the handle needs no assertion.
const shape = { __brepkit: true, type: 'solid', id: 1 };

describe('brepkit meshEdges', () => {
  it('expands per-edge polylines into disjoint segment pairs', () => {
    const { lines } = meshEdges(stubKernel(), shape, 0.1, 0.35);
    // edge 0 -> 1 segment, edge 1 -> 2 segments; 3 segments = 6 vertices.
    expect(Array.from(lines)).toEqual([0, 0, 0, 1, 0, 0, 5, 0, 0, 5, 1, 0, 5, 1, 0, 5, 2, 0]);
  });

  it('never joins the end of one edge to the start of the next', () => {
    const { lines } = meshEdges(stubKernel(), shape, 0.1, 0.35);
    for (let i = 0; i < lines.length; i += 6) {
      const [ax, ay, az] = vec3At(lines, i);
      const [bx, by, bz] = vec3At(lines, i + 3);
      // The leaked segment ran from (1,0,0) to (5,0,0): length 4.
      expect(Math.hypot(bx - ax, by - ay, bz - az)).toBeLessThan(2);
    }
  });

  it('drops degenerate pairs, matching the occtWasm adapter', () => {
    const partial: Partial<BrepkitKernel> = {
      meshEdgesAll: () => ({
        // A repeated point mid-polyline yields a zero-length segment.
        positions: new Float64Array([0, 0, 0, 1, 0, 0, 1, 0, 0, 2, 0, 0]),
        offsets: new Uint32Array([0]),
        edgeCount: 1,
      }),
    };
    const { lines } = meshEdges(partial as BrepkitKernel, shape, 0.1, 0.35);
    expect(Array.from(lines)).toEqual([0, 0, 0, 1, 0, 0, 1, 0, 0, 2, 0, 0]);
  });

  it('reports edgeGroups indexing the expanded buffer', () => {
    const { lines, edgeGroups } = meshEdges(stubKernel(), shape, 0.1, 0.35);
    expect(edgeGroups).toEqual([
      { start: 0, count: 2, edgeHash: 0 },
      { start: 2, count: 4, edgeHash: 1 },
    ]);
    const last = edgeGroups[edgeGroups.length - 1];
    expect((last?.start ?? 0) + (last?.count ?? 0)).toBe(lines.length / 3);
  });
});
