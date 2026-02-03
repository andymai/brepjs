import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildMeshCacheKey,
  getMesh,
  setMesh,
  clearMeshCache,
  setMeshCacheSize,
} from '../src/topology/meshCache.js';
import type { ShapeMesh } from '../src/topology/meshFns.js';

function fakeMesh(id: number): ShapeMesh {
  return {
    vertices: new Float32Array([id]),
    normals: new Float32Array([id]),
    triangles: new Uint32Array([id]),
    faceGroups: [],
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
});
