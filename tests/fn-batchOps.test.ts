/**
 * Tests for batch kernel operations: measureBulk and transformBatch.
 *
 * These functions have C++/JS dual-path dispatch. The test WASM build does not
 * include the C++ extractors, so these tests exercise the JS fallback paths.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { currentKernel, initKernel } from './setup.js';
import { getKernel } from '../src/kernel/index.js';
import type { KernelAdapter } from '../src/kernel/types.js';
import { measureBulk, resetMeasureDetectionCache } from '../src/kernel/measureOps.js';
import { transformBatch, resetTransformDetectionCache } from '../src/kernel/transformOps.js';
import { box, getEdges } from '../src/index.js';

let kernel: KernelAdapter;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- unwrap branded shape
function oc(shape: any): any {
  return shape.wrapped;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- KernelInstance is any; direct access for testing
function getOcInstance(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DefaultAdapter.oc is KernelInstance (any)
  return (kernel as any).oc;
}

beforeAll(async () => {
  await initKernel();
  kernel = getKernel();
}, 30000);

describe.skipIf(currentKernel !== 'occt')('OCCT-specific: measureBulk', () => {
  describe('measureBulk', () => {
    it('returns volume, area, center, bbox via JS fallback', () => {
      const b = oc(box(3, 4, 5));
      const result = measureBulk(getOcInstance(), b);
      expect(result.volume).toBeCloseTo(60, 2);
      expect(result.area).toBeCloseTo(94, 1);
      expect(result.length).toBe(0);
      expect(result.centerOfMass[0]).toBeCloseTo(1.5, 1);
      expect(result.centerOfMass[1]).toBeCloseTo(2, 1);
      expect(result.centerOfMass[2]).toBeCloseTo(2.5, 1);
      expect(result.boundingBox.max[0]).toBeCloseTo(3, 1);
      expect(result.boundingBox.max[1]).toBeCloseTo(4, 1);
      expect(result.boundingBox.max[2]).toBeCloseTo(5, 1);
    });

    it('includes linear length when requested', () => {
      const b = box(10, 10, 10);
      const edges = getEdges(b);
      const firstEdge = edges[0];
      expect(firstEdge).toBeDefined();
      const result = measureBulk(getOcInstance(), oc(firstEdge), true);
      expect(result.length).toBeCloseTo(10, 1);
    });

    it('detection cache can be reset', () => {
      // Should not throw — resetMeasureDetectionCache is a no-op reset
      expect(() => {
        resetMeasureDetectionCache();
      }).not.toThrow();
    });
  });

  describe('transformBatch', () => {
    it('applies multiple transforms via JS fallback', () => {
      const b = oc(box(10, 10, 10));
      const shapes = transformBatch(getOcInstance(), [
        { type: 'translate', shape: b, x: 10, y: 0, z: 0 },
        { type: 'scale', shape: b, center: [0, 0, 0], factor: 2 },
      ]);
      expect(shapes).toHaveLength(2);
      const translated = shapes[0];
      const scaled = shapes[1];
      expect(translated).toBeDefined();
      expect(scaled).toBeDefined();
      expect(kernel.volume(translated)).toBeCloseTo(1000, 0);
      expect(kernel.volume(scaled)).toBeCloseTo(8000, 0);
    });

    it('applies rotate transform', () => {
      const b = oc(box(10, 10, 10));
      const shapes = transformBatch(getOcInstance(), [
        { type: 'rotate', shape: b, angle: 90, axis: [0, 0, 1], center: [0, 0, 0] },
      ]);
      expect(shapes).toHaveLength(1);
      const rotated = shapes[0];
      expect(rotated).toBeDefined();
      expect(kernel.volume(rotated)).toBeCloseTo(1000, 0);
    });

    it('applies mirror transform', () => {
      const b = oc(box(10, 10, 10));
      const shapes = transformBatch(getOcInstance(), [
        { type: 'mirror', shape: b, origin: [0, 0, 0], normal: [1, 0, 0] },
      ]);
      expect(shapes).toHaveLength(1);
      const mirrored = shapes[0];
      expect(mirrored).toBeDefined();
      expect(kernel.volume(mirrored)).toBeCloseTo(1000, 0);
    });

    it('returns empty array for empty entries', () => {
      const shapes = transformBatch(getOcInstance(), []);
      expect(shapes).toHaveLength(0);
    });

    it('detection cache can be reset', () => {
      expect(() => {
        resetTransformDetectionCache();
      }).not.toThrow();
    });
  });
});
