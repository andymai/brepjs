import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  createNamedPlane,
  unwrap,
  getFaces,
  curveLength,
  edgeFinder,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('EdgeFinder extra coverage', () => {
  it('ofLength with predicate via when()', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const edges = edgeFinder()
      .when((e) => curveLength(e) > 15)
      .findAll(box);
    // edges of length 20 (4) and 30 (4) = 8
    expect(edges.length).toBe(8);
  });

  it('ofCurveType LINE on box finds all', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    expect(edgeFinder().ofCurveType('LINE').findAll(box).length).toBe(12);
  });

  it('ofCurveType CIRCLE finds none on box', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    expect(edgeFinder().ofCurveType('CIRCLE').findAll(box).length).toBe(0);
  });

  it('parallelTo X', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    expect(edgeFinder().parallelTo('X').findAll(box).length).toBe(4);
  });

  it('parallelTo Y', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    expect(edgeFinder().parallelTo('Y').findAll(box).length).toBe(4);
  });

  it('parallelTo Z', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    expect(edgeFinder().parallelTo('Z').findAll(box).length).toBe(4);
  });

  it('atDistance from origin', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const edges = edgeFinder().atDistance(0, [0, 0, 0]).findAll(box);
    // 3 edges pass through origin
    expect(edges.length).toBe(3);
  });

  it('when() custom filter', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const edges = edgeFinder()
      .when((e) => curveLength(e) > 25)
      .findAll(box);
    expect(edges.length).toBe(4);
  });
});
