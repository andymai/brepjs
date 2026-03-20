import { describe, it, beforeAll } from 'vitest';
import {
  box,
  cylinder,
  translate,
  fuse,
  unwrap,
  getEdges,
  getFaces,
  getWires,
  getVertices,
  edgeFinder,
  faceFinder,
  adjacentFaces,
} from '../src/index.js';
import { initBothKernels, benchBoth } from './setup.js';
import { collectResults, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('Topology iteration benchmarks', () => {
  const results: BenchResult[] = [];

  it('getEdges() on a box (12 edges)', async () => {
    collectResults(
      results,
      await benchBoth('getEdges(box)', () => {
        const b = box(10, 10, 10);
        getEdges(b);
      })
    );
  });

  it('getFaces() on a box (6 faces)', async () => {
    collectResults(
      results,
      await benchBoth('getFaces(box)', () => {
        const b = box(10, 10, 10);
        getFaces(b);
      })
    );
  });

  it('getEdges() on a fused complex shape', async () => {
    collectResults(
      results,
      await benchBoth('getEdges(fused)', () => {
        const b = box(10, 10, 10);
        const cyl = translate(cylinder(3, 10), [5, 5, 0]);
        const fused = unwrap(fuse(b, cyl));
        getEdges(fused);
      })
    );
  });

  it('getFaces() on a fused complex shape', async () => {
    collectResults(
      results,
      await benchBoth('getFaces(fused)', () => {
        const b = box(10, 10, 10);
        const cyl = translate(cylinder(3, 10), [5, 5, 0]);
        const fused = unwrap(fuse(b, cyl));
        getFaces(fused);
      })
    );
  });

  it('prints results', () => {
    printResults(results);
  });
});

describe('Cache hit benchmarks — repeated queries on same shape', () => {
  const results: BenchResult[] = [];

  it('edgeFinder().findAll() cold vs cached (box)', async () => {
    // Cold: create shape + find edges (no cache)
    collectResults(
      results,
      await benchBoth('edgeFinder cold (box)', () => {
        const b = box(10, 10, 10);
        edgeFinder().findAll(b);
      })
    );

    // Cached: pre-populate cache, then run finder 10x
    collectResults(
      results,
      await benchBoth('edgeFinder cached 10x (box)', () => {
        const b = box(10, 10, 10);
        getEdges(b); // warm the cache
        for (let i = 0; i < 10; i++) {
          edgeFinder().findAll(b);
        }
      })
    );
  });

  it('faceFinder().findAll() cold vs cached (fused)', async () => {
    collectResults(
      results,
      await benchBoth('faceFinder cold (fused)', () => {
        const b = box(10, 10, 10);
        const cyl = translate(cylinder(3, 10), [5, 5, 0]);
        const fused = unwrap(fuse(b, cyl));
        faceFinder().findAll(fused);
      })
    );

    collectResults(
      results,
      await benchBoth('faceFinder cached 10x (fused)', () => {
        const b = box(10, 10, 10);
        const cyl = translate(cylinder(3, 10), [5, 5, 0]);
        const fused = unwrap(fuse(b, cyl));
        getFaces(fused); // warm the cache
        for (let i = 0; i < 10; i++) {
          faceFinder().findAll(fused);
        }
      })
    );
  });

  it('multi-query pattern (getEdges + getFaces + getWires + getVertices)', async () => {
    collectResults(
      results,
      await benchBoth('all topo queries (box)', () => {
        const b = box(10, 10, 10);
        getEdges(b);
        getFaces(b);
        getWires(b);
        getVertices(b);
        // Second round hits cache
        getEdges(b);
        getFaces(b);
        getWires(b);
        getVertices(b);
      })
    );
  });

  it('adjacentFaces repeated calls (same parent)', async () => {
    collectResults(
      results,
      await benchBoth('adjacentFaces 6x (box)', () => {
        const b = box(10, 10, 10);
        const faces = getFaces(b);
        // Query adjacency for each face — second+ calls reuse cached map
        for (const f of faces) {
          adjacentFaces(b, f);
        }
      })
    );
  });

  it('prints results', () => {
    printResults(results);
  });
});
