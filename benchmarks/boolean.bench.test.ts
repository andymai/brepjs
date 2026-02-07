import { describe, it, beforeAll } from 'vitest';
import { initOC } from '../tests/setup.js';
import { makeBox, makeCylinder, makeSphere, unwrap } from '../src/index.js';
import { translateShape } from '../src/topology/shapeFns.js';
import { fuseShapes, cutShape, intersectShapes } from '../src/topology/booleanFns.js';
import { bench, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Boolean operation benchmarks', () => {
  const results: BenchResult[] = [];

  it('box + cylinder fuse', async () => {
    results.push(
      await bench('box+cylinder fuse', () => {
        const box = makeBox([10, 10, 10]);
        const cyl = translateShape(makeCylinder(3, 10) as any, [5, 5, 0]);
        unwrap(fuseShapes(box as any, cyl));
      })
    );
  });

  it('box - sphere cut', async () => {
    results.push(
      await bench('box-sphere cut', () => {
        const box = makeBox([10, 10, 10]);
        const sphere = translateShape(makeSphere(4) as any, [5, 5, 5]);
        unwrap(cutShape(box as any, sphere));
      })
    );
  });

  it('two cylinders intersect', async () => {
    results.push(
      await bench('cylinder intersect', () => {
        const cyl1 = makeCylinder(5, 20);
        const cyl2 = translateShape(makeCylinder(5, 20) as any, [3, 0, 0]);
        unwrap(intersectShapes(cyl1 as any, cyl2));
      })
    );
  });

  it('prints results', () => {
    printResults(results);
  });
});
