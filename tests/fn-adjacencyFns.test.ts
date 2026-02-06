import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeSphere,
  getEdges,
  getFaces,
  facesOfEdge,
  edgesOfFace,
  wiresOfFace,
  verticesOfEdge,
  adjacentFaces,
  sharedEdges,
  isSameShape,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('facesOfEdge', () => {
  it('returns exactly 2 faces for an interior edge of a box', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const edges = getEdges(box);
    // Every edge of a box borders exactly 2 faces
    const faces = facesOfEdge(box, edges[0]!);
    expect(faces).toHaveLength(2);
  });

  it('returns faces that are different from each other', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const edges = getEdges(box);
    const faces = facesOfEdge(box, edges[0]!);
    expect(isSameShape(faces[0]!, faces[1]!)).toBe(false);
  });
});

describe('edgesOfFace', () => {
  it('returns 4 edges for a box face', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const faces = getFaces(box);
    const edges = edgesOfFace(faces[0]!);
    expect(edges).toHaveLength(4);
  });

  it('returns edges for a sphere face', () => {
    const sphere = makeSphere(5);
    const faces = getFaces(sphere);
    // A sphere typically has a single face with edges
    const edges = edgesOfFace(faces[0]!);
    expect(edges.length).toBeGreaterThan(0);
  });
});

describe('wiresOfFace', () => {
  it('returns exactly 1 wire for a simple box face', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const faces = getFaces(box);
    const wires = wiresOfFace(faces[0]!);
    expect(wires).toHaveLength(1);
  });
});

describe('verticesOfEdge', () => {
  it('returns 2 vertices for a box edge', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const edges = getEdges(box);
    const verts = verticesOfEdge(edges[0]!);
    expect(verts).toHaveLength(2);
  });

  it('returns distinct vertices', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const edges = getEdges(box);
    const verts = verticesOfEdge(edges[0]!);
    expect(isSameShape(verts[0]!, verts[1]!)).toBe(false);
  });
});

describe('adjacentFaces', () => {
  it('returns 4 adjacent faces for each face of a box', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const faces = getFaces(box);
    // Each face of a box shares edges with exactly 4 other faces
    const neighbors = adjacentFaces(box, faces[0]!);
    expect(neighbors).toHaveLength(4);
  });

  it('does not include the input face itself', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const faces = getFaces(box);
    const face = faces[0]!;
    const neighbors = adjacentFaces(box, face);
    for (const n of neighbors) {
      expect(isSameShape(n, face)).toBe(false);
    }
  });

  it('all adjacent faces are unique', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const faces = getFaces(box);
    const neighbors = adjacentFaces(box, faces[0]!);
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        expect(isSameShape(neighbors[i]!, neighbors[j]!)).toBe(false);
      }
    }
  });
});

describe('sharedEdges', () => {
  it('returns 1 shared edge between two adjacent box faces', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const faces = getFaces(box);
    const face0 = faces[0]!;
    const neighbors = adjacentFaces(box, face0);
    const shared = sharedEdges(face0, neighbors[0]!);
    expect(shared).toHaveLength(1);
  });

  it('returns 0 shared edges between opposite box faces', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const faces = getFaces(box);
    const face0 = faces[0]!;
    const neighbors = adjacentFaces(box, face0);
    // Find a face that is NOT adjacent to face0
    const allFaces = getFaces(box);
    const oppositeFace = allFaces.find(
      (f) => !isSameShape(f, face0) && !neighbors.some((n) => isSameShape(n, f))
    );
    if (oppositeFace) {
      const shared = sharedEdges(face0, oppositeFace);
      expect(shared).toHaveLength(0);
    }
  });
});
