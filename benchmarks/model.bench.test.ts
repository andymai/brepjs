import { describe, it, beforeAll } from 'vitest';
import { box, cylinder, translate, fuse, cut, fillet, mesh, unwrap } from '../src/index.js';
import { initBothKernels, benchBoth } from './setup.js';
import { collectResults, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('Full model benchmark — bracket', () => {
  const results: BenchResult[] = [];

  it('bracket: box + boss + hole cut + fillet + mesh', async () => {
    collectResults(results, await benchBoth(
      'bracket model',
      () => {
        // Base plate
        const base = box(40, 20, 5);

        // Boss (cylinder on top)
        const boss = translate(cylinder(6, 10), [20, 10, 5]);
        const withBoss = unwrap(fuse(base, boss));

        // Hole through boss
        const hole = translate(cylinder(3, 15), [20, 10, 0]);
        const withHole = unwrap(cut(withBoss, hole));

        // Fillet top edges
        const filleted = unwrap(fillet(withHole, 1));

        // Mesh for rendering
        mesh(filleted);
      },
      { warmup: 1, iterations: 3 }
    ));
  });

  it('prints results', () => {
    printResults(results);
  });
});
