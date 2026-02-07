import { describe, it, beforeAll } from 'vitest';
import { initOC } from '../tests/setup.js';
import { makeBox, makeSphere, makeCylinder, unwrap, castShape, meshShape } from '../src/index.js';
import { translateShape } from '../src/topology/shapeFns.js';
import { fuseShape } from '../src/topology/booleanFns.js';
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
        meshShape(box as any);
      })
    );
  });

  it('mesh a sphere (curved)', async () => {
    const sphere = makeSphere(10);
    results.push(
      await bench('mesh sphere', () => {
        meshShape(sphere as any);
      })
    );
  });

  it('mesh a fused result (post-boolean)', async () => {
    const box = makeBox([10, 10, 10]);
    const cyl = translateShape(makeCylinder(3, 10) as any, [5, 5, 0]);
    const fused = unwrap(fuseShape(box as any, cyl));
    results.push(
      await bench('mesh fused', () => {
        meshShape(fused as any);
      })
    );
  });

  it('mesh with fine tolerance', async () => {
    const sphere = makeSphere(10);
    results.push(
      await bench(
        'mesh sphere fine',
        () => {
          meshShape(sphere as any, { tolerance: 0.1, angularTolerance: 0.05 });
        },
        { warmup: 1, iterations: 3 }
      )
    );
  });

  it('prints results', () => {
    printResults(results);
  });
});
