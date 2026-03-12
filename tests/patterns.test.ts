import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  linearPattern,
  circularPattern,
  isOk,
  isErr,
  unwrap,
  measureVolume,
  translate,
} from '../src/index.js';
import { gridPattern } from '../src/operations/patternFns.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('linearPattern', () => {
  it('creates a linear pattern of boxes', () => {
    const b = box(5, 5, 5);
    const result = linearPattern(b, [1, 0, 0], 3, 10);
    expect(isOk(result)).toBe(true);
    const pattern = unwrap(result);
    expect(pattern).toBeDefined();
    // 3 non-overlapping boxes (spacing=10 > box width=5)
    const vol = measureVolume(pattern);
    expect(vol).toBeCloseTo(5 * 5 * 5 * 3, -1);
  });

  it('returns original shape when count is 1', () => {
    const b = box(5, 5, 5);
    const result = linearPattern(b, [1, 0, 0], 1, 10);
    expect(isOk(result)).toBe(true);
    const pattern = unwrap(result);
    const vol = measureVolume(pattern);
    expect(vol).toBeCloseTo(5 * 5 * 5, -1);
  });

  it('returns error for count < 1', () => {
    const b = box(5, 5, 5);
    const result = linearPattern(b, [1, 0, 0], 0, 10);
    expect(isErr(result)).toBe(true);
  });

  it('returns error for zero direction', () => {
    const b = box(5, 5, 5);
    const result = linearPattern(b, [0, 0, 0], 3, 10);
    expect(isErr(result)).toBe(true);
  });
});

describe('circularPattern', () => {
  it('creates a circular pattern around Z axis', () => {
    // Create a box offset from the origin so copies don't overlap
    const b = translate(box(2, 2, 2), [10, 0, 0]);
    const result = circularPattern(b, [0, 0, 1], 4, 360);
    expect(isOk(result)).toBe(true);
    const pattern = unwrap(result);
    expect(pattern).toBeDefined();
    const vol = measureVolume(pattern);
    expect(vol).toBeCloseTo(2 * 2 * 2 * 4, -1);
  });

  it('creates a partial circular pattern', () => {
    const b = translate(box(2, 2, 2), [10, 0, 0]);
    const result = circularPattern(b, [0, 0, 1], 3, 180);
    expect(isOk(result)).toBe(true);
    const pattern = unwrap(result);
    expect(pattern).toBeDefined();
    const vol = measureVolume(pattern);
    expect(vol).toBeCloseTo(2 * 2 * 2 * 3, -1);
  });

  it('returns error for count < 1', () => {
    const b = box(5, 5, 5);
    const result = circularPattern(b, [0, 0, 1], 0);
    expect(isErr(result)).toBe(true);
  });

  it('returns error for zero axis', () => {
    const b = box(5, 5, 5);
    const result = circularPattern(b, [0, 0, 0], 4);
    expect(isErr(result)).toBe(true);
  });

  it('returns original shape when count is 1', () => {
    const b = box(5, 5, 5);
    const result = circularPattern(b, [0, 0, 1], 1);
    expect(isOk(result)).toBe(true);
    const pattern = unwrap(result);
    const vol = measureVolume(pattern);
    expect(vol).toBeCloseTo(5 * 5 * 5, -1);
  });
});

describe('gridPattern', () => {
  it('creates a 2x3 grid of boxes', () => {
    const b = box(2, 2, 2);
    const result = gridPattern(b, [1, 0, 0], [0, 1, 0], 2, 3, 5, 5);
    expect(isOk(result)).toBe(true);
    const pattern = unwrap(result);
    const vol = measureVolume(pattern);
    // 6 non-overlapping boxes (spacing=5 > size=2)
    expect(vol).toBeCloseTo(2 * 2 * 2 * 6, -1);
  });

  it('returns original shape when both counts are 1', () => {
    const b = box(5, 5, 5);
    const result = gridPattern(b, [1, 0, 0], [0, 1, 0], 1, 1, 10, 10);
    expect(isOk(result)).toBe(true);
    const vol = measureVolume(unwrap(result));
    expect(vol).toBeCloseTo(5 * 5 * 5, -1);
  });

  it('returns error for countX < 1', () => {
    const b = box(5, 5, 5);
    const result = gridPattern(b, [1, 0, 0], [0, 1, 0], 0, 3, 10, 10);
    expect(isErr(result)).toBe(true);
  });

  it('returns error for countY < 1', () => {
    const b = box(5, 5, 5);
    const result = gridPattern(b, [1, 0, 0], [0, 1, 0], 3, 0, 10, 10);
    expect(isErr(result)).toBe(true);
  });

  it('returns error for zero directionX', () => {
    const b = box(5, 5, 5);
    const result = gridPattern(b, [0, 0, 0], [0, 1, 0], 2, 2, 10, 10);
    expect(isErr(result)).toBe(true);
  });

  it('returns error for zero directionY', () => {
    const b = box(5, 5, 5);
    const result = gridPattern(b, [1, 0, 0], [0, 0, 0], 2, 2, 10, 10);
    expect(isErr(result)).toBe(true);
  });

  it('creates a 1xN grid (single row)', () => {
    const b = box(2, 2, 2);
    const result = gridPattern(b, [1, 0, 0], [0, 1, 0], 1, 4, 5, 5);
    expect(isOk(result)).toBe(true);
    const vol = measureVolume(unwrap(result));
    expect(vol).toBeCloseTo(2 * 2 * 2 * 4, -1);
  });

  it('creates a Nx1 grid (single column)', () => {
    const b = box(2, 2, 2);
    const result = gridPattern(b, [1, 0, 0], [0, 1, 0], 3, 1, 5, 5);
    expect(isOk(result)).toBe(true);
    const vol = measureVolume(unwrap(result));
    expect(vol).toBeCloseTo(2 * 2 * 2 * 3, -1);
  });
});
