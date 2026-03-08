import { describe, it, beforeAll } from 'vitest';
import { box, cylinder, translate, fuse, meshEdges, clearMeshCache, unwrap } from '../src/index.js';
import { initBothKernels, benchBoth } from './setup.js';
import { collectResults, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('Edge mesh benchmarks', () => {
  const results: BenchResult[] = [];

  it('edge mesh a box (trivial)', async () => {
    const b = box(10, 10, 10);
    collectResults(results, await benchBoth('edge mesh box', () => {
      meshEdges(b, { cache: false });
    }));
  });

  it('edge mesh a fused shape (moderate)', async () => {
    const b = box(10, 10, 10);
    const cyl = translate(cylinder(3, 10), [5, 5, 0]);
    const fused = unwrap(fuse(b, cyl));
    collectResults(results, await benchBoth('edge mesh fused', () => {
      meshEdges(fused, { cache: false });
    }));
  });

  it('repeated edge mesh of same shape (cache test)', async () => {
    clearMeshCache();
    const b = box(10, 10, 10);
    const cyl = translate(cylinder(3, 10), [5, 5, 0]);
    const fused = unwrap(fuse(b, cyl));
    // First call populates cache
    meshEdges(fused);
    collectResults(results, await benchBoth('edge mesh cached', () => {
      meshEdges(fused);
    }));
  });

  it('prints results', () => {
    printResults(results);
  });
});
