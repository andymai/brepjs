import { describe, expect, it } from 'vitest';
import {
  getCachedMeasurement,
  setCachedMeasurement,
  clearMeasurementCache,
} from '../src/measurement/measureCache.js';
import type { VolumeProps, SurfaceProps } from '../src/measurement/measureTypes.js';

describe('measureCache', () => {
  it('returns undefined for uncached shape', () => {
    const shape = {};
    expect(getCachedMeasurement(shape, 'volume')).toBeUndefined();
  });

  it('returns cached value after set', () => {
    const shape = {};
    const value = { mass: 100, volume: 100, centerOfMass: [0, 0, 0] as [number, number, number] };
    setCachedMeasurement(shape, 'volume', value);
    expect(getCachedMeasurement(shape, 'volume')).toBe(value);
  });

  it('isolates different keys on same shape', () => {
    const shape = {};
    const vol = { mass: 100, volume: 100, centerOfMass: [0, 0, 0] as [number, number, number] };
    const surf = { mass: 200, area: 200, centerOfMass: [1, 1, 1] as [number, number, number] };
    setCachedMeasurement(shape, 'volume', vol);
    setCachedMeasurement(shape, 'surface', surf);
    expect(getCachedMeasurement(shape, 'volume')).toBe(vol);
    expect(getCachedMeasurement(shape, 'surface')).toBe(surf);
  });

  it('isolates different shapes', () => {
    const shape1 = {};
    const shape2 = {};
    const vol: VolumeProps = { mass: 1, volume: 1, centerOfMass: [0, 0, 0] };
    setCachedMeasurement(shape1, 'volume', vol);
    expect(getCachedMeasurement(shape2, 'volume')).toBeUndefined();
  });

  it('clearMeasurementCache clears specific shape', () => {
    const shape = {};
    const vol: VolumeProps = { mass: 1, volume: 1, centerOfMass: [0, 0, 0] };
    setCachedMeasurement(shape, 'volume', vol);
    clearMeasurementCache(shape);
    expect(getCachedMeasurement(shape, 'volume')).toBeUndefined();
  });

  it('clearMeasurementCache with no argument clears all', () => {
    const shape1 = {};
    const shape2 = {};
    const vol: VolumeProps = { mass: 1, volume: 1, centerOfMass: [0, 0, 0] };
    const surf: SurfaceProps = { mass: 2, area: 2, centerOfMass: [1, 1, 1] };
    setCachedMeasurement(shape1, 'volume', vol);
    setCachedMeasurement(shape2, 'surface', surf);
    clearMeasurementCache();
    expect(getCachedMeasurement(shape1, 'volume')).toBeUndefined();
    expect(getCachedMeasurement(shape2, 'surface')).toBeUndefined();
  });
});
