import { describe, it, beforeAll } from 'vitest';
import { box, cylinder, translate, fuse, unwrap, getEdges, getFaces } from '../src/index.js';
import { initBothKernels, benchBoth } from './setup.js';
import { collectResults, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('Topology iteration benchmarks', () => {
  const results: BenchResult[] = [];

  it('getEdges() on a box (12 edges)', async () => {
    collectResults(results, await benchBoth('getEdges(box)', () => {
      const b = box(10, 10, 10);
      getEdges(b);
    }));
  });

  it('getFaces() on a box (6 faces)', async () => {
    collectResults(results, await benchBoth('getFaces(box)', () => {
      const b = box(10, 10, 10);
      getFaces(b);
    }));
  });

  it('getEdges() on a fused complex shape', async () => {
    collectResults(results, await benchBoth('getEdges(fused)', () => {
      const b = box(10, 10, 10);
      const cyl = translate(cylinder(3, 10), [5, 5, 0]);
      const fused = unwrap(fuse(b, cyl));
      getEdges(fused);
    }));
  });

  it('getFaces() on a fused complex shape', async () => {
    collectResults(results, await benchBoth('getFaces(fused)', () => {
      const b = box(10, 10, 10);
      const cyl = translate(cylinder(3, 10), [5, 5, 0]);
      const fused = unwrap(fuse(b, cyl));
      getFaces(fused);
    }));
  });

  it('prints results', () => {
    printResults(results);
  });
});
