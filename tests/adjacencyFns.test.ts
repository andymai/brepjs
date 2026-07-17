import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  sphere,
  getEdges,
  getFaces,
  facesOfEdge,
  edgesOfFace,
  wiresOfFace,
  verticesOfEdge,
  adjacentFaces,
  sharedEdges,
  isSameShape,
} from '@/index.js';
import { adjacentFaceHashes } from '@/topology/adjacencyFns.js';
import { getHashCode } from '@/topology/shapeFns.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('facesOfEdge', () => {
  it('returns exactly 2 faces for an interior edge of a box', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    // Every edge of a box borders exactly 2 faces
    const faces = facesOfEdge(b, edges[0]!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(faces).toHaveLength(2);
  });

  it('returns faces that are different from each other', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const faces = facesOfEdge(b, edges[0]!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(isSameShape(faces[0]!, faces[1]!)).toBe(false); // eslint-disable-line @typescript-eslint/no-non-null-assertion
  });
});

describe('edgesOfFace', () => {
  it('returns 4 edges for a box face', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const edges = edgesOfFace(faces[0]!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(edges).toHaveLength(4);
  });

  it('returns edges for a sphere face', () => {
    const s = sphere(5);
    const faces = getFaces(s);
    // A sphere typically has a single face with edges
    const edges = edgesOfFace(faces[0]!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(edges.length).toBeGreaterThan(0);
  });
});

describe('wiresOfFace', () => {
  it('returns exactly 1 wire for a simple box face', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const wires = wiresOfFace(faces[0]!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(wires).toHaveLength(1);
  });
});

describe('verticesOfEdge', () => {
  it('returns 2 vertices for a box edge', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const verts = verticesOfEdge(edges[0]!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(verts).toHaveLength(2);
  });

  it('returns distinct vertices', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const verts = verticesOfEdge(edges[0]!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(isSameShape(verts[0]!, verts[1]!)).toBe(false); // eslint-disable-line @typescript-eslint/no-non-null-assertion
  });
});

describe('adjacentFaces', () => {
  it('returns 4 adjacent faces for each face of a box', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    // Each face of a box shares edges with exactly 4 other faces
    const neighbors = adjacentFaces(b, faces[0]!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(neighbors).toHaveLength(4);
  });

  it('does not include the input face itself', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const f = faces[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const neighbors = adjacentFaces(b, f);
    for (const n of neighbors) {
      expect(isSameShape(n, f)).toBe(false);
    }
  });

  it('all adjacent faces are unique', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const neighbors = adjacentFaces(b, faces[0]!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        expect(isSameShape(neighbors[i]!, neighbors[j]!)).toBe(false); // eslint-disable-line @typescript-eslint/no-non-null-assertion
      }
    }
  });
});

describe('sharedEdges', () => {
  it('returns 1 shared edge between two adjacent box faces', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const face0 = faces[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const neighbors = adjacentFaces(b, face0);
    const shared = sharedEdges(face0, neighbors[0]!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(shared).toHaveLength(1);
  });

  it('returns 0 shared edges between opposite box faces', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const face0 = faces[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const neighbors = adjacentFaces(b, face0);
    // Find a face that is NOT adjacent to face0
    const allFaces = getFaces(b);
    const oppositeFace = allFaces.find(
      (f) => !isSameShape(f, face0) && !neighbors.some((n) => isSameShape(n, f))
    );
    if (oppositeFace) {
      const shared = sharedEdges(face0, oppositeFace);
      expect(shared).toHaveLength(0);
    }
  });
});

describe('adjacentFaceHashes', () => {
  it('returns the hashes of the adjacent faces (agrees with adjacentFaces)', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const face0 = faces[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const expected = new Set(adjacentFaces(b, face0).map(getHashCode));
    const hashes = adjacentFaceHashes(b, face0);
    expect(hashes).toHaveLength(4); // a box face borders 4 others
    expect(new Set(hashes)).toEqual(expected);
    // every returned hash indexes an actual face of the parent
    const parentFaceHashes = new Set(faces.map(getHashCode));
    expect(hashes.every((h) => parentFaceHashes.has(h))).toBe(true);
  });
});
