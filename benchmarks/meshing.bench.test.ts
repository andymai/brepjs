import { describe, it, beforeAll } from 'vitest';
import { initOC } from '../tests/setup.js';
import { makeBox, makeSphere, makeCylinder, unwrap, castShape, meshShape } from '../src/index.js';
import { bench, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Meshing benchmarks', () => {
  const results: BenchResult[] = [];

  it('mesh a box (trivial baseline)', async () => {
    const box = makeBox([10, 10, 10]);
    results.push(
      await bench('mesh box', () => {
        box.mesh();
      })
    );
  });

  it('mesh a sphere (curved)', async () => {
    const sphere = makeSphere(10);
    results.push(
      await bench('mesh sphere', () => {
        sphere.mesh();
      })
    );
  });

  it('mesh a fused result (post-boolean)', async () => {
    const box = makeBox([10, 10, 10]);
    const cyl = makeCylinder(3, 10).translate([5, 5, 0]);
    const fused = unwrap(box.fuse(cyl));
    results.push(
      await bench('mesh fused', () => {
        fused.mesh();
      })
    );
  });

  it('mesh with fine tolerance', async () => {
    const sphere = makeSphere(10);
    results.push(
      await bench(
        'mesh sphere fine',
        () => {
          sphere.mesh({ tolerance: 0.1, angularTolerance: 0.05 });
        },
        { warmup: 1, iterations: 3 }
      )
    );
  });

  it('prints results', () => {
    printResults(results);
  });
});
