/**
 * LRU cache for mesh results.
 *
 * Keyed by a composite string of shapeHash:tolerance:angularTolerance:skipNormals.
 * Avoids redundant meshing when the same shape is rendered multiple times with
 * identical parameters. Shared pool for both triangle meshes and edge meshes.
 */

import type { ShapeMesh, EdgeMesh } from './meshFns.js';

const DEFAULT_MAX_SIZE = 128;

interface CacheEntry {
  key: string;
  value: ShapeMesh | EdgeMesh;
}

let cache: Map<string, CacheEntry> = new Map();
let maxSize = DEFAULT_MAX_SIZE;

export function buildMeshCacheKey(
  shapeHash: number,
  tolerance: number,
  angularTolerance: number,
  skipNormals: boolean
): string {
  return `${shapeHash}:${tolerance}:${angularTolerance}:${skipNormals}`;
}

export function buildEdgeMeshCacheKey(
  shapeHash: number,
  tolerance: number,
  angularTolerance: number
): string {
  return `edge:${shapeHash}:${tolerance}:${angularTolerance}`;
}

export function getMesh(key: string): ShapeMesh | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;

  // Move to end (most recently used) by re-inserting
  cache.delete(key);
  cache.set(key, entry);
  return entry.value as ShapeMesh;
}

export function setMesh(key: string, value: ShapeMesh): void {
  _set(key, value);
}

export function getEdgeMesh(key: string): EdgeMesh | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;

  // Move to end (most recently used) by re-inserting
  cache.delete(key);
  cache.set(key, entry);
  return entry.value as EdgeMesh;
}

export function setEdgeMesh(key: string, value: EdgeMesh): void {
  _set(key, value);
}

function _set(key: string, value: ShapeMesh | EdgeMesh): void {
  // If key already exists, delete it first so insertion is at the end
  if (cache.has(key)) {
    cache.delete(key);
  }

  // Evict oldest entry if at capacity
  if (cache.size >= maxSize) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }

  cache.set(key, { key, value });
}

/**
 * Clear the mesh cache. Call this after modifying shapes to avoid stale results.
 */
export function clearMeshCache(): void {
  cache = new Map();
}

/**
 * Set the maximum cache size. Existing entries beyond the new limit are evicted.
 */
export function setMeshCacheSize(size: number): void {
  maxSize = size;
  while (cache.size > maxSize) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
}
