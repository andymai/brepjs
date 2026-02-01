import { describe, expect, it } from 'vitest';
import { reprPnt, removeDuplicatePoints } from '../src/2d/lib/utils.js';

describe('reprPnt', () => {
  it('formats a point with 2 decimal places', () => {
    expect(reprPnt([1.456, 2.789])).toBe('(1.46,2.79)');
  });

  it('handles zero', () => {
    expect(reprPnt([0, 0])).toBe('(0,0)');
  });

  it('handles negative values', () => {
    expect(reprPnt([-1.5, -2.5])).toBe('(-1.5,-2.5)');
  });
});

describe('removeDuplicatePoints', () => {
  it('removes exact duplicates', () => {
    const result = removeDuplicatePoints([
      [1, 2],
      [3, 4],
      [1, 2],
    ]);
    expect(result).toHaveLength(2);
  });

  it('removes near-duplicates within precision', () => {
    const result = removeDuplicatePoints(
      [
        [1, 2],
        [1 + 1e-10, 2 + 1e-10],
      ],
      1e-9
    );
    expect(result).toHaveLength(1);
  });

  it('keeps distinct points', () => {
    const result = removeDuplicatePoints([
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
    expect(result).toHaveLength(3);
  });

  it('handles empty input', () => {
    expect(removeDuplicatePoints([])).toEqual([]);
  });
});
