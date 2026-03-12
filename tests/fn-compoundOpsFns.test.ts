/**
 * Functional API tests for compoundOpsFns — drill, pocket, boss, mirrorJoin, rectangularPattern.
 *
 * Follows fn-booleanFns.test.ts patterns: volume-based assertions, Result checks.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { isBrepkit } from './helpers/kernelEnv.js';
import {
  box,
  drill,
  pocket,
  boss,
  mirrorJoin,
  rectangularPattern,
  measureVolume,
  unwrap,
  unwrapErr,
  isOk,
  isErr,
  drawRectangle,
  createEdge,
  getKernel,
} from '../src/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

// ---------------------------------------------------------------------------
// drill
// ---------------------------------------------------------------------------

describe('drill()', () => {
  it('drills a hole with explicit depth — volume decreases by ~pi*r^2*d', () => {
    const b = box(50, 50, 20);
    const r = 5;
    const d = 10;
    const result = drill(b, { at: [25, 25, 20], radius: r, depth: d, axis: [0, 0, -1] });
    expect(isOk(result)).toBe(true);
    const vol = measureVolume(unwrap(result));
    const expected = 50 * 50 * 20 - Math.PI * r * r * d;
    expect(vol).toBeCloseTo(expected, -1);
  });

  it('drills through-all when no depth is given', () => {
    const b = box(50, 50, 20);
    const r = 5;
    const result = drill(b, { at: [25, 25], radius: r });
    expect(isOk(result)).toBe(true);
    const vol = measureVolume(unwrap(result));
    const originalVol = 50 * 50 * 20;
    const cylinderVol = Math.PI * r * r * 20;
    expect(vol).toBeLessThan(originalVol);
    expect(vol).toBeCloseTo(originalVol - cylinderVol, -2);
  });

  it('returns Err with DRILL_INVALID_RADIUS for radius <= 0', () => {
    const b = box(50, 50, 20);
    const result = drill(b, { at: [25, 25], radius: -1 });
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('DRILL_INVALID_RADIUS');
  });

  it('returns Err with DRILL_ZERO_AXIS for zero axis', () => {
    const b = box(50, 50, 20);
    const result = drill(b, { at: [25, 25], radius: 5, axis: [0, 0, 0] });
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('DRILL_ZERO_AXIS');
  });
});

// ---------------------------------------------------------------------------
// pocket
// ---------------------------------------------------------------------------

describe('pocket()', () => {
  it('pockets into box top face — succeeds and volume does not increase', () => {
    const b = box(50, 50, 20);
    const profile = drawRectangle(20, 10);
    const result = pocket(b, { profile, depth: 5 });
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeLessThanOrEqual(50 * 50 * 20);
  });

  it('returns Err with POCKET_INVALID_DEPTH for depth <= 0', () => {
    const b = box(50, 50, 20);
    const profile = drawRectangle(20, 10);
    const result = pocket(b, { profile, depth: -1 });
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('POCKET_INVALID_DEPTH');
  });

  it('returns Err with COMPOUND_NO_FACES for shape with no faces', (ctx) => {
    // brepkit skip: uses raw OCCT API (oc.gp_Pnt_3, BRepBuilderAPI_MakeEdge_3)
    if (isBrepkit) ctx.skip();
    const oc = getKernel().oc;
    const p1 = new oc.gp_Pnt_3(0, 0, 0);
    const p2 = new oc.gp_Pnt_3(10, 0, 0);
    const edgeBuilder = new oc.BRepBuilderAPI_MakeEdge_3(p1, p2);
    const edge = createEdge(edgeBuilder.Edge());
    edgeBuilder.delete();
    p1.delete();
    p2.delete();

    const profile = drawRectangle(5, 5);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing edge case with wrong shape type
    const result = pocket(edge as any, { profile, depth: 5 });
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('COMPOUND_NO_FACES');
  });

  it('returns Err with COMPOUND_FACE_NOT_FOUND when finder matches nothing', () => {
    const b = box(50, 50, 20);
    const profile = drawRectangle(20, 10);
    const result = pocket(b, {
      profile,
      depth: 5,
      face: (ff) => ff.atDistance(1e9, [0, 0, 0]),
    });
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('COMPOUND_FACE_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// boss
// ---------------------------------------------------------------------------

describe('boss()', () => {
  it('adds a boss onto box top face — volume increases', () => {
    const b = box(50, 50, 20);
    const profile = drawRectangle(20, 10);
    const result = boss(b, { profile, height: 5 });
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeGreaterThan(50 * 50 * 20);
  });

  it('returns Err with BOSS_INVALID_HEIGHT for height <= 0', () => {
    const b = box(50, 50, 20);
    const profile = drawRectangle(20, 10);
    const result = boss(b, { profile, height: -1 });
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('BOSS_INVALID_HEIGHT');
  });
});

// ---------------------------------------------------------------------------
// mirrorJoin
// ---------------------------------------------------------------------------

describe('mirrorJoin()', () => {
  it('mirror-join along X approximately doubles volume', () => {
    const b = box(10, 10, 10);
    const result = mirrorJoin(b);
    expect(isOk(result)).toBe(true);
    const vol = measureVolume(unwrap(result));
    expect(vol).toBeCloseTo(2000, -1);
  });
});

// ---------------------------------------------------------------------------
// rectangularPattern
// ---------------------------------------------------------------------------

describe('rectangularPattern()', () => {
  it('2x2 pattern — volume is ~4x original', () => {
    const b = box(5, 5, 5);
    const result = rectangularPattern(b, {
      xDir: [1, 0, 0],
      xCount: 2,
      xSpacing: 20,
      yDir: [0, 1, 0],
      yCount: 2,
      ySpacing: 20,
    });
    expect(isOk(result)).toBe(true);
    const vol = measureVolume(unwrap(result));
    expect(vol).toBeCloseTo(4 * 125, 0);
  });

  it('returns Err with PATTERN_INVALID_COUNT for count < 1', () => {
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
    expect(unwrapErr(result).code).toBe('PATTERN_INVALID_COUNT');
  });

  it('returns Err with PATTERN_ZERO_DIRECTION for zero xDir', () => {
    const b = box(5, 5, 5);
    const result = rectangularPattern(b, {
      xDir: [0, 0, 0],
      xCount: 2,
      xSpacing: 10,
      yDir: [0, 1, 0],
      yCount: 2,
      ySpacing: 10,
    });
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('PATTERN_ZERO_DIRECTION');
  });

  it('returns Err with PATTERN_ZERO_DIRECTION for zero yDir', () => {
    const b = box(5, 5, 5);
    const result = rectangularPattern(b, {
      xDir: [1, 0, 0],
      xCount: 2,
      xSpacing: 10,
      yDir: [0, 0, 0],
      yCount: 2,
      ySpacing: 10,
    });
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('PATTERN_ZERO_DIRECTION');
  });
});
