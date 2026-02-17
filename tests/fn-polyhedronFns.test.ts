import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  polyhedron,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  isSolid,
  measureVolume,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('polyhedron', () => {
  it('creates a tetrahedron with positive volume', () => {
    const points: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [0.5, Math.sqrt(3) / 2, 0],
      [0.5, Math.sqrt(3) / 6, Math.sqrt(6) / 3],
    ];
    const faces = [
      [0, 2, 1],
      [0, 1, 3],
      [1, 2, 3],
      [0, 3, 2],
    ];
    const result = polyhedron(points, faces);
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    expect(isSolid(shape)).toBe(true);
    expect(measureVolume(shape)).toBeGreaterThan(0.05);
  });

  it('creates a cube with volume 1000', () => {
    const points: [number, number, number][] = [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
      [0, 10, 0],
      [0, 0, 10],
      [10, 0, 10],
      [10, 10, 10],
      [0, 10, 10],
    ];
    const faces = [
      [0, 3, 2],
      [0, 2, 1],
      [4, 5, 6],
      [4, 6, 7],
      [0, 1, 5],
      [0, 5, 4],
      [2, 3, 7],
      [2, 7, 6],
      [0, 4, 7],
      [0, 7, 3],
      [1, 2, 6],
      [1, 6, 5],
    ];
    const result = polyhedron(points, faces);
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    expect(isSolid(shape)).toBe(true);
    expect(measureVolume(shape)).toBeCloseTo(1000, -1);
  });

  it('supports quad faces via fan triangulation', () => {
    const points: [number, number, number][] = [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
      [0, 10, 0],
      [0, 0, 10],
      [10, 0, 10],
      [10, 10, 10],
      [0, 10, 10],
    ];
    // 6 quad faces instead of 12 triangles
    const faces = [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [2, 3, 7, 6],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
    ];
    const result = polyhedron(points, faces);
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(1000, -1);
  });

  describe('error handling', () => {
    it('returns error for fewer than 4 points', () => {
      const result = polyhedron(
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
        [[0, 1, 2]]
      );
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result).code).toBe('POLYHEDRON_INSUFFICIENT_POINTS');
    });

    it('returns error for fewer than 4 faces', () => {
      const result = polyhedron(
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        [[0, 1, 2]]
      );
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result).code).toBe('POLYHEDRON_INSUFFICIENT_FACES');
    });

    it('returns error for out-of-range vertex index', () => {
      const result = polyhedron(
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        [
          [0, 1, 2],
          [0, 2, 3],
          [0, 3, 1],
          [1, 3, 99],
        ]
      );
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result).code).toBe('POLYHEDRON_INVALID_INDEX');
    });
  });
});
