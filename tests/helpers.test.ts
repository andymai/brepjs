import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { makeBox, unwrap, isErr, getEdges, curveLength } from '../src/index.js';
import { EdgeFinder } from '../src/query/edgeFinder.js';
import { FaceFinder } from '../src/query/faceFinder.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('EdgeFinder', () => {
  it('finds all edges of a box', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const finder = new EdgeFinder();
    const edges = finder.find(box);
    expect(edges.length).toBe(12);
  });

  it('filters edges by direction', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const finder = new EdgeFinder().inDirection('Z');
    const edges = finder.find(box);
    // A box has 4 vertical edges
    expect(edges.length).toBe(4);
  });

  it('filters edges parallel to a plane', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const finder = new EdgeFinder().parallelTo('XY');
    const edges = finder.find(box);
    // parallelTo('XY') finds edges perpendicular to Z normal = X + Y direction edges = 8
    expect(edges.length).toBe(8);
  });

  it('filters edges by curve type', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const finder = new EdgeFinder().ofCurveType('LINE');
    const edges = finder.find(box);
    // All edges of a box are lines
    expect(edges.length).toBe(12);
  });

  it('filters edges by length', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const finder = new EdgeFinder().ofLength(10);
    const edges = finder.find(box);
    // 4 edges of length 10
    expect(edges.length).toBe(4);
  });

  it('combines filters with AND logic', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const finder = new EdgeFinder().inDirection('Z').ofLength(30);
    const edges = finder.find(box);
    expect(edges.length).toBe(4);
  });

  it('supports either() for OR logic', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const finder = new EdgeFinder().either([(f) => f.ofLength(10), (f) => f.ofLength(20)]);
    const edges = finder.find(box);
    // 4 edges of length 10 + 4 edges of length 20
    expect(edges.length).toBe(8);
  });

  it('supports not() for negation', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const finder = new EdgeFinder().not((f) => f.inDirection('Z'));
    const edges = finder.find(box);
    // 12 total - 4 Z-direction = 8
    expect(edges.length).toBe(8);
  });

  it('finds unique edge', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    // There's only one edge that is length-10 and in the X direction at distance 0 from origin
    const finder = new EdgeFinder().inDirection('X').atDistance(0, [0, 0, 0]);
    const edge = unwrap(finder.find(box, { unique: true }));
    expect(edge).toBeDefined();
    expect(curveLength(edge)).toBeCloseTo(10, 5);
  });

  it('throws when unique finds multiple', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const finder = new EdgeFinder().inDirection('Z');
    const result = finder.find(box, { unique: true });
    expect(isErr(result)).toBe(true);
  });

  it('supports inList filter', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const allEdges = getEdges(box);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const subset = [allEdges[0]!, allEdges[1]!];
    const finder = new EdgeFinder().inList(subset);
    const found = finder.find(box);
    expect(found.length).toBe(2);
  });
});

describe('FaceFinder', () => {
  it('finds all faces of a box', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const finder = new FaceFinder();
    const faces = finder.find(box);
    expect(faces.length).toBe(6);
  });

  it('filters faces by normal direction', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const finder = new FaceFinder().atAngleWith('Z');
    const faces = finder.find(box);
    // Top and bottom faces (normal aligned with Z)
    expect(faces.length).toBe(2);
  });

  it('supports atDistance filter', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const finder = new FaceFinder().atDistance(0, [0, 0, 0]);
    const faces = finder.find(box);
    // 3 faces pass through origin (XY, XZ, YZ planes)
    expect(faces.length).toBe(3);
  });

  it('supports withinDistance filter', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const finder = new FaceFinder().withinDistance(5, [5, 5, 5]);
    const faces = finder.find(box);
    // All 6 faces are within 5 of the center
    expect(faces.length).toBe(6);
  });

  it('supports inBox filter', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const finder = new FaceFinder().inBox([-1, -1, -1], [11, 11, 11]);
    const faces = finder.find(box);
    // All faces within the bounding box
    expect(faces.length).toBe(6);
  });

  it('filters faces by surface type', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const finder = new FaceFinder().ofSurfaceType('PLANE');
    const faces = finder.find(box);
    expect(faces.length).toBe(6);
  });
});
