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

describe('meshCache', () => {
  beforeEach(() => {
    clearMeshCache();
    setMeshCacheSize(128);
  });

  describe('buildMeshCacheKey', () => {
    it('produces a deterministic key from parameters', () => {
      const key = buildMeshCacheKey(123, 0.1, 30, false);
      expect(key).toBe('123:0.1:30:false');
    });

    it('distinguishes skipNormals', () => {
      const a = buildMeshCacheKey(1, 0.1, 30, false);
      const b = buildMeshCacheKey(1, 0.1, 30, true);
      expect(a).not.toBe(b);
    });
  });

  describe('getMesh / setMesh', () => {
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

  describe('LRU eviction', () => {
    it('evicts oldest entry when capacity is exceeded', () => {
      setMeshCacheSize(2);
      setMesh('a', fakeMesh(1));
      setMesh('b', fakeMesh(2));
      setMesh('c', fakeMesh(3)); // evicts 'a'
      expect(getMesh('a')).toBeUndefined();
      expect(getMesh('b')).toBeDefined();
      expect(getMesh('c')).toBeDefined();
    });

    it('promotes accessed entries so they survive eviction', () => {
      setMeshCacheSize(2);
      setMesh('a', fakeMesh(1));
      setMesh('b', fakeMesh(2));
      getMesh('a'); // promote 'a', 'b' is now oldest
      setMesh('c', fakeMesh(3)); // evicts 'b'
      expect(getMesh('a')).toBeDefined();
      expect(getMesh('b')).toBeUndefined();
      expect(getMesh('c')).toBeDefined();
    });
  });

  describe('clearMeshCache', () => {
    it('removes all entries', () => {
      setMesh('a', fakeMesh(1));
      setMesh('b', fakeMesh(2));
      clearMeshCache();
      expect(getMesh('a')).toBeUndefined();
      expect(getMesh('b')).toBeUndefined();
    });
  });

  describe('setMeshCacheSize', () => {
    it('evicts entries when shrinking below current size', () => {
      setMesh('a', fakeMesh(1));
      setMesh('b', fakeMesh(2));
      setMesh('c', fakeMesh(3));
      setMeshCacheSize(1); // evicts 'a' and 'b'
      expect(getMesh('a')).toBeUndefined();
      expect(getMesh('b')).toBeUndefined();
      expect(getMesh('c')).toBeDefined();
    });
  });

  describe('buildEdgeMeshCacheKey', () => {
    it('produces a deterministic key with edge prefix', () => {
      const key = buildEdgeMeshCacheKey(123, 0.1, 30);
      expect(key).toBe('edge:123:0.1:30');
    });

    it('differs from triangle mesh key for same params', () => {
      const edgeKey = buildEdgeMeshCacheKey(1, 0.1, 30);
      const triKey = buildMeshCacheKey(1, 0.1, 30, false);
      expect(edgeKey).not.toBe(triKey);
    });
  });

  describe('getEdgeMesh / setEdgeMesh', () => {
    it('returns undefined for missing keys', () => {
      expect(getEdgeMesh('nonexistent')).toBeUndefined();
    });

    it('stores and retrieves an edge mesh', () => {
      const mesh = fakeEdgeMesh(1);
      setEdgeMesh('ekey1', mesh);
      expect(getEdgeMesh('ekey1')).toBe(mesh);
    });

    it('shares LRU pool with triangle meshes', () => {
      setMeshCacheSize(2);
      setMesh('tri1', fakeMesh(1));
      setEdgeMesh('edge1', fakeEdgeMesh(2));
      setEdgeMesh('edge2', fakeEdgeMesh(3)); // evicts 'tri1'
      expect(getMesh('tri1')).toBeUndefined();
      expect(getEdgeMesh('edge1')).toBeDefined();
      expect(getEdgeMesh('edge2')).toBeDefined();
    });
  });
});
