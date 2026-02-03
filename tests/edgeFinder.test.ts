import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { makeBox, EdgeFinder, Plane } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('EdgeFinder extra coverage', () => {
  it('ofLength with predicate function', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const edges = new EdgeFinder().ofLength((l) => l > 15).find(box);
    // edges of length 20 (4) and 30 (4) = 8
    expect(edges.length).toBe(8);
  });

  it('ofCurveType LINE on box finds all', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    expect(new EdgeFinder().ofCurveType('LINE').find(box).length).toBe(12);
  });

  it('ofCurveType CIRCLE finds none on box', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    expect(new EdgeFinder().ofCurveType('CIRCLE').find(box).length).toBe(0);
  });

  it('parallelTo XY string', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    expect(new EdgeFinder().parallelTo('XY').find(box).length).toBe(8);
  });

  it('parallelTo XZ string', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    expect(new EdgeFinder().parallelTo('XZ').find(box).length).toBe(8);
  });

  it('parallelTo YZ string', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    expect(new EdgeFinder().parallelTo('YZ').find(box).length).toBe(8);
  });

  it('parallelTo Plane object', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const plane = new Plane([0, 0, 0], null, [0, 0, 1]);
    expect(new EdgeFinder().parallelTo(plane).find(box).length).toBe(8);
  });

  it('parallelTo a face', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const topFace = box.faces[0]!;
    const edges = new EdgeFinder().parallelTo(topFace).find(box);
    expect(edges.length).toBeGreaterThan(0);
  });

  it('inPlane XY at origin', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const edges = new EdgeFinder().inPlane('XY').find(box);
    expect(edges.length).toBe(4);
  });

  it('inPlane XY at height 30', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const edges = new EdgeFinder().inPlane('XY', 30).find(box);
    expect(edges.length).toBe(4);
  });

  it('inPlane with Plane object', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const plane = new Plane([0, 0, 0], null, [0, 0, 1]);
    const edges = new EdgeFinder().inPlane(plane).find(box);
    expect(edges.length).toBe(4);
  });

  it('containsPoint finds edges through origin', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const edges = new EdgeFinder().containsPoint([0, 0, 0]).find(box);
    expect(edges.length).toBe(3);
  });

  it('when() custom filter', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const edges = new EdgeFinder().when(({ element }) => element.length > 25).find(box);
    expect(edges.length).toBe(4);
  });

  it('inBox filter', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    // small box around just the origin area - should find edges near origin
    const edges = new EdgeFinder().inBox([-1, -1, -1], [1, 1, 1]).find(box);
    expect(edges.length).toBe(3);
  });
});
