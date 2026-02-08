import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  checkInterference,
  checkAllInterferences,
  box,
  sphere as _sphere,
  translate,
  unwrap as _unwrap,
  isErr as _isErr,
  unwrapErr,
  getKernel,
  createSolid,
} from '../src/index.js';
import type { Shape3D } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('checkInterference', () => {
  it('detects overlapping boxes', () => {
    const b1 = box(10, 10, 10);
    const b2 = translate(box(10, 10, 10), [5, 5, 5]);

    const result = unwrap(checkInterference(b1, b2));
    expect(result.hasInterference).toBe(true);
    expect(result.minDistance).toBeCloseTo(0, 5);
  });

  it('detects touching boxes', () => {
    const b1 = box(10, 10, 10);
    const b2 = translate(box(10, 10, 10), [10, 0, 0]);

    const result = unwrap(checkInterference(b1, b2));
    expect(result.hasInterference).toBe(true);
    expect(result.minDistance).toBeCloseTo(0, 5);
  });

  it('detects separated shapes', () => {
    const b1 = box(10, 10, 10);
    const b2 = translate(box(10, 10, 10), [20, 0, 0]);

    const result = unwrap(checkInterference(b1, b2));
    expect(result.hasInterference).toBe(false);
    expect(result.minDistance).toBeCloseTo(10, 3);
  });

  it('returns closest points on separated shapes', () => {
    const b1 = box(10, 10, 10);
    const b2 = translate(box(10, 10, 10), [20, 0, 0]);

    const result = unwrap(checkInterference(b1, b2));
    // Closest point on b1 should be near x=10, on b2 near x=20
    expect(result.pointOnShape1[0]).toBeCloseTo(10, 3);
    expect(result.pointOnShape2[0]).toBeCloseTo(20, 3);
  });

  it('works with spheres', () => {
    const s1 = sphere(5);
    const s2 = translate(sphere(5), [3, 0, 0]);

    const result = unwrap(checkInterference(s1, s2));
    expect(result.hasInterference).toBe(true);
    expect(result.minDistance).toBeCloseTo(0, 5);
  });

  it('detects separated spheres', () => {
    const s1 = sphere(5);
    const s2 = translate(sphere(5), [20, 0, 0]);

    const result = unwrap(checkInterference(s1, s2));
    expect(result.hasInterference).toBe(false);
    expect(result.minDistance).toBeCloseTo(10, 2);
  });

  it('respects custom tolerance', () => {
    const b1 = box(10, 10, 10);
    const b2 = translate(box(10, 10, 10), [10.005, 0, 0]);

    // Default tolerance (1e-6) — should not detect interference
    const strict = unwrap(checkInterference(b1, b2));
    expect(strict.hasInterference).toBe(false);

    // Larger tolerance — should detect as interference
    const lenient = unwrap(checkInterference(b1, b2, 0.01));
    expect(lenient.hasInterference).toBe(true);
  });
});

describe('checkAllInterferences', () => {
  it('returns empty array for non-interfering shapes', () => {
    const shapes = [
      box(5, 5, 5),
      translate(box(5, 5, 5), [10, 0, 0]),
      translate(box(5, 5, 5), [20, 0, 0]),
    ];

    const pairs = checkAllInterferences(shapes);
    expect(pairs).toHaveLength(0);
  });

  it('detects interfering pairs in a group', () => {
    const shapes = [
      box(10, 10, 10),
      translate(box(10, 10, 10), [5, 0, 0]), // overlaps with [0]
      translate(box(10, 10, 10), [30, 0, 0]), // separate
    ];

    const pairs = checkAllInterferences(shapes);
    expect(pairs).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(pairs[0]!.i).toBe(0);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(pairs[0]!.j).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(pairs[0]!.result.hasInterference).toBe(true);
  });

  it('returns multiple pairs when multiple shapes interfere', () => {
    const shapes = [
      box(10, 10, 10),
      translate(box(10, 10, 10), [5, 0, 0]),
      translate(box(10, 10, 10), [8, 0, 0]),
    ];

    const pairs = checkAllInterferences(shapes);
    // [0]-[1] overlap, [0]-[2] overlap, [1]-[2] overlap
    expect(pairs).toHaveLength(3);
  });

  it('handles single shape gracefully', () => {
    const pairs = checkAllInterferences([box(5, 5, 5)]);
    expect(pairs).toHaveLength(0);
  });

  it('handles empty array', () => {
    const pairs = checkAllInterferences([]);
    expect(pairs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Null-shape pre-validation tests
// ---------------------------------------------------------------------------

describe('null-shape pre-validation', () => {
  function makeNullShape(): Shape3D {
    const oc = getKernel().oc;
    return createSolid(new oc.TopoDS_Solid()) as Shape3D;
  }

  it('checkInterference returns err for null first shape', () => {
    const b = box(10, 10, 10);
    const result = checkInterference(makeNullShape(), b);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
    expect(unwrapErr(result).message).toContain('first shape');
  });

  it('checkInterference returns err for null second shape', () => {
    const b = box(10, 10, 10);
    const result = checkInterference(b, makeNullShape());
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NULL_SHAPE_INPUT');
    expect(unwrapErr(result).message).toContain('second shape');
  });
});
