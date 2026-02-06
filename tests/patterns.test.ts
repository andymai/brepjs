import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  linearPattern,
  circularPattern,
  isOk,
  isErr,
  unwrap,
  fnMeasureVolume,
  translateShape,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('linearPattern', () => {
  it('creates a linear pattern of boxes', () => {
    const box = makeBox([0, 0, 0], [5, 5, 5]);
    const result = linearPattern(box, [1, 0, 0], 3, 10);
    expect(isOk(result)).toBe(true);
    const pattern = unwrap(result);
    expect(pattern).toBeDefined();
    // 3 non-overlapping boxes (spacing=10 > box width=5)
    const vol = fnMeasureVolume(pattern);
    expect(vol).toBeCloseTo(5 * 5 * 5 * 3, -1);
  });

  it('returns original shape when count is 1', () => {
    const box = makeBox([0, 0, 0], [5, 5, 5]);
    const result = linearPattern(box, [1, 0, 0], 1, 10);
    expect(isOk(result)).toBe(true);
    const pattern = unwrap(result);
    const vol = fnMeasureVolume(pattern);
    expect(vol).toBeCloseTo(5 * 5 * 5, -1);
  });

  it('returns error for count < 1', () => {
    const box = makeBox([0, 0, 0], [5, 5, 5]);
    const result = linearPattern(box, [1, 0, 0], 0, 10);
    expect(isErr(result)).toBe(true);
  });

  it('returns error for zero direction', () => {
    const box = makeBox([0, 0, 0], [5, 5, 5]);
    const result = linearPattern(box, [0, 0, 0], 3, 10);
    expect(isErr(result)).toBe(true);
  });
});

describe('circularPattern', () => {
  it('creates a circular pattern around Z axis', () => {
    // Create a box offset from the origin so copies don't overlap
    const box = translateShape(makeBox([0, 0, 0], [2, 2, 2]), [10, 0, 0]);
    const result = circularPattern(box, [0, 0, 1], 4, 360);
    expect(isOk(result)).toBe(true);
    const pattern = unwrap(result);
    expect(pattern).toBeDefined();
    const vol = fnMeasureVolume(pattern);
    expect(vol).toBeCloseTo(2 * 2 * 2 * 4, -1);
  });

  it('creates a partial circular pattern', () => {
    const box = translateShape(makeBox([0, 0, 0], [2, 2, 2]), [10, 0, 0]);
    const result = circularPattern(box, [0, 0, 1], 3, 180);
    expect(isOk(result)).toBe(true);
    const pattern = unwrap(result);
    expect(pattern).toBeDefined();
    const vol = fnMeasureVolume(pattern);
    expect(vol).toBeCloseTo(2 * 2 * 2 * 3, -1);
  });

  it('returns error for count < 1', () => {
    const box = makeBox([0, 0, 0], [5, 5, 5]);
    const result = circularPattern(box, [0, 0, 1], 0);
    expect(isErr(result)).toBe(true);
  });

  it('returns error for zero axis', () => {
    const box = makeBox([0, 0, 0], [5, 5, 5]);
    const result = circularPattern(box, [0, 0, 0], 4);
    expect(isErr(result)).toBe(true);
  });
});
