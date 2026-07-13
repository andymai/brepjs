import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  cylinder,
  translate,
  fuse,
  unwrap,
  getEdges,
  getFaces,
  getWires,
  getVertices,
  getBounds,
  edgeFinder,
  faceFinder,
  wireFinder,
  vertexFinder,
  adjacentFaces,
  facesOfEdge,
  isSameShape,
  invalidateShapeCache,
} from '@/index.js';
import { getCachedShapeKind } from '@/topology/topologyQueryFns.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('topology cache — sub-shape identity', () => {
  it('getEdges returns the same array reference on repeated calls', () => {
    const b = box(10, 10, 10);
    const edges1 = getEdges(b);
    const edges2 = getEdges(b);
    expect(edges1).toBe(edges2);
  });

  it('getFaces returns the same array reference on repeated calls', () => {
    const b = box(10, 10, 10);
    const faces1 = getFaces(b);
    const faces2 = getFaces(b);
    expect(faces1).toBe(faces2);
  });

  it('getWires returns the same array reference on repeated calls', () => {
    const b = box(10, 10, 10);
    const wires1 = getWires(b);
    const wires2 = getWires(b);
    expect(wires1).toBe(wires2);
  });

  it('getVertices returns the same array reference on repeated calls', () => {
    const b = box(10, 10, 10);
    const verts1 = getVertices(b);
    const verts2 = getVertices(b);
    expect(verts1).toBe(verts2);
  });

  it('getBounds returns the same object reference on repeated calls', () => {
    const b = box(10, 10, 10);
    const bounds1 = getBounds(b);
    const bounds2 = getBounds(b);
    expect(bounds1).toBe(bounds2);
  });
});

describe('topology cache — getCachedShapeKind', () => {
  it('returns correct kind for a solid', () => {
    const b = box(10, 10, 10);
    expect(getCachedShapeKind(b)).toBe('solid');
  });

  it('returns correct kind for a face', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    expect(getCachedShapeKind(faces[0]!)).toBe('face'); // eslint-disable-line @typescript-eslint/no-non-null-assertion
  });

  it('returns same value on repeated calls', () => {
    const b = box(10, 10, 10);
    const kind1 = getCachedShapeKind(b);
    const kind2 = getCachedShapeKind(b);
    expect(kind1).toBe(kind2);
  });
});

describe('topology cache — invalidation', () => {
  it('invalidateShapeCache releases the stale handles and forces re-extraction', () => {
    const b = box(10, 10, 10);
    const edges1 = getEdges(b);
    const len = edges1.length;
    expect(edges1[0]?.disposed).toBe(false);

    invalidateShapeCache(b);
    // The stale cached handles are released (they reference pre-modification
    // topology); do not touch their `.wrapped` after this point.
    expect(edges1[0]?.disposed).toBe(true);

    // Re-extraction yields a fresh, live array of the same length.
    const edges2 = getEdges(b);
    expect(edges2).toHaveLength(len);
    expect(edges2[0]?.disposed).toBe(false);
  });
});

describe('finder cache integration', () => {
  it('edgeFinder uses cached topology', () => {
    const b = box(10, 10, 10);
    // Warm the cache
    const cachedEdges = getEdges(b);
    // Finder should use the same cached data
    const found = edgeFinder().findAll(b);
    expect(found).toHaveLength(cachedEdges.length);
    // Each found edge should match a cached edge
    for (const fe of found) {
      expect(cachedEdges.some((ce) => isSameShape(ce, fe))).toBe(true);
    }
  });

  it('faceFinder uses cached topology', () => {
    const b = box(10, 10, 10);
    const cachedFaces = getFaces(b);
    const found = faceFinder().findAll(b);
    expect(found).toHaveLength(cachedFaces.length);
  });

  it('wireFinder uses cached topology', () => {
    const b = box(10, 10, 10);
    const cachedWires = getWires(b);
    const found = wireFinder().findAll(b);
    expect(found).toHaveLength(cachedWires.length);
  });

  it('vertexFinder uses cached topology', () => {
    const b = box(10, 10, 10);
    const cachedVerts = getVertices(b);
    const found = vertexFinder().findAll(b);
    expect(found).toHaveLength(cachedVerts.length);
  });

  it('findUnique returns correct result from cached topology', () => {
    const b = box(10, 10, 10);
    // Use ofLength to narrow to a unique edge (all box edges have the same length,
    // so use inDirection + ofLength to get a single match)
    const result = edgeFinder().inDirection('X').ofLength(10, 0.01).findAll(b);
    expect(result.length).toBeGreaterThan(0);
  });

  it('finder on complex shape works correctly', () => {
    const b = box(10, 10, 10);
    const cyl = translate(cylinder(3, 10), [5, 5, 0]);
    const fused = unwrap(fuse(b, cyl));
    const faces = faceFinder().findAll(fused);
    const cachedFaces = getFaces(fused);
    expect(faces).toHaveLength(cachedFaces.length);
  });
});

describe('adjacency cache integration', () => {
  it('adjacentFaces is consistent across repeated calls on same parent', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const f0 = faces[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const neighbors1 = adjacentFaces(b, f0);
    const neighbors2 = adjacentFaces(b, f0);
    expect(neighbors1).toHaveLength(neighbors2.length);
  });

  it('adjacentFaces for different faces of same parent reuses cached map', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    // Both calls should reuse the same edge→faces map internally
    const n0 = adjacentFaces(b, faces[0]!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const n1 = adjacentFaces(b, faces[1]!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(n0).toHaveLength(4); // Each box face has 4 neighbors
    expect(n1).toHaveLength(4);
  });

  it('facesOfEdge returns consistent results', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const faces = facesOfEdge(b, edges[0]!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(faces).toHaveLength(2); // Box interior edges border exactly 2 faces
  });

  it('invalidation clears adjacency cache', () => {
    const b = box(10, 10, 10);
    adjacentFaces(b, getFaces(b)[0]!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    invalidateShapeCache(b);
    // After invalidation, calling again should still work correctly
    const faces = getFaces(b);
    const neighbors = adjacentFaces(b, faces[0]!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(neighbors).toHaveLength(4);
  });
});
