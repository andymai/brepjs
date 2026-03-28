/**
 * Regression tests for issue #712:
 * Drawing.intersect() crashes with BrepBugError in rotateToStartAtSegment
 * when intersecting shapes that produce common (overlapping) segments.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { drawRectangle, drawRoundedRectangle } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('issue #712: rotateToStartAtSegment crash', () => {
  it('intersects two rectangles with shared edge (translate by half width)', () => {
    const a = drawRectangle(10, 10);
    const b = drawRectangle(10, 10).translate(5, 0);
    const result = a.intersect(b);
    expect(result).toBeDefined();
  });

  it('intersects two rectangles with shared edge (exact edge alignment)', () => {
    const a = drawRectangle(10, 10);
    const b = drawRectangle(10, 10).translate(10, 0);
    expect(() => a.intersect(b)).not.toThrow();
  });

  it('intersects rectangle with rounded rectangle (shared straight segments)', () => {
    const a = drawRectangle(10, 10);
    const b = drawRoundedRectangle(10, 10, 1).translate(-5, 0);
    const result = a.intersect(b);
    expect(result).toBeDefined();
  });

  it('intersects two rounded rectangles with shared segments', () => {
    const a = drawRoundedRectangle(10, 10, 1);
    const b = drawRoundedRectangle(10, 10, 1).translate(3, 0);
    const result = a.intersect(b);
    expect(result).toBeDefined();
  });

  it('intersects rectangle with translated rounded rectangle (issue repro)', () => {
    const a = drawRectangle(12, 8);
    const b = drawRoundedRectangle(10, 10, 1).translate(-5, 0);
    const result = a.intersect(b);
    expect(result).toBeDefined();
  });

  it('intersects drawing with rounded rect (approximate lip profile)', () => {
    const profile = drawRectangle(6, 4).translate(0, 2);
    const clip = drawRoundedRectangle(10, 10, 1).translate(-5, 0);
    const result = profile.intersect(clip);
    expect(result).toBeDefined();
  });

  it('intersects shapes with near-boundary common segments', () => {
    const a = drawRoundedRectangle(10, 10, 2);
    const b = drawRoundedRectangle(10, 10, 2).translate(5, 0);
    const result = a.intersect(b);
    expect(result).toBeDefined();
  });

  it('intersects with negative translate (issue exact params)', () => {
    const a = drawRectangle(10, 10);
    const b = drawRoundedRectangle(10, 10).translate(-5, 0);
    const result = a.intersect(b);
    expect(result).toBeDefined();
  });
});
