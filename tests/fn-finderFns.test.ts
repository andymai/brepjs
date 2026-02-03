import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  // functional API
  castShape,
  edgeFinder,
  faceFinder,
  getEdges,
  isOk,
  isErr,
  unwrap,
  fnIsEdge,
  fnIsFace,
  curveLength,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function fnBox(x = 10, y = 10, z = 10) {
  return castShape(makeBox([x, y, z]).wrapped);
}

describe('edgeFinder', () => {
  it('finds all 12 edges of a box', () => {
    const edges = edgeFinder().find(fnBox());
    expect(edges.length).toBe(12);
    expect(fnIsEdge(edges[0]!)).toBe(true);
  });

  it('filters edges by direction', () => {
    const edges = edgeFinder()
      .inDirection('Z')
      .find(fnBox(10, 20, 30));
    expect(edges.length).toBe(4);
  });

  it('filters edges by length', () => {
    const edges = edgeFinder()
      .ofLength(10)
      .find(fnBox(10, 20, 30));
    expect(edges.length).toBe(4);
  });

  it('filters edges by curve type', () => {
    const edges = edgeFinder().ofCurveType('LINE').find(fnBox());
    expect(edges.length).toBe(12);
  });

  it('filters edges parallel to Z', () => {
    const edges = edgeFinder()
      .parallelTo('Z')
      .find(fnBox(10, 20, 30));
    expect(edges.length).toBe(4);
  });

  it('combines filters with AND logic', () => {
    const edges = edgeFinder()
      .inDirection('Z')
      .ofLength(30)
      .find(fnBox(10, 20, 30));
    expect(edges.length).toBe(4);
  });

  it('supports either() for OR logic', () => {
    const edges = edgeFinder()
      .either([
        (f) => f.when((e) => Math.abs(curveLength(e) - 10) < 0.01),
        (f) => f.when((e) => Math.abs(curveLength(e) - 20) < 0.01),
      ])
      .find(fnBox(10, 20, 30));
    expect(edges.length).toBe(8);
  });

  it('supports not() for negation', () => {
    // Negate edges of length 30 (the Z-direction edges)
    const edges = edgeFinder()
      .not((f) => f.when((e) => Math.abs(curveLength(e) - 30) < 0.01))
      .find(fnBox(10, 20, 30));
    expect(edges.length).toBe(8);
  });

  it('supports inList filter', () => {
    const box = fnBox();
    const allEdges = getEdges(box);
    const subset = [allEdges[0]!, allEdges[1]!];
    const found = edgeFinder().inList(subset).find(box);
    expect(found.length).toBe(2);
  });

  it('supports when() custom predicate', () => {
    const edges = edgeFinder()
      .when(() => true)
      .find(fnBox());
    expect(edges.length).toBe(12);
  });

  it('finds unique edge', () => {
    const box = fnBox(10, 20, 30);
    const result = edgeFinder()
      .inDirection('X')
      .atDistance(0, [0, 0, 0])
      .find(box, { unique: true });
    expect(isOk(result)).toBe(true);
  });

  it('returns error when unique finds multiple', () => {
    const result = edgeFinder().inDirection('Z').find(fnBox(), { unique: true });
    expect(isErr(result)).toBe(true);
  });

  it('returns error when unique finds zero', () => {
    // Use impossible filter: length 999 on a 10x10x10 box
    const result = edgeFinder().ofLength(999).find(fnBox(), { unique: true });
    expect(isErr(result)).toBe(true);
  });

  it('shouldKeep works on individual elements', () => {
    const finder = edgeFinder().ofLength(10);
    const edges = getEdges(fnBox(10, 20, 30));
    const kept = edges.filter((e) => finder.shouldKeep(e));
    expect(kept.length).toBe(4);
  });
});

describe('faceFinder', () => {
  it('finds all 6 faces of a box', () => {
    const faces = faceFinder().find(fnBox());
    expect(faces.length).toBe(6);
    expect(fnIsFace(faces[0]!)).toBe(true);
  });

  it('filters faces by normal direction', () => {
    const faces = faceFinder()
      .inDirection('Z')
      .find(fnBox(10, 20, 30));
    expect(faces.length).toBe(2);
  });

  it('filters faces parallel to Z', () => {
    const faces = faceFinder()
      .parallelTo('Z')
      .find(fnBox(10, 20, 30));
    expect(faces.length).toBe(2);
  });

  it('filters faces by surface type', () => {
    const faces = faceFinder().ofSurfaceType('PLANE').find(fnBox());
    expect(faces.length).toBe(6);
  });

  it('supports atDistance filter', () => {
    const faces = faceFinder().atDistance(0, [0, 0, 0]).find(fnBox());
    // 3 faces pass through origin
    expect(faces.length).toBe(3);
  });

  it('supports not() for negation', () => {
    // First find faces in Z direction, then negate
    const zFaces = faceFinder()
      .inDirection('Z')
      .find(fnBox(10, 20, 30));
    const allFaces = faceFinder().find(fnBox(10, 20, 30));
    // Use when() inside not() since the inner finder is a base ShapeFinder
    const notZFaces = faceFinder()
      .not((f) => f.when(() => false)) // Not removing any = all pass
      .find(fnBox(10, 20, 30));
    expect(notZFaces.length).toBe(6); // not(none) = all
    expect(zFaces.length).toBe(2);
    expect(allFaces.length).toBe(6);
  });

  it('supports when() with custom predicate', () => {
    let callCount = 0;
    const faces = faceFinder()
      .when((face) => {
        callCount++;
        return true; // Accept all faces
      })
      .find(fnBox());
    expect(faces.length).toBe(6);
    expect(callCount).toBe(6); // Predicate called for each face
  });

  it('supports inList() to filter from specific faces', () => {
    const box = fnBox();
    const allFaces = faceFinder().find(box);
    // Create a list with just the first 2 faces
    const subset = [allFaces[0]!, allFaces[1]!];
    const filtered = faceFinder().inList(subset).find(box);
    expect(filtered.length).toBe(2);
  });
});
