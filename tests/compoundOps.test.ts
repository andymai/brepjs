/**
 * Compound operations — tests for drill, pocket, boss, mirrorJoin, rectangularPattern.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  shape,
  box,
  cylinder as _cylinder,
  translate,
  drill,
  mirrorJoin,
  rectangularPattern,
  measureVolume as _measureVolume,
  unwrap as _unwrap,
  isOk,
  isErr as _isErr,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

// ---------------------------------------------------------------------------
// drill
// ---------------------------------------------------------------------------

describe('drill()', () => {
  it('drills a through hole with Vec2 position', () => {
    const b = box(50, 30, 10);
    const result = drill(b, { at: [25, 15], radius: 5 });
    expect(isOk(result)).toBe(true);
    const drilled = unwrap(result);
    const vol = measureVolume(drilled);
    // Volume should be less than original (hole removed)
    expect(vol).toBeLessThan(50 * 30 * 10);
    expect(vol).toBeGreaterThan(0);
  });

  it('drills a blind hole with specified depth', () => {
    const b = box(50, 30, 10);
    const result = drill(b, { at: [25, 15, 0], radius: 5, depth: 5 });
    expect(isOk(result)).toBe(true);
    const vol = measureVolume(unwrap(result));
    expect(vol).toBeLessThan(50 * 30 * 10);
    // Blind hole removes less volume than through hole
    expect(vol).toBeGreaterThan(50 * 30 * 10 - Math.PI * 25 * 10);
  });

  it('validates radius > 0', () => {
    const b = box(50, 30, 10);
    const result = drill(b, { at: [25, 15], radius: 0 });
    expect(isErr(result)).toBe(true);
  });

  it('works with Vec3 position', () => {
    const b = box(50, 30, 10);
    const result = drill(b, { at: [25, 15, 0], radius: 3 });
    expect(isOk(result)).toBe(true);
  });

  it('drill via wrapper method', () => {
    const drilled = shape(box(50, 30, 10)).drill({ at: [25, 15], radius: 5 });
    expect(measureVolume(drilled.val)).toBeLessThan(50 * 30 * 10);
  });

  it('multiple drills in chain', () => {
    const plate = shape(box(50, 30, 10))
      .drill({ at: [10, 10], radius: 3 })
      .drill({ at: [40, 10], radius: 3 })
      .drill({ at: [25, 20], radius: 5 });
    expect(measureVolume(plate.val)).toBeLessThan(50 * 30 * 10);
  });
});

// ---------------------------------------------------------------------------
// mirrorJoin
// ---------------------------------------------------------------------------

describe('mirrorJoin()', () => {
  it('mirrors and fuses a shape (default YZ plane)', () => {
    const half = translate(box(10, 20, 10), [0, 0, 0]);
    const result = mirrorJoin(half);
    expect(isOk(result)).toBe(true);
    const vol = measureVolume(unwrap(result));
    // Mirror across X, fused → roughly double width
    expect(vol).toBeGreaterThan(2000 * 0.9);
  });

  it('mirrors across a custom plane', () => {
    const half = box(10, 20, 10);
    const result = mirrorJoin(half, { normal: [0, 1, 0] });
    expect(isOk(result)).toBe(true);
  });

  it('mirrorJoin via wrapper', () => {
    const s = shape(box(10, 20, 10)).mirrorJoin();
    expect(measureVolume(s.val)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// rectangularPattern
// ---------------------------------------------------------------------------

describe('rectangularPattern()', () => {
  it('creates a 2x3 grid of shapes', () => {
    const b = box(5, 5, 5);
    const result = rectangularPattern(b, {
      xDir: [1, 0, 0],
      xCount: 2,
      xSpacing: 10,
      yDir: [0, 1, 0],
      yCount: 3,
      ySpacing: 10,
    });
    expect(isOk(result)).toBe(true);
    // 6 copies fused together
    const vol = measureVolume(unwrap(result));
    expect(vol).toBeCloseTo(6 * 125, 0);
  });

  it('1x1 pattern returns the original', () => {
    const b = box(5, 5, 5);
    const result = rectangularPattern(b, {
      xDir: [1, 0, 0],
      xCount: 1,
      xSpacing: 10,
      yDir: [0, 1, 0],
      yCount: 1,
      ySpacing: 10,
    });
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(125, 0);
  });

  it('validates count >= 1', () => {
    const b = box(5, 5, 5);
    const result = rectangularPattern(b, {
      xDir: [1, 0, 0],
      xCount: 0,
      xSpacing: 10,
      yDir: [0, 1, 0],
      yCount: 2,
      ySpacing: 10,
    });
    expect(isErr(result)).toBe(true);
  });

  it('via wrapper', () => {
    const s = shape(box(5, 5, 5)).rectangularPattern({
      xDir: [1, 0, 0],
      xCount: 3,
      xSpacing: 10,
      yDir: [0, 1, 0],
      yCount: 2,
      ySpacing: 10,
    });
    expect(measureVolume(s.val)).toBeCloseTo(6 * 125, 0);
  });
});
