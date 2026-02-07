import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  castShape,
  vertexFinder,
  getVertices,
  vertexPosition,
  isVertex,
  isOk,
  isErr,
  unwrap,
  iterVertices,
} from '../src/index.js';
import { vecDistance } from '../src/core/vecOps.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function fnBox(x = 10, y = 10, z = 10) {
  return castShape(makeBox([0, 0, 0], [x, y, z]).wrapped);
}

describe('getVertices / iterVertices', () => {
  it('finds all 8 vertices of a box', () => {
    const vertices = getVertices(fnBox());
    expect(vertices.length).toBe(8);
    expect(isVertex(vertices[0]!)).toBe(true);
  });

  it('iterVertices yields the same count', () => {
    const box = fnBox();
    const fromIter = [...iterVertices(box)];
    const fromArray = getVertices(box);
    expect(fromIter.length).toBe(fromArray.length);
  });

  it('vertex positions are within box bounds', () => {
    const vertices = getVertices(fnBox(10, 20, 30));
    for (const v of vertices) {
      const pos = vertexPosition(v);
      expect(pos[0]).toBeGreaterThanOrEqual(-0.001);
      expect(pos[0]).toBeLessThanOrEqual(10.001);
      expect(pos[1]).toBeGreaterThanOrEqual(-0.001);
      expect(pos[1]).toBeLessThanOrEqual(20.001);
      expect(pos[2]).toBeGreaterThanOrEqual(-0.001);
      expect(pos[2]).toBeLessThanOrEqual(30.001);
    }
  });
});

describe('vertexFinder', () => {
  it('finds all 8 vertices of a box', () => {
    const vertices = vertexFinder().find(fnBox());
    expect(vertices.length).toBe(8);
    expect(isVertex(vertices[0]!)).toBe(true);
  });

  it('atPosition finds origin vertex', () => {
    const vertices = vertexFinder().atPosition([0, 0, 0]).find(fnBox());
    expect(vertices.length).toBe(1);
    const pos = vertexPosition(vertices[0]!);
    expect(pos[0]).toBeCloseTo(0);
    expect(pos[1]).toBeCloseTo(0);
    expect(pos[2]).toBeCloseTo(0);
  });

  it('atPosition finds corner vertex', () => {
    const vertices = vertexFinder()
      .atPosition([10, 20, 30])
      .find(fnBox(10, 20, 30));
    expect(vertices.length).toBe(1);
    const pos = vertexPosition(vertices[0]!);
    expect(pos[0]).toBeCloseTo(10);
    expect(pos[1]).toBeCloseTo(20);
    expect(pos[2]).toBeCloseTo(30);
  });

  it('atPosition returns empty for non-existent position', () => {
    const vertices = vertexFinder().atPosition([5, 5, 5]).find(fnBox());
    expect(vertices.length).toBe(0);
  });

  it('withinBox filters vertices in a sub-region', () => {
    const vertices = vertexFinder()
      .withinBox([-1, -1, -1], [1, 1, 1])
      .find(fnBox(10, 10, 10));
    // Only the origin vertex (0,0,0) is within the box [-1,-1,-1] to [1,1,1]
    expect(vertices.length).toBe(1);
    const pos = vertexPosition(vertices[0]!);
    expect(pos[0]).toBeCloseTo(0);
    expect(pos[1]).toBeCloseTo(0);
    expect(pos[2]).toBeCloseTo(0);
  });

  it('withinBox finds all vertices when box covers entire shape', () => {
    const vertices = vertexFinder().withinBox([-1, -1, -1], [11, 11, 11]).find(fnBox());
    expect(vertices.length).toBe(8);
  });

  it('nearestTo finds closest vertex', () => {
    const box = fnBox(10, 10, 10);
    const vertices = vertexFinder().nearestTo([11, 11, 11]).find(box);
    expect(vertices.length).toBe(1);
    const pos = vertexPosition(vertices[0]!);
    expect(pos[0]).toBeCloseTo(10);
    expect(pos[1]).toBeCloseTo(10);
    expect(pos[2]).toBeCloseTo(10);
  });

  it('nearestTo with unique returns Result', () => {
    const box = fnBox(10, 10, 10);
    const result = vertexFinder().nearestTo([0, 0, 0]).find(box, { unique: true });
    expect(isOk(result)).toBe(true);
    const pos = vertexPosition(unwrap(result));
    expect(pos[0]).toBeCloseTo(0);
    expect(pos[1]).toBeCloseTo(0);
    expect(pos[2]).toBeCloseTo(0);
  });

  it('atDistance finds vertices at a given distance from origin', () => {
    const box = fnBox(10, 10, 10);
    // Distance from origin to (10,0,0) = 10
    const dist10 = vertexFinder().atDistance(10, [0, 0, 0], 0.01).find(box);
    // Vertices at distance 10 from origin: (10,0,0), (0,10,0), (0,0,10)
    expect(dist10.length).toBe(3);
  });

  it('atDistance from a non-origin point', () => {
    const box = fnBox(10, 10, 10);
    // Distance from (10,10,10) to (0,10,10) = 10
    const verts = vertexFinder().atDistance(10, [10, 10, 10], 0.01).find(box);
    // 3 vertices are at distance 10 from (10,10,10): (0,10,10), (10,0,10), (10,10,0)
    expect(verts.length).toBe(3);
  });

  it('supports when() custom predicate', () => {
    const vertices = vertexFinder()
      .when((v) => vertexPosition(v)[0] > 5)
      .find(fnBox());
    // 4 vertices have x=10
    expect(vertices.length).toBe(4);
  });

  it('supports not() for negation', () => {
    const vertices = vertexFinder()
      .not((f) => f.when((v) => vecDistance(vertexPosition(v), [0, 0, 0]) < 0.01))
      .find(fnBox());
    // 8 total minus 1 at origin = 7
    expect(vertices.length).toBe(7);
  });

  it('supports either() for OR logic', () => {
    const vertices = vertexFinder()
      .either([
        (f) => f.when((v) => vecDistance(vertexPosition(v), [0, 0, 0]) < 0.01),
        (f) => f.when((v) => vecDistance(vertexPosition(v), [10, 10, 10]) < 0.01),
      ])
      .find(fnBox());
    expect(vertices.length).toBe(2);
  });

  it('supports inList filter', () => {
    const box = fnBox();
    const allVerts = getVertices(box);
    const subset = [allVerts[0]!, allVerts[1]!];
    const found = vertexFinder().inList(subset).find(box);
    expect(found.length).toBe(2);
  });

  it('shouldKeep works on individual elements', () => {
    const finder = vertexFinder().atPosition([0, 0, 0]);
    const verts = getVertices(fnBox());
    const kept = verts.filter((v) => finder.shouldKeep(v));
    expect(kept.length).toBe(1);
  });

  it('unique returns error for multiple matches', () => {
    const result = vertexFinder().find(fnBox(), { unique: true });
    expect(isErr(result)).toBe(true);
  });

  it('unique returns error for zero matches', () => {
    const result = vertexFinder().atPosition([999, 999, 999]).find(fnBox(), { unique: true });
    expect(isErr(result)).toBe(true);
  });

  it('combines multiple filters', () => {
    const box = fnBox(10, 20, 30);
    const verts = vertexFinder()
      .withinBox([-1, -1, -1], [1, 21, 31])
      .when((v) => vertexPosition(v)[2] > 15)
      .find(box);
    // Within box: x in [-1,1] → x=0 only. z > 15 → z=30.
    // Matching vertices: (0,0,30) and (0,20,30)
    expect(verts.length).toBe(2);
  });
});
