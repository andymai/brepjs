/**
 * Tests for Symbol.dispose on 2D resource types (Blueprint, Curve2D, BoundingBox2d).
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { BlueprintSketcher } from '../src/sketching/Sketcher2d.js';
import { BoundingBox2d } from '../src/2d/lib/BoundingBox2d.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('Symbol.dispose on 2D types', () => {
  describe('Blueprint', () => {
    it('has Symbol.dispose method', () => {
      const bp = new BlueprintSketcher()
        .movePointerTo([0, 0])
        .lineTo([10, 0])
        .lineTo([10, 10])
        .lineTo([0, 10])
        .close();
      expect(typeof bp[Symbol.dispose]).toBe('function');
      bp.delete();
    });

    it('Symbol.dispose delegates to delete()', () => {
      const bp = new BlueprintSketcher()
        .movePointerTo([0, 0])
        .lineTo([10, 0])
        .lineTo([10, 10])
        .lineTo([0, 10])
        .close();

      // Should not throw
      bp[Symbol.dispose]();

      // Double dispose is safe (delegates to delete which is idempotent via curves)
      bp[Symbol.dispose]();
    });
  });

  describe('BoundingBox2d', () => {
    it('has Symbol.dispose method', () => {
      const bbox = new BoundingBox2d();
      expect(typeof bbox[Symbol.dispose]).toBe('function');
      bbox.delete();
    });

    it('Symbol.dispose delegates to delete()', () => {
      const bbox = new BoundingBox2d();
      bbox[Symbol.dispose]();
      // Accessing wrapped after disposal should throw
      expect(() => bbox.wrapped).toThrow('deleted');
    });

    it('double dispose is safe', () => {
      const bbox = new BoundingBox2d();
      bbox[Symbol.dispose]();
      bbox[Symbol.dispose](); // Should not throw
    });
  });

  describe('Curve2D', () => {
    it('has Symbol.dispose method on curves from a Blueprint', () => {
      const bp = new BlueprintSketcher()
        .movePointerTo([0, 0])
        .lineTo([10, 0])
        .lineTo([10, 10])
        .close();

      const curves = bp.curves;
      expect(curves.length).toBeGreaterThan(0);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test asserts length > 0 above
      const curve = curves[0]!;
      expect(typeof curve[Symbol.dispose]).toBe('function');

      curve[Symbol.dispose]();
      // Accessing wrapped after disposal should throw
      expect(() => curve.wrapped).toThrow('deleted');
    });
  });
});
