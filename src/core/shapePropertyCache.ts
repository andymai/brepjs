/**
 * Shape property cache — caches immutable kernel queries on KernelShape objects.
 *
 * Eliminates redundant WASM boundary crossings for properties that never
 * change on an immutable shape: vertex positions, hash codes, bounding boxes.
 *
 * Shapes are immutable in brepjs — operations return new shapes — so
 * cached values never go stale. Uses WeakMap to avoid memory leaks.
 */

import type { KernelShape } from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import { HASH_CODE_MAX } from './constants.js';

// ---------------------------------------------------------------------------
// Vertex position cache
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- KernelShape is typed as `any`
const vertexPosCache = new WeakMap<any, [number, number, number]>();

/**
 * Get the vertex position from cache, or query the kernel and cache the result.
 *
 * Vertices are immutable — their 3D position never changes once created.
 * This avoids WASM round-trips (~10μs each) in hot loops like vertex finders.
 */
export function getOrQueryVertexPosition(
  kernel: KernelAdapter,
  vertex: KernelShape
): [number, number, number] {
  const cached = vertexPosCache.get(vertex);
  if (cached !== undefined) return cached;
  const pos = kernel.vertexPosition(vertex);
  vertexPosCache.set(vertex, pos);
  return pos;
}

// ---------------------------------------------------------------------------
// Hash code cache
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- KernelShape is typed as `any`
const hashCodeCache = new WeakMap<any, number>();

/**
 * Get the hash code from cache, or query the kernel and cache the result.
 *
 * Hash codes are deterministic on immutable shapes. This avoids WASM
 * round-trips (~5μs each) in adjacency deduplication loops.
 */
export function getOrQueryHashCode(kernel: KernelAdapter, shape: KernelShape): number {
  const cached = hashCodeCache.get(shape);
  if (cached !== undefined) return cached;
  const hash = kernel.hashCode(shape, HASH_CODE_MAX);
  hashCodeCache.set(shape, hash);
  return hash;
}
