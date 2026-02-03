import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildMeshCacheKey,
  getMesh,
  setMesh,
  buildEdgeMeshCacheKey,
  getEdgeMesh,
  setEdgeMesh,
  clearMeshCache,
  setMeshCacheSize,
  getMeshForShape,
  setMeshForShape,
  getEdgeMeshForShape,
  setEdgeMeshForShape,
} from '../src/topology/meshCache.js';
import type { ShapeMesh, EdgeMesh } from '../src/topology/meshFns.js';

function fakeMesh(id: number): ShapeMesh {
  return {
    vertices: new Float32Array([id]),
    normals: new Float32Array([id]),
    triangles: new Uint32Array([id]),
    faceGroups: [],
  };
}

function fakeEdgeMesh(id: number): EdgeMesh {
  return {
    lines: [id, id, id],
    edgeGroups: [{ start: 0, count: 1, edgeId: id }],
  };
}

// Mock OCCT shape object for WeakMap testing
function fakeOcShape(id: number): object {
  return { _id: id };
}

describe('meshCache', () => {
  beforeEach(() => {
    clearMeshCache();
  });

  describe('buildMeshCacheKey', () => {
    it('produces a deterministic key from parameters', () => {
      // shapeHash parameter is kept for API compatibility but no longer used
      const key = buildMeshCacheKey(123, 0.1, 30, false);
      expect(key).toBe('0.1:30:false');
    });

    it('distinguishes skipNormals', () => {
      const a = buildMeshCacheKey(1, 0.1, 30, false);
      const b = buildMeshCacheKey(1, 0.1, 30, true);
      expect(a).not.toBe(b);
    });

    it('ignores shapeHash parameter (no longer used)', () => {
      // Different hashes should produce the same key since identity is via WeakMap
      const a = buildMeshCacheKey(123, 0.1, 30, false);
      const b = buildMeshCacheKey(456, 0.1, 30, false);
      expect(a).toBe(b);
    });
  });

  describe('getMesh / setMesh (legacy API)', () => {
    it('returns undefined for missing keys', () => {
      expect(getMesh('nonexistent')).toBeUndefined();
    });

    it('stores and retrieves a mesh', () => {
      const mesh = fakeMesh(1);
      setMesh('key1', mesh);
      expect(getMesh('key1')).toBe(mesh);
    });

    it('overwrites existing entry on re-set', () => {
      setMesh('key1', fakeMesh(1));
      const mesh2 = fakeMesh(2);
      setMesh('key1', mesh2);
      expect(getMesh('key1')).toBe(mesh2);
    });
  });

  describe('clearMeshCache', () => {
    it('removes all legacy entries', () => {
      setMesh('a', fakeMesh(1));
      setMesh('b', fakeMesh(2));
      clearMeshCache();
      expect(getMesh('a')).toBeUndefined();
      expect(getMesh('b')).toBeUndefined();
    });

    it('removes all WeakMap entries', () => {
      const shape = fakeOcShape(1);
      setMeshForShape(shape, 'key', fakeMesh(1));
      clearMeshCache();
      expect(getMeshForShape(shape, 'key')).toBeUndefined();
    });
  });

  describe('setMeshCacheSize (deprecated)', () => {
    it('is a no-op for backward compatibility', () => {
      // WeakMap cache doesn't use size limits - entries are GC'd with shapes
      // This should not throw
      expect(() => setMeshCacheSize(1)).not.toThrow();
      expect(() => setMeshCacheSize(1000)).not.toThrow();
    });
  });

  describe('buildEdgeMeshCacheKey', () => {
    it('produces a deterministic key with edge prefix', () => {
      // shapeHash parameter is kept for API compatibility but no longer used
      const key = buildEdgeMeshCacheKey(123, 0.1, 30);
      expect(key).toBe('edge:0.1:30');
    });

    it('differs from triangle mesh key for same params', () => {
      const edgeKey = buildEdgeMeshCacheKey(1, 0.1, 30);
      const triKey = buildMeshCacheKey(1, 0.1, 30, false);
      expect(edgeKey).not.toBe(triKey);
    });
  });

  describe('getEdgeMesh / setEdgeMesh (legacy API)', () => {
    it('returns undefined for missing keys', () => {
      expect(getEdgeMesh('nonexistent')).toBeUndefined();
    });

    it('stores and retrieves an edge mesh', () => {
      const mesh = fakeEdgeMesh(1);
      setEdgeMesh('ekey1', mesh);
      expect(getEdgeMesh('ekey1')).toBe(mesh);
    });
  });

  describe('WeakMap-based API', () => {
    describe('getMeshForShape / setMeshForShape', () => {
      it('returns undefined for missing shapes', () => {
        const shape = fakeOcShape(1);
        expect(getMeshForShape(shape, 'key')).toBeUndefined();
      });

      it('returns undefined for missing parameter keys', () => {
        const shape = fakeOcShape(1);
        setMeshForShape(shape, 'key1', fakeMesh(1));
        expect(getMeshForShape(shape, 'key2')).toBeUndefined();
      });

      it('stores and retrieves a mesh by shape identity', () => {
        const shape = fakeOcShape(1);
        const mesh = fakeMesh(1);
        setMeshForShape(shape, 'key', mesh);
        expect(getMeshForShape(shape, 'key')).toBe(mesh);
      });

      it('distinguishes different shape objects', () => {
        const shape1 = fakeOcShape(1);
        const shape2 = fakeOcShape(2);
        const mesh1 = fakeMesh(1);
        const mesh2 = fakeMesh(2);

        setMeshForShape(shape1, 'key', mesh1);
        setMeshForShape(shape2, 'key', mesh2);

        expect(getMeshForShape(shape1, 'key')).toBe(mesh1);
        expect(getMeshForShape(shape2, 'key')).toBe(mesh2);
      });

      it('stores multiple parameter variations for same shape', () => {
        const shape = fakeOcShape(1);
        const mesh1 = fakeMesh(1);
        const mesh2 = fakeMesh(2);

        setMeshForShape(shape, 'params1', mesh1);
        setMeshForShape(shape, 'params2', mesh2);

        expect(getMeshForShape(shape, 'params1')).toBe(mesh1);
        expect(getMeshForShape(shape, 'params2')).toBe(mesh2);
      });

      it('overwrites existing entry for same shape and key', () => {
        const shape = fakeOcShape(1);
        setMeshForShape(shape, 'key', fakeMesh(1));
        const mesh2 = fakeMesh(2);
        setMeshForShape(shape, 'key', mesh2);
        expect(getMeshForShape(shape, 'key')).toBe(mesh2);
      });
    });

    describe('getEdgeMeshForShape / setEdgeMeshForShape', () => {
      it('returns undefined for missing shapes', () => {
        const shape = fakeOcShape(1);
        expect(getEdgeMeshForShape(shape, 'key')).toBeUndefined();
      });

      it('stores and retrieves an edge mesh by shape identity', () => {
        const shape = fakeOcShape(1);
        const mesh = fakeEdgeMesh(1);
        setEdgeMeshForShape(shape, 'key', mesh);
        expect(getEdgeMeshForShape(shape, 'key')).toBe(mesh);
      });

      it('keeps triangle and edge caches separate', () => {
        const shape = fakeOcShape(1);
        const triMesh = fakeMesh(1);
        const edgeMesh = fakeEdgeMesh(2);

        setMeshForShape(shape, 'key', triMesh);
        setEdgeMeshForShape(shape, 'key', edgeMesh);

        expect(getMeshForShape(shape, 'key')).toBe(triMesh);
        expect(getEdgeMeshForShape(shape, 'key')).toBe(edgeMesh);
      });
    });
  });
});
