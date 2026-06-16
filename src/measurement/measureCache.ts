/**
 * WeakMap-based cache for immutable shape measurement results.
 *
 * Shapes in brepjs are immutable after creation — boolean ops produce new shapes.
 * This cache avoids redundant WASM calls for repeated measurements on the same shape.
 * WeakMap keys auto-expire when shapes are GC'd.
 */

import type { VolumeProps, SurfaceProps, LinearProps } from './measureTypes.js';

/** Maps measurement keys to their corresponding result types. */
export interface MeasurementValueMap {
  volume: VolumeProps;
  surface: SurfaceProps;
  linear: LinearProps;
}

/** Valid measurement cache keys. */
export type MeasurementKey = keyof MeasurementValueMap;

let cache = new WeakMap<object, Map<MeasurementKey, MeasurementValueMap[MeasurementKey]>>();

export function getCachedMeasurement<K extends MeasurementKey>(
  shape: object,
  key: K
): MeasurementValueMap[K] | undefined {
  return cache.get(shape)?.get(key) as MeasurementValueMap[K] | undefined;
}

export function setCachedMeasurement<K extends MeasurementKey>(
  shape: object,
  key: K,
  value: MeasurementValueMap[K]
): void {
  let map = cache.get(shape);
  if (!map) {
    map = new Map();
    cache.set(shape, map);
  }
  map.set(key, value);
}

/** @testOnly Exercised by tests/measureCache.test.ts. */
export function clearMeasurementCache(shape?: object): void {
  if (shape) {
    cache.delete(shape);
  } else {
    cache = new WeakMap();
  }
}
