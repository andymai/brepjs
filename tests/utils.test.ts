import { describe, expect, it } from 'vitest';
import range from '../src/utils/range.js';
import zip from '../src/utils/zip.js';
import round2 from '../src/utils/round2.js';
import round5 from '../src/utils/round5.js';
import precisionRound from '../src/utils/precisionRound.js';
import { uuidv } from '../src/utils/uuid.js';

describe('range', () => {
  it('returns an array of integers from 0 to len-1', () => {
    expect(range(5)).toEqual([0, 1, 2, 3, 4]);
  });

  it('returns empty array for 0', () => {
    expect(range(0)).toEqual([]);
  });
});

describe('zip', () => {
  it('zips two arrays of equal length', () => {
    expect(
      zip([
        [1, 2, 3],
        ['a', 'b', 'c'],
      ])
    ).toEqual([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ]);
  });

  it('truncates to the shortest array', () => {
    expect(
      zip([
        [1, 2],
        ['a', 'b', 'c'],
      ])
    ).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
  });

  it('returns empty when one array is empty', () => {
    expect(zip([[], [1, 2]])).toEqual([]);
  });
});

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(1.456)).toBe(1.46);
    expect(round2(1.454)).toBe(1.45);
    expect(round2(0)).toBe(0);
  });
});

describe('round5', () => {
  it('rounds to 5 decimal places', () => {
    expect(round5(1.1234567)).toBe(1.12346);
    expect(round5(1.1234544)).toBe(1.12345);
  });
});

describe('precisionRound', () => {
  it('rounds to given precision', () => {
    expect(precisionRound(1.2345, 2)).toBe(1.23);
    expect(precisionRound(1.2345, 3)).toBe(1.235);
  });

  it('handles zero precision', () => {
    expect(precisionRound(1.5, 0)).toBe(2);
  });

  it('handles negative precision', () => {
    expect(precisionRound(1234, -2)).toBe(1200);
  });
});

describe('uuidv', () => {
  it('returns a string matching UUID v4 format', () => {
    const id = uuidv();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => uuidv()));
    expect(ids.size).toBe(100);
  });
});
