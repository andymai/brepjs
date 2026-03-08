import { describe, it, beforeAll } from 'vitest';
import { box, cylinder, sphere, translate, fuse, cut, intersect, unwrap } from '../src/index.js';
import { initBothKernels, benchBoth } from './setup.js';
import { collectResults, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('Boolean operation benchmarks', () => {
  const results: BenchResult[] = [];

  it('box + cylinder fuse', async () => {
    collectResults(results, await benchBoth('box+cylinder fuse', () => {
      const b = box(10, 10, 10);
      const cyl = translate(cylinder(3, 10), [5, 5, 0]);
      unwrap(fuse(b, cyl));
    }));
  });

  it('box - sphere cut', async () => {
    collectResults(results, await benchBoth('box-sphere cut', () => {
      const b = box(10, 10, 10);
      const s = translate(sphere(4), [5, 5, 5]);
      unwrap(cut(b, s));
    }));
  });

  it('two cylinders intersect', async () => {
    collectResults(results, await benchBoth('cylinder intersect', () => {
      const cyl1 = cylinder(5, 20);
      const cyl2 = translate(cylinder(5, 20), [3, 0, 0]);
      unwrap(intersect(cyl1, cyl2));
    }));
  });

  it('prints results', () => {
    printResults(results);
  });
});
