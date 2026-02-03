import { describe, it, beforeAll } from 'vitest';
import { initOC } from '../tests/setup.js';
import { makeBox, makeCylinder, makeSphere, unwrap } from '../src/index.js';
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
        const cyl = makeCylinder(3, 10).translate([5, 5, 0]);
        unwrap(box.fuse(cyl));
      })
    );
  });

  it('box - sphere cut', async () => {
    results.push(
      await bench('box-sphere cut', () => {
        const box = makeBox([10, 10, 10]);
        const sphere = makeSphere(4).translate([5, 5, 5]);
        unwrap(box.cut(sphere));
      })
    );
  });

  it('two cylinders intersect', async () => {
    results.push(
      await bench('cylinder intersect', () => {
        const cyl1 = makeCylinder(5, 20);
        const cyl2 = makeCylinder(5, 20).translate([3, 0, 0]);
        unwrap(cyl1.intersect(cyl2));
      })
    );
  });

  it('prints results', () => {
    printResults(results);
  });
});
