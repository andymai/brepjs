/**
 * Shape type cache — caches kernel shapeType() results on KernelShape objects.
 *
 * Eliminates redundant WASM boundary crossings when the same shape's type
 * is queried multiple times (type guards, castShape, etc.).
 *
 * Shapes are immutable in brepjs — operations return new shapes — so
 * cached types never go stale.
 */

import type { KernelShape, ShapeType } from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- KernelShape is typed as `any`; WeakMap requires object keys
const cache = new WeakMap<any, ShapeType>();

/**
 * Get the cached type for a shape, or undefined if not cached.
 * @testOnly Exercised by tests/shapeTypeCache.test.ts.
 */
export function getCachedType(shape: KernelShape): ShapeType | undefined {
  return cache.get(shape);
}

/** Store a type for a shape. */
export function setCachedType(shape: KernelShape, type: ShapeType): void {
  cache.set(shape, type);
}

/**
 * Check if a shape has a cached type.
 * @testOnly Exercised by tests/shapeTypeCache.test.ts.
 */
export function hasCachedType(shape: KernelShape): boolean {
  return cache.has(shape);
}

/**
 * Get the type from cache, or query the kernel and cache the result.
 * This is the primary hot-path function — replaces direct `kernel.shapeType()` calls.
 */
export function getOrQueryType(kernel: KernelAdapter, shape: KernelShape): ShapeType {
  const cached = cache.get(shape);
  if (cached !== undefined) return cached;
  const type = kernel.shapeType(shape);
  cache.set(shape, type);
  return type;
}
