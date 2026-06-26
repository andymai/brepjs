/**
 * Pure-function tests for the brepkit adapter's matrix builders.
 *
 * These exercise `rotationMatrix` / `scaleMatrix` directly — no kernel or WASM
 * init required — so they run in every kernel project's gate (unlike the
 * mock-adapter suite in brepkitAdapter.test.ts, which is excluded from all
 * projects). Regression coverage for gh issue #1719: a non-iterable
 * `axis`/`center` reaching these builders used to throw `center is not iterable`
 * because the `= [0,0,0]` default only guarded `undefined`.
 */
import { describe, expect, it } from 'vitest';
import { rotationMatrix, scaleMatrix } from '@/kernel/brepkit/helpers.js';

describe('brepkit matrix helpers', () => {
  describe('rotationMatrix', () => {
    it('produces a correct 90° rotation about Z', () => {
      const m = rotationMatrix(90, [0, 0, 1]);
      expect(m[0]).toBeCloseTo(0); // cos
      expect(m[1]).toBeCloseTo(-1); // -sin
      expect(m[4]).toBeCloseTo(1); // sin
      expect(m[5]).toBeCloseTo(0); // cos
    });

    it('applies a valid non-origin center (conjugated translation)', () => {
      const m = rotationMatrix(90, [0, 0, 1], [1, 0, 0]);
      expect(m[3]).toBeCloseTo(1); // tx
      expect(m[7]).toBeCloseTo(-1); // ty
    });

    // gh #1719: a non-iterable center must not throw and must fall back to origin.
    it('tolerates a non-iterable center without throwing', () => {
      const malformed = { x: 1, y: 2, z: 3 } as unknown as [number, number, number];
      const guarded = rotationMatrix(90, [0, 1, 0], malformed);
      expect(guarded).toEqual(rotationMatrix(90, [0, 1, 0], [0, 0, 0]));
    });

    it('tolerates a null center without throwing', () => {
      const guarded = rotationMatrix(90, [0, 1, 0], null as unknown as [number, number, number]);
      expect(guarded.every((n) => Number.isFinite(n))).toBe(true);
    });

    it('falls back to the default Z axis for a non-iterable axis (no NaN)', () => {
      const malformed = { x: 0, y: 1, z: 0 } as unknown as [number, number, number];
      const guarded = rotationMatrix(90, malformed);
      expect(guarded.every((n) => Number.isFinite(n))).toBe(true);
      expect(guarded).toEqual(rotationMatrix(90, [0, 0, 1]));
    });

    // A degenerate zero-length axis is finite (so it passes asVec3) but can't be
    // normalized — it must fall back to +Z rather than divide by zero.
    it('falls back to the default Z axis for a degenerate zero-length axis (no NaN)', () => {
      const guarded = rotationMatrix(90, [0, 0, 0]);
      expect(guarded.every((n) => Number.isFinite(n))).toBe(true);
      expect(guarded).toEqual(rotationMatrix(90, [0, 0, 1]));
    });
  });

  describe('scaleMatrix', () => {
    it('produces a correct uniform scale about origin', () => {
      const m = scaleMatrix([0, 0, 0], 3);
      expect(m[0]).toBe(3);
      expect(m[5]).toBe(3);
      expect(m[10]).toBe(3);
    });

    // gh #1719: scaleMatrix shares the same destructuring pattern.
    it('tolerates a non-iterable center without throwing', () => {
      const malformed = { x: 1, y: 2, z: 3 } as unknown as [number, number, number];
      const guarded = scaleMatrix(malformed, 3);
      expect(guarded).toEqual(scaleMatrix([0, 0, 0], 3));
    });
  });
});
