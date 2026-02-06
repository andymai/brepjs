import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  checkInterference,
  checkAllInterferences,
  makeBox,
  makeSphere,
  translateShape,
  unwrap,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('checkInterference', () => {
  it('detects overlapping boxes', () => {
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const box2 = makeBox([5, 5, 5], [15, 15, 15]);

    const result = unwrap(checkInterference(box1, box2));
    expect(result.hasInterference).toBe(true);
    expect(result.minDistance).toBeCloseTo(0, 5);
  });

  it('detects touching boxes', () => {
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const box2 = makeBox([10, 0, 0], [20, 10, 10]);

    const result = unwrap(checkInterference(box1, box2));
    expect(result.hasInterference).toBe(true);
    expect(result.minDistance).toBeCloseTo(0, 5);
  });

  it('detects separated shapes', () => {
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const box2 = makeBox([20, 0, 0], [30, 10, 10]);

    const result = unwrap(checkInterference(box1, box2));
    expect(result.hasInterference).toBe(false);
    expect(result.minDistance).toBeCloseTo(10, 3);
  });

  it('returns closest points on separated shapes', () => {
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const box2 = makeBox([20, 0, 0], [30, 10, 10]);

    const result = unwrap(checkInterference(box1, box2));
    // Closest point on box1 should be near x=10, on box2 near x=20
    expect(result.pointOnShape1[0]).toBeCloseTo(10, 3);
    expect(result.pointOnShape2[0]).toBeCloseTo(20, 3);
  });

  it('works with spheres', () => {
    const s1 = makeSphere(5);
    const s2 = translateShape(makeSphere(5), [3, 0, 0]);

    const result = unwrap(checkInterference(s1, s2));
    expect(result.hasInterference).toBe(true);
    expect(result.minDistance).toBeCloseTo(0, 5);
  });

  it('detects separated spheres', () => {
    const s1 = makeSphere(5);
    const s2 = translateShape(makeSphere(5), [20, 0, 0]);

    const result = unwrap(checkInterference(s1, s2));
    expect(result.hasInterference).toBe(false);
    expect(result.minDistance).toBeCloseTo(10, 2);
  });

  it('respects custom tolerance', () => {
    const box1 = makeBox([0, 0, 0], [10, 10, 10]);
    const box2 = makeBox([10.005, 0, 0], [20, 10, 10]);

    // Default tolerance (1e-6) — should not detect interference
    const strict = unwrap(checkInterference(box1, box2));
    expect(strict.hasInterference).toBe(false);

    // Larger tolerance — should detect as interference
    const lenient = unwrap(checkInterference(box1, box2, 0.01));
    expect(lenient.hasInterference).toBe(true);
  });
});

describe('checkAllInterferences', () => {
  it('returns empty array for non-interfering shapes', () => {
    const shapes = [
      makeBox([0, 0, 0], [5, 5, 5]),
      makeBox([10, 0, 0], [15, 5, 5]),
      makeBox([20, 0, 0], [25, 5, 5]),
    ];

    const pairs = checkAllInterferences(shapes);
    expect(pairs).toHaveLength(0);
  });

  it('detects interfering pairs in a group', () => {
    const shapes = [
      makeBox([0, 0, 0], [10, 10, 10]),
      makeBox([5, 0, 0], [15, 10, 10]), // overlaps with [0]
      makeBox([30, 0, 0], [40, 10, 10]), // separate
    ];

    const pairs = checkAllInterferences(shapes);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.i).toBe(0);
    expect(pairs[0]!.j).toBe(1);
    expect(pairs[0]!.result.hasInterference).toBe(true);
  });

  it('returns multiple pairs when multiple shapes interfere', () => {
    const shapes = [
      makeBox([0, 0, 0], [10, 10, 10]),
      makeBox([5, 0, 0], [15, 10, 10]),
      makeBox([8, 0, 0], [18, 10, 10]),
    ];

    const pairs = checkAllInterferences(shapes);
    // [0]-[1] overlap, [0]-[2] overlap, [1]-[2] overlap
    expect(pairs).toHaveLength(3);
  });

  it('handles single shape gracefully', () => {
    const pairs = checkAllInterferences([makeBox([0, 0, 0], [5, 5, 5])]);
    expect(pairs).toHaveLength(0);
  });

  it('handles empty array', () => {
    const pairs = checkAllInterferences([]);
    expect(pairs).toHaveLength(0);
  });
});
