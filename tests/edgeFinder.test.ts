import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { box, unwrap, getFaces, curveLength, edgeFinder } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('EdgeFinder extra coverage', () => {
  it('ofLength with predicate via when()', () => {
    const b = box(10, 20, 30);
    const edges = edgeFinder()
      .when((e) => curveLength(e) > 15)
      .findAll(b);
    // edges of length 20 (4) and 30 (4) = 8
    expect(edges.length).toBe(8);
  });

  it('ofCurveType LINE on box finds all', () => {
    const b = box(10, 10, 10);
    expect(edgeFinder().ofCurveType('LINE').findAll(b).length).toBe(12);
  });

  it('ofCurveType CIRCLE finds none on box', () => {
    const b = box(10, 10, 10);
    expect(edgeFinder().ofCurveType('CIRCLE').findAll(b).length).toBe(0);
  });

  it('parallelTo X', () => {
    const b = box(10, 20, 30);
    expect(edgeFinder().parallelTo('X').findAll(b).length).toBe(4);
  });

  it('parallelTo Y', () => {
    const b = box(10, 20, 30);
    expect(edgeFinder().parallelTo('Y').findAll(b).length).toBe(4);
  });

  it('parallelTo Z', () => {
    const b = box(10, 20, 30);
    expect(edgeFinder().parallelTo('Z').findAll(b).length).toBe(4);
  });

  it('atDistance from origin', () => {
    const b = box(10, 20, 30);
    const edges = edgeFinder().atDistance(0, [0, 0, 0]).findAll(b);
    // 3 edges pass through origin
    expect(edges.length).toBe(3);
  });

  it('when() custom filter', () => {
    const b = box(10, 20, 30);
    const edges = edgeFinder()
      .when((e) => curveLength(e) > 25)
      .findAll(b);
    expect(edges.length).toBe(4);
  });
});
