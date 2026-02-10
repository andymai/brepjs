/**
 * Tests for canonical parameter naming.
 *
 * Verifies that the canonical names (`at`, `axis`) work correctly
 * for all functions that accept them.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { box, polygon } from '../src/topology/primitiveFns.js';
import { rotate, mirror } from '../src/topology/api.js';
import { revolve } from '../src/operations/api.js';
import { circle, ellipse, ellipseArc } from '../src/topology/primitiveFns.js';
import { mirrorJoin } from '../src/topology/compoundOpsFns.js';
import { getBounds } from '../src/topology/shapeFns.js';
import { isErr, unwrap } from '../src/core/result.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Canonical parameter names', () => {
  describe('rotate()', () => {
    it('works with canonical at parameter', () => {
      const b = box(10, 10, 10);
      const rotated = rotate(b, 45, { at: [5, 0, 0], axis: [0, 0, 1] });
      expect(rotated).toBeDefined();
      const bounds = getBounds(rotated);
      expect(bounds.xMin).toBeLessThan(5);
      expect(bounds.xMax).toBeGreaterThan(5);
    });

    it('uses default at=[0,0,0] when not provided', () => {
      const b = box(10, 10, 10);
      const rotated = rotate(b, 45, { axis: [0, 0, 1] });
      expect(rotated).toBeDefined();
    });
  });

  describe('mirror()', () => {
    it('works with canonical at parameter', () => {
      const b = box(10, 10, 10);
      const mirrored = mirror(b, { at: [5, 0, 0], normal: [1, 0, 0] });
      expect(mirrored).toBeDefined();
      const bounds = getBounds(mirrored);
      expect(bounds.xMin).toBeCloseTo(0, 0);
      expect(bounds.xMax).toBeCloseTo(10, 0);
    });
  });

  describe('revolve()', () => {
    it('works with canonical at parameter', () => {
      const face = unwrap(
        polygon([
          [0, 0, 0],
          [1, 0, 0],
          [1, 1, 0],
          [0, 1, 0],
        ])
      );
      const result = revolve(face, { at: [0, 0, 0], axis: [0, 0, 1], angle: 360 });
      expect(isErr(result)).toBe(false);
    });
  });

  describe('circle()', () => {
    it('works with canonical axis parameter', () => {
      const c = circle(5, { at: [0, 0, 0], axis: [0, 0, 1] });
      expect(c).toBeDefined();
    });
  });

  describe('ellipse()', () => {
    it('works with canonical axis parameter', () => {
      const result = ellipse(5, 3, { at: [0, 0, 0], axis: [0, 0, 1] });
      expect(isErr(result)).toBe(false);
    });
  });

  describe('ellipseArc()', () => {
    it('works with canonical axis parameter', () => {
      const result = ellipseArc(5, 3, 0, 180, { at: [0, 0, 0], axis: [0, 0, 1] });
      expect(isErr(result)).toBe(false);
    });
  });

  describe('mirrorJoin()', () => {
    it('works with canonical at parameter', () => {
      const b = box(5, 5, 5);
      const result = mirrorJoin(b, { at: [5, 0, 0], normal: [1, 0, 0] });
      expect(isErr(result)).toBe(false);
      if (isErr(result)) return;

      const bounds = getBounds(result.value);
      expect(bounds.xMin).toBeCloseTo(0, 0);
      expect(bounds.xMax).toBeCloseTo(10, 0);
    });
  });
});
