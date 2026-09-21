import { describe, expect, it } from 'vitest';
import { unwrap } from 'brepjs';
import {
  frameFromPlacement,
  frameFromMatrix,
  decomposeFrame,
  rotationFrame,
  translationFrame,
  frameMul,
  frameInverse,
} from '../src/placementFrame.js';

describe('validated neutral rigid frames', () => {
  it('rejects invalid rotations and nonfinite algebra results', () => {
    for (const axis of [
      [0, 0, 0],
      [NaN, 0, 1],
      [0, Infinity, 1],
    ])
      expect(rotationFrame(30, axis).ok).toBe(false);
    expect(rotationFrame(Infinity).ok).toBe(false);
    expect(rotationFrame(30, [0, 0, 1], [0, NaN, 0]).ok).toBe(false);
    const huge = unwrap(translationFrame([Number.MAX_VALUE, Number.MAX_VALUE, 0]));
    expect(frameMul(huge, huge).ok).toBe(false);
    const rotated = unwrap(rotationFrame(45));
    const translatedRotation = unwrap(
      frameFromMatrix([...rotated.matrix.slice(0, 12), Number.MAX_VALUE, Number.MAX_VALUE, 0, 1])
    );
    expect(frameInverse(translatedRotation).ok).toBe(false);
    expect(rotationFrame(180, [0, 0, 1], [Number.MAX_VALUE, 0, 0]).ok).toBe(false);
    // Direction magnitudes may be arbitrary, including tiny and huge finite values.
    for (const length of [Number.MIN_VALUE, Number.MAX_VALUE]) {
      const frame = unwrap(rotationFrame(90, [length, 0, 0]));
      expect(decomposeFrame(frame).axisZ[1]).toBeCloseTo(-1, 12);
    }
  });
  it('rejects malformed, nonfinite, scaled, sheared, reflected and degenerate supplied frames', () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const sparse = identity.slice(0, 12).concat(new Array<number>(1), identity.slice(13));
    const invalid: unknown[] = [null, {}, [], identity.slice(1), sparse];
    for (const [index, value] of [
      [0, 2],
      [0, 0],
      [0, -1],
      [4, 0.01],
      [12, Infinity],
      [8, NaN],
      [15, 0],
    ]) {
      const m = [...identity];
      if (index !== undefined && value !== undefined) m[index] = value;
      invalid.push(m);
    }
    for (const input of invalid)
      expect(frameFromMatrix(input)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_RIGID_FRAME' },
      });
    for (const axisZ of [
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 2],
      [0.01, 0, 1],
    ]) {
      expect(frameFromPlacement({ origin: [0, 0, 0], axisX: [1, 0, 0], axisZ })).toMatchObject({
        ok: false,
      });
    }
    expect(
      frameFromPlacement({ origin: [0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1] })
    ).toMatchObject({ ok: false });
  });

  it('accepts inclusive tolerance edges and canonicalizes accepted drift', () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    // Dot products and the bottom row have exactly representable input thresholds.
    for (const index of [4, 8, 9]) {
      const m = [...identity];
      m[index] = 1e-6;
      const f = unwrap(frameFromMatrix(m));
      const inverseBasis = f.matrix;
      expect(Math.hypot(inverseBasis[0], inverseBasis[1], inverseBasis[2])).toBeCloseTo(1, 14);
      m[index] = 1.000001e-6;
      expect(frameFromMatrix(m).ok).toBe(false);
    }
    for (const index of [3, 7, 11]) {
      const m = [...identity];
      m[index] = 1e-9;
      expect(unwrap(frameFromMatrix(m)).matrix[index]).toBe(0);
      m[index] = 1.000001e-9;
      expect(frameFromMatrix(m).ok).toBe(false);
    }
    for (const sign of [-1, 1]) {
      const m = [...identity];
      m[15] = 1 + sign * 1e-9;
      expect(unwrap(frameFromMatrix(m)).matrix[15]).toBe(1);
      m[15] = 1 + sign * 1.000001e-9;
      expect(frameFromMatrix(m).ok).toBe(false);
    }
    for (const sign of [-1, 1]) {
      const m = [...identity];
      m[0] = Math.sqrt(1 + sign * 0.999999e-6);
      expect(unwrap(frameFromMatrix(m)).matrix[0]).toBe(1);
      m[0] = Math.sqrt(1 + sign * 1.000001e-6);
      expect(frameFromMatrix(m).ok).toBe(false);
      const scale = Math.cbrt(1 + sign * 0.999999e-6);
      m[0] = m[5] = m[10] = scale;
      expect(frameFromMatrix(m).ok).toBe(true);
      const outside = Math.cbrt(1 + sign * 1.000001e-6);
      m[0] = m[5] = m[10] = outside;
      expect(frameFromMatrix(m).ok).toBe(false);
    }
  });
  it('copies and protects a supplied frame and its nested coordinates', () => {
    const origin: [number, number, number] = [10, 20, 30];
    const axisX: [number, number, number] = [1, 0, 0];
    const frame = unwrap(frameFromPlacement({ origin, axisX, axisZ: [0, 0, 1] }));
    origin[0] = 999;
    axisX[0] = 0;
    expect(decomposeFrame(frame)).toEqual({
      origin: [10, 20, 30],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
    });
    expect(Object.isFrozen(frame)).toBe(true);
    expect(Object.isFrozen(frame.matrix)).toBe(true);
    const matrix = [...frame.matrix];
    const copied = unwrap(frameFromMatrix(matrix));
    matrix[12] = 999;
    expect(decomposeFrame(copied).origin).toEqual([10, 20, 30]);
  });
});
