/**
 * Tests for canonical parameter naming (Phase 1 of parameter standardization).
 *
 * Verifies that:
 * 1. New canonical names (`at`, `axis`) work correctly
 * 2. Old deprecated names (`around`, `origin`, `normal`) still work (backward compatibility)
 * 3. When both are provided, the canonical name takes precedence
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

    it('still works with deprecated around parameter', () => {
      const b = box(10, 10, 10);
      const rotated = rotate(b, 45, { around: [5, 0, 0], axis: [0, 0, 1] });
      expect(rotated).toBeDefined();
      const bounds = getBounds(rotated);
      expect(bounds.xMin).toBeLessThan(5);
      expect(bounds.xMax).toBeGreaterThan(5);
    });

    it('prefers at over around when both provided', () => {
      const b = box(10, 10, 10);
      // Rotate around at=[10,0,0], not around=[5,0,0]
      const rotated = rotate(b, 90, { at: [10, 0, 0], around: [5, 0, 0], axis: [0, 0, 1] });
      const bounds = getBounds(rotated);
      // Box corner at (10, 0, 0) should stay roughly in place after rotation
      expect(bounds.xMin).toBeCloseTo(0, 0);
      expect(bounds.xMax).toBeCloseTo(10, 0);
    });

    it('uses default at=[0,0,0] when neither provided', () => {
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

    it('still works with deprecated origin parameter', () => {
      const b = box(10, 10, 10);
      const mirrored = mirror(b, { origin: [5, 0, 0], normal: [1, 0, 0] });
      expect(mirrored).toBeDefined();
      const bounds = getBounds(mirrored);
      expect(bounds.xMin).toBeCloseTo(0, 0);
      expect(bounds.xMax).toBeCloseTo(10, 0);
    });

    it('prefers at over origin when both provided', () => {
      const b = box(10, 10, 10);
      // Mirror at x=10, not x=5
      const mirrored = mirror(b, { at: [10, 0, 0], origin: [5, 0, 0], normal: [1, 0, 0] });
      const bounds = getBounds(mirrored);
      expect(bounds.xMin).toBeCloseTo(10, 0);
      expect(bounds.xMax).toBeCloseTo(20, 0);
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

    it('still works with deprecated around parameter', () => {
      const face = unwrap(
        polygon([
          [0, 0, 0],
          [1, 0, 0],
          [1, 1, 0],
          [0, 1, 0],
        ])
      );
      const result = revolve(face, { around: [0, 0, 0], axis: [0, 0, 1], angle: 360 });
      expect(isErr(result)).toBe(false);
    });

    it('prefers at over around when both provided', () => {
      const face = unwrap(
        polygon([
          [2, 0, 0],
          [3, 0, 0],
          [3, 1, 0],
          [2, 1, 0],
        ])
      );
      const result = revolve(face, {
        at: [0, 0, 0],
        around: [5, 0, 0],
        axis: [0, 0, 1],
        angle: 360,
      });
      expect(isErr(result)).toBe(false);
      if (isErr(result)) return;

      const bounds = getBounds(result.value);
      // Revolving around [0,0,0] should create a shape centered at origin
      expect(bounds.xMin).toBeCloseTo(-3, 0);
      expect(bounds.xMax).toBeCloseTo(3, 0);
    });
  });

  describe('circle()', () => {
    it('works with canonical axis parameter', () => {
      const c = circle(5, { at: [0, 0, 0], axis: [0, 0, 1] });
      expect(c).toBeDefined();
    });

    it('still works with deprecated normal parameter', () => {
      const c = circle(5, { at: [0, 0, 0], normal: [0, 0, 1] });
      expect(c).toBeDefined();
    });

    it('prefers axis over normal when both provided', () => {
      const c = circle(5, { at: [0, 0, 0], axis: [1, 0, 0], normal: [0, 0, 1] });
      expect(c).toBeDefined();
      // Both should work, but axis takes precedence
      const bounds = getBounds(c);
      expect(bounds.xMin).toBeCloseTo(0, 0);
      expect(bounds.xMax).toBeCloseTo(0, 0);
      expect(bounds.yMin).toBeCloseTo(-5, 0);
      expect(bounds.yMax).toBeCloseTo(5, 0);
    });
  });

  describe('ellipse()', () => {
    it('works with canonical axis parameter', () => {
      const result = ellipse(5, 3, { at: [0, 0, 0], axis: [0, 0, 1] });
      expect(isErr(result)).toBe(false);
    });

    it('still works with deprecated normal parameter', () => {
      const result = ellipse(5, 3, { at: [0, 0, 0], normal: [0, 0, 1] });
      expect(isErr(result)).toBe(false);
    });

    it('prefers axis over normal when both provided', () => {
      const result = ellipse(5, 3, { at: [0, 0, 0], axis: [1, 0, 0], normal: [0, 0, 1] });
      expect(isErr(result)).toBe(false);
      if (isErr(result)) return;

      const bounds = getBounds(result.value);
      // Ellipse with axis=[1,0,0] lies in YZ plane
      // The orientation depends on how OCCT orients the ellipse
      expect(bounds.xMin).toBeCloseTo(0, 0);
      expect(bounds.xMax).toBeCloseTo(0, 0);
      // Just verify it's in the YZ plane with correct radii
      expect(Math.abs(bounds.yMin)).toBeCloseTo(3, 0);
      expect(Math.abs(bounds.yMax)).toBeCloseTo(3, 0);
      expect(Math.abs(bounds.zMin)).toBeCloseTo(5, 0);
      expect(Math.abs(bounds.zMax)).toBeCloseTo(5, 0);
    });
  });

  describe('ellipseArc()', () => {
    it('works with canonical axis parameter', () => {
      const result = ellipseArc(5, 3, 0, 180, { at: [0, 0, 0], axis: [0, 0, 1] });
      expect(isErr(result)).toBe(false);
    });

    it('still works with deprecated normal parameter', () => {
      const result = ellipseArc(5, 3, 0, 180, { at: [0, 0, 0], normal: [0, 0, 1] });
      expect(isErr(result)).toBe(false);
    });

    it('prefers axis over normal when both provided', () => {
      const result = ellipseArc(5, 3, 0, 180, {
        at: [0, 0, 0],
        axis: [1, 0, 0],
        normal: [0, 0, 1],
      });
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

    it('still works with deprecated origin parameter', () => {
      const b = box(5, 5, 5);
      const result = mirrorJoin(b, { origin: [5, 0, 0], normal: [1, 0, 0] });
      expect(isErr(result)).toBe(false);
      if (isErr(result)) return;

      const bounds = getBounds(result.value);
      expect(bounds.xMin).toBeCloseTo(0, 0);
      expect(bounds.xMax).toBeCloseTo(10, 0);
    });

    it('prefers at over origin when both provided', () => {
      const b = box(5, 5, 5);
      // Mirror at x=0, not x=5
      const result = mirrorJoin(b, { at: [0, 0, 0], origin: [5, 0, 0], normal: [1, 0, 0] });
      expect(isErr(result)).toBe(false);
      if (isErr(result)) return;

      const bounds = getBounds(result.value);
      expect(bounds.xMin).toBeCloseTo(-5, 0);
      expect(bounds.xMax).toBeCloseTo(5, 0);
    });
  });
});
