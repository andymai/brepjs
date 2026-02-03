import { describe, it, beforeAll } from 'vitest';
import { initOC } from '../tests/setup.js';
import { makeBox, makeCylinder, unwrap, castShape, meshShapeEdges, clearMeshCache } from '../src/index.js';
import { bench, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Edge mesh benchmarks', () => {
  const results: BenchResult[] = [];

  it('edge mesh a box (trivial)', async () => {
    const box = makeBox([10, 10, 10]);
    const shape = castShape(box.wrapped);
    results.push(
      await bench('edge mesh box', () => {
        meshShapeEdges(shape, { cache: false });
      })
    );
  });

  it('edge mesh a fused shape (moderate)', async () => {
    const box = makeBox([10, 10, 10]);
    const cyl = makeCylinder(3, 10).translate([5, 5, 0]);
    const fused = unwrap(box.fuse(cyl));
    const shape = castShape(fused.wrapped);
    results.push(
      await bench('edge mesh fused', () => {
        meshShapeEdges(shape, { cache: false });
      })
    );
  });

  it('repeated edge mesh of same shape (cache test)', async () => {
    clearMeshCache();
    const box = makeBox([10, 10, 10]);
    const cyl = makeCylinder(3, 10).translate([5, 5, 0]);
    const fused = unwrap(box.fuse(cyl));
    const shape = castShape(fused.wrapped);
    // First call populates cache
    meshShapeEdges(shape);
    results.push(
      await bench('edge mesh cached', () => {
        meshShapeEdges(shape);
      })
    );
  });

  it('prints results', () => {
    printResults(results);
  });
});
