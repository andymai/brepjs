/**
 * LRU cache for mesh results.
 *
 * Uses WeakMap keyed by the actual OCCT shape object to avoid hash collisions.
 * HashCode() can return identical values for different shapes, which would cause
 * the cache to return incorrect mesh data. WeakMap ensures identity-based lookup.
 *
 * The tolerance parameters are encoded as a string key in an inner Map.
 */

import type { ShapeMesh, EdgeMesh } from './meshFns.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT shape type
type OcShape = any;

/**
 * Build a parameter key for the inner cache map (excludes shape identity).
 * Shape identity is handled by the WeakMap outer layer.
 */
export function buildMeshCacheKey(
  _shapeHash: number, // Kept for API compatibility but no longer used
  tolerance: number,
  angularTolerance: number,
  skipNormals: boolean
): string {
  return `${tolerance}:${angularTolerance}:${skipNormals}`;
}

/**
 * Build a parameter key for edge mesh cache lookup (excludes shape identity).
 * Shape identity is handled by the WeakMap outer layer.
 */
export function buildEdgeMeshCacheKey(
  _shapeHash: number, // Kept for API compatibility but no longer used
  tolerance: number,
  angularTolerance: number
): string {
  return `edge:${tolerance}:${angularTolerance}`;
}

// WeakMap keyed by OCCT shape object -> Map of paramKey -> mesh
let meshCache: WeakMap<OcShape, Map<string, ShapeMesh>> = new WeakMap();
let edgeMeshCache: WeakMap<OcShape, Map<string, EdgeMesh>> = new WeakMap();

/**
 * Get a cached mesh for a shape with the given parameters.
 * @param shape The OCCT shape object (not the wrapper)
 * @param key The parameter key from buildMeshCacheKey
 */
export function getMeshForShape(shape: OcShape, key: string): ShapeMesh | undefined {
  const shapeCache = meshCache.get(shape);
  if (!shapeCache) return undefined;
  return shapeCache.get(key);
}

/**
 * Store a mesh in the cache.
 * @param shape The OCCT shape object (not the wrapper)
 * @param key The parameter key from buildMeshCacheKey
 * @param value The mesh data
 */
export function setMeshForShape(shape: OcShape, key: string, value: ShapeMesh): void {
  let shapeCache = meshCache.get(shape);
  if (!shapeCache) {
    shapeCache = new Map();
    meshCache.set(shape, shapeCache);
  }
  shapeCache.set(key, value);
}

/**
 * Get a cached edge mesh for a shape with the given parameters.
 * @param shape The OCCT shape object (not the wrapper)
 * @param key The parameter key from buildEdgeMeshCacheKey
 */
export function getEdgeMeshForShape(shape: OcShape, key: string): EdgeMesh | undefined {
  const shapeCache = edgeMeshCache.get(shape);
  if (!shapeCache) return undefined;
  return shapeCache.get(key);
}

/**
 * Store an edge mesh in the cache.
 * @param shape The OCCT shape object (not the wrapper)
 * @param key The parameter key from buildEdgeMeshCacheKey
 * @param value The edge mesh data
 */
export function setEdgeMeshForShape(shape: OcShape, key: string, value: EdgeMesh): void {
  let shapeCache = edgeMeshCache.get(shape);
  if (!shapeCache) {
    shapeCache = new Map();
    edgeMeshCache.set(shape, shapeCache);
  }
  shapeCache.set(key, value);
}

// Legacy API - kept for backward compatibility but deprecated
// These use hash-based lookup which can collide

let legacyCache: Map<string, ShapeMesh | EdgeMesh> = new Map();

/** @deprecated Use getMeshForShape instead - hash-based keys can collide */
export function getMesh(key: string): ShapeMesh | undefined {
  return legacyCache.get(key) as ShapeMesh | undefined;
}

/** @deprecated Use setMeshForShape instead - hash-based keys can collide */
export function setMesh(key: string, value: ShapeMesh): void {
  legacyCache.set(key, value);
}

/** @deprecated Use getEdgeMeshForShape instead - hash-based keys can collide */
export function getEdgeMesh(key: string): EdgeMesh | undefined {
  return legacyCache.get(key) as EdgeMesh | undefined;
}

/** @deprecated Use setEdgeMeshForShape instead - hash-based keys can collide */
export function setEdgeMesh(key: string, value: EdgeMesh): void {
  legacyCache.set(key, value);
}

/**
 * Clear all mesh caches. Call this after modifying shapes to avoid stale results.
 */
export function clearMeshCache(): void {
  meshCache = new WeakMap();
  edgeMeshCache = new WeakMap();
  legacyCache = new Map();
}

/**
 * Set the maximum cache size for the legacy cache.
 * Note: WeakMap caches are automatically managed by GC and don't have a size limit.
 * @deprecated The WeakMap-based cache doesn't use size limits
 */
export function setMeshCacheSize(_size: number): void {
  // WeakMap doesn't support size limits - entries are GC'd when shapes are GC'd
  // This function is kept for backward compatibility but is now a no-op
}

// ---------------------------------------------------------------------------
// Isolated mesh cache context
// ---------------------------------------------------------------------------

/**
 * An isolated mesh cache context for per-viewer or per-worker use.
 *
 * Provides the same get/set interface as the global cache but with
 * independent state, so multiple viewers can cache independently.
 */
export interface MeshCacheContext {
  getMesh(shape: OcShape, key: string): ShapeMesh | undefined;
  setMesh(shape: OcShape, key: string, value: ShapeMesh): void;
  getEdgeMesh(shape: OcShape, key: string): EdgeMesh | undefined;
  setEdgeMesh(shape: OcShape, key: string, value: EdgeMesh): void;
  clear(): void;
}

/** Create an isolated mesh cache that doesn't share state with the global cache. */
export function createMeshCache(): MeshCacheContext {
  let shapeMap: WeakMap<OcShape, Map<string, ShapeMesh>> = new WeakMap();
  let edgeMap: WeakMap<OcShape, Map<string, EdgeMesh>> = new WeakMap();

  return {
    getMesh(shape: OcShape, key: string): ShapeMesh | undefined {
      return shapeMap.get(shape)?.get(key);
    },
    setMesh(shape: OcShape, key: string, value: ShapeMesh): void {
      let inner = shapeMap.get(shape);
      if (!inner) {
        inner = new Map();
        shapeMap.set(shape, inner);
      }
      inner.set(key, value);
    },
    getEdgeMesh(shape: OcShape, key: string): EdgeMesh | undefined {
      return edgeMap.get(shape)?.get(key);
    },
    setEdgeMesh(shape: OcShape, key: string, value: EdgeMesh): void {
      let inner = edgeMap.get(shape);
      if (!inner) {
        inner = new Map();
        edgeMap.set(shape, inner);
      }
      inner.set(key, value);
    },
    clear(): void {
      shapeMap = new WeakMap();
      edgeMap = new WeakMap();
    },
  };
}
