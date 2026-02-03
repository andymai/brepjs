import { describe, it, beforeAll } from 'vitest';
import { initOC } from '../tests/setup.js';
import { makeBox, makeCylinder, unwrap } from '../src/index.js';
import { bench, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Full model benchmark — bracket', () => {
  const results: BenchResult[] = [];

  it('bracket: box + boss + hole cut + fillet + mesh', async () => {
    results.push(
      await bench(
        'bracket model',
        () => {
          // Base plate
          const base = makeBox([40, 20, 5]);

          // Boss (cylinder on top)
          const boss = makeCylinder(6, 10).translate([20, 10, 5]);
          const withBoss = unwrap(base.fuse(boss));

          // Hole through boss
          const hole = makeCylinder(3, 15).translate([20, 10, 0]);
          const withHole = unwrap(withBoss.cut(hole));

          // Fillet top edges
          const filleted = unwrap(withHole.fillet(1));

          // Mesh for rendering
          filleted.mesh();
        },
        { warmup: 1, iterations: 3 }
      )
    );
  });

  it('prints results', () => {
    printResults(results);
  });
});
