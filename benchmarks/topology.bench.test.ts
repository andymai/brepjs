import { describe, it, beforeAll } from 'vitest';
import { initOC } from '../tests/setup.js';
import { makeBox, makeCylinder, unwrap, castShape, getEdges, getFaces } from '../src/index.js';
import { translateShape } from '../src/topology/shapeFns.js';
import { fuseShapes } from '../src/topology/booleanFns.js';
import { bench, printResults, type BenchResult } from './harness.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Topology iteration benchmarks', () => {
  const results: BenchResult[] = [];

  it('.edges on a box (12 edges)', async () => {
    const box = makeBox([10, 10, 10]);
    results.push(
      await bench('box .edges', () => {
        box.edges;
      })
    );
  });

  it('.faces on a box (6 faces)', async () => {
    const box = makeBox([10, 10, 10]);
    results.push(
      await bench('box .faces', () => {
        box.faces;
      })
    );
  });

  it('.edges on a fused complex shape', async () => {
    const box = makeBox([10, 10, 10]);
    const cyl = translateShape(makeCylinder(3, 10) as any, [5, 5, 0]);
    const fused = unwrap(fuseShapes(box as any, cyl));
    results.push(
      await bench('fused .edges', () => {
        fused.edges;
      })
    );
  });

  it('getEdges() standalone on a box', async () => {
    const box = makeBox([10, 10, 10]);
    const shape = castShape(box.wrapped);
    results.push(
      await bench('getEdges(box)', () => {
        getEdges(shape);
      })
    );
  });

  it('getFaces() standalone on a box', async () => {
    const box = makeBox([10, 10, 10]);
    const shape = castShape(box.wrapped);
    results.push(
      await bench('getFaces(box)', () => {
        getFaces(shape);
      })
    );
  });

  it('getEdges() on fused complex shape', async () => {
    const box = makeBox([10, 10, 10]);
    const cyl = translateShape(makeCylinder(3, 10) as any, [5, 5, 0]);
    const fused = unwrap(fuseShapes(box as any, cyl));
    const shape = castShape(fused.wrapped);
    results.push(
      await bench('getEdges(fused)', () => {
        getEdges(shape);
      })
    );
  });

  it('prints results', () => {
    printResults(results);
  });
});
