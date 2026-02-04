import { describe, expect, it } from 'vitest';
import { isPoint2D, isMatrix2X2 } from '../src/2d/lib/definitions.js';

describe('isPoint2D', () => {
  it('returns true for valid 2D points', () => {
    expect(isPoint2D([0, 0])).toBe(true);
    expect(isPoint2D([1.5, -2.3])).toBe(true);
  });

  it('returns false for non-arrays', () => {
    expect(isPoint2D('hello')).toBe(false);
    expect(isPoint2D(42)).toBe(false);
    expect(isPoint2D(null)).toBe(false);
    expect(isPoint2D(undefined)).toBe(false);
  });

  it('returns false for wrong-length arrays', () => {
    expect(isPoint2D([1])).toBe(false);
    expect(isPoint2D([1, 2, 3])).toBe(false);
    expect(isPoint2D([])).toBe(false);
  });

  it('returns false for arrays with non-numeric elements', () => {
    expect(isPoint2D(['a', 'b'])).toBe(false);
    expect(isPoint2D([1, 'b'])).toBe(false);
    expect(isPoint2D(['a', 2])).toBe(false);
    expect(isPoint2D([null, 1])).toBe(false);
    expect(isPoint2D([1, undefined])).toBe(false);
    expect(isPoint2D([{}, {}])).toBe(false);
  });
});

describe('isMatrix2X2', () => {
  it('returns true for valid 2x2 matrices', () => {
    expect(
      isMatrix2X2([
        [1, 0],
        [0, 1],
      ])
    ).toBe(true);
    expect(
      isMatrix2X2([
        [0, 0],
        [0, 0],
      ])
    ).toBe(true);
  });

  it('returns false for non-arrays', () => {
    expect(isMatrix2X2('hello')).toBe(false);
    expect(isMatrix2X2(42)).toBe(false);
  });

  it('returns false for wrong dimensions', () => {
    expect(
      isMatrix2X2([
        [1, 2, 3],
        [4, 5, 6],
      ])
    ).toBe(false);
    expect(isMatrix2X2([[1, 2]])).toBe(false);
    expect(isMatrix2X2([])).toBe(false);
  });

  it('returns false for matrices with non-numeric elements', () => {
    expect(
      isMatrix2X2([
        ['a', 'b'],
        ['c', 'd'],
      ])
    ).toBe(false);
    expect(
      isMatrix2X2([
        [1, 2],
        ['a', 'b'],
      ])
    ).toBe(false);
    expect(
      isMatrix2X2([
        [1, null],
        [3, 4],
      ])
    ).toBe(false);
  });
});
