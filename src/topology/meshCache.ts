/**
 * LRU cache for mesh results.
 *
 * Uses WeakMap keyed by the actual kernel shape object to avoid hash collisions.
 * HashCode() can return identical values for different shapes, which would cause
 * the cache to return incorrect mesh data. WeakMap ensures identity-based lookup.
 *
 * The tolerance parameters are encoded as a string key in an inner Map.
 */

import type { ShapeMesh, EdgeMesh } from './meshFns.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel shape type
type KernelShape = any;

/**
 * Build a parameter key for the inner cache map (excludes shape identity).
 * Shape identity is handled by the WeakMap outer layer.
 */
export function buildMeshCacheKey(
  tolerance: number,
  angularTolerance: number,
  skipNormals: boolean,
  includeUVs = false
): string {
  return `${tolerance}:${angularTolerance}:${skipNormals}:${includeUVs}`;
}

/**
 * Build a parameter key for edge mesh cache lookup (excludes shape identity).
 * Shape identity is handled by the WeakMap outer layer.
 */
export function buildEdgeMeshCacheKey(tolerance: number, angularTolerance: number): string {
  return `edge:${tolerance}:${angularTolerance}`;
}

// WeakMap keyed by kernel shape object -> Map of paramKey -> mesh
let meshCache: WeakMap<KernelShape, Map<string, ShapeMesh>> = new WeakMap();
let edgeMeshCache: WeakMap<KernelShape, Map<string, EdgeMesh>> = new WeakMap();

/**
 * Get a cached mesh for a shape with the given parameters.
 * @param shape The kernel shape object (not the wrapper)
 * @param key The parameter key from buildMeshCacheKey
 */
export function getMeshForShape(shape: KernelShape, key: string): ShapeMesh | undefined {
  const shapeCache = meshCache.get(shape);
  if (!shapeCache) return undefined;
  return shapeCache.get(key);
}

/**
 * Store a mesh in the cache.
 * @param shape The kernel shape object (not the wrapper)
 * @param key The parameter key from buildMeshCacheKey
 * @param value The mesh data
 */
export function setMeshForShape(shape: KernelShape, key: string, value: ShapeMesh): void {
  let shapeCache = meshCache.get(shape);
  if (!shapeCache) {
    shapeCache = new Map();
    meshCache.set(shape, shapeCache);
  }
  shapeCache.set(key, value);
}

/**
 * Get a cached edge mesh for a shape with the given parameters.
 * @param shape The kernel shape object (not the wrapper)
 * @param key The parameter key from buildEdgeMeshCacheKey
 */
export function getEdgeMeshForShape(shape: KernelShape, key: string): EdgeMesh | undefined {
  const shapeCache = edgeMeshCache.get(shape);
  if (!shapeCache) return undefined;
  return shapeCache.get(key);
}

/**
 * Store an edge mesh in the cache.
 * @param shape The kernel shape object (not the wrapper)
 * @param key The parameter key from buildEdgeMeshCacheKey
 * @param value The edge mesh data
 */
export function setEdgeMeshForShape(shape: KernelShape, key: string, value: EdgeMesh): void {
  let shapeCache = edgeMeshCache.get(shape);
  if (!shapeCache) {
    shapeCache = new Map();
    edgeMeshCache.set(shape, shapeCache);
  }
  shapeCache.set(key, value);
}

/**
 * Clear all mesh caches. Call this after modifying shapes to avoid stale results.
 */
export function clearMeshCache(): void {
  meshCache = new WeakMap();
  edgeMeshCache = new WeakMap();
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
  getMesh(shape: KernelShape, key: string): ShapeMesh | undefined;
  setMesh(shape: KernelShape, key: string, value: ShapeMesh): void;
  getEdgeMesh(shape: KernelShape, key: string): EdgeMesh | undefined;
  setEdgeMesh(shape: KernelShape, key: string, value: EdgeMesh): void;
  clear(): void;
}

/** Create an isolated mesh cache that doesn't share state with the global cache. */
export function createMeshCache(): MeshCacheContext {
  let shapeMap: WeakMap<KernelShape, Map<string, ShapeMesh>> = new WeakMap();
  let edgeMap: WeakMap<KernelShape, Map<string, EdgeMesh>> = new WeakMap();

  return {
    getMesh(shape: KernelShape, key: string): ShapeMesh | undefined {
      return shapeMap.get(shape)?.get(key);
    },
    setMesh(shape: KernelShape, key: string, value: ShapeMesh): void {
      let inner = shapeMap.get(shape);
      if (!inner) {
        inner = new Map();
        shapeMap.set(shape, inner);
      }
      inner.set(key, value);
    },
    getEdgeMesh(shape: KernelShape, key: string): EdgeMesh | undefined {
      return edgeMap.get(shape)?.get(key);
    },
    setEdgeMesh(shape: KernelShape, key: string, value: EdgeMesh): void {
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
