import { describe, it, beforeAll } from 'vitest';
import { box, sphere, cylinder, translate, fuse, mesh, unwrap } from '../src/index.js';
import { initBothKernels, benchBoth } from './setup.js';
import { collectResults, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('Meshing benchmarks', () => {
  const results: BenchResult[] = [];

  it('mesh a box (trivial baseline)', async () => {
    collectResults(results, await benchBoth('mesh box', () => {
      const b = box(10, 10, 10);
      mesh(b);
    }));
  });

  it('mesh a sphere (curved)', async () => {
    collectResults(results, await benchBoth('mesh sphere', () => {
      const s = sphere(10);
      mesh(s);
    }));
  });

  it('mesh a fused result (post-boolean)', async () => {
    collectResults(results, await benchBoth('mesh fused', () => {
      const b = box(10, 10, 10);
      const cyl = translate(cylinder(3, 10), [5, 5, 0]);
      const fused = unwrap(fuse(b, cyl));
      mesh(fused);
    }));
  });

  it('mesh with fine tolerance', async () => {
    collectResults(results, await benchBoth(
      'mesh sphere fine',
      () => {
        const s = sphere(10);
        mesh(s, { tolerance: 0.1, angularTolerance: 0.05 });
      },
      { warmup: 1, iterations: 3 }
    ));
  });

  it('prints results', () => {
    printResults(results);
  });
});
