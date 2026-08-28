import { describe, expect, it } from 'vitest';
import { tRotate, tTranslate } from 'brepjs-families';
import {
  IDENTITY_FRAME,
  decomposeFrame,
  frameFromOps,
  frameInverse,
  frameMul,
  isPureTranslation,
  rotationFrame,
  translationFrame,
  type Frame,
} from '../src/placementFrame.js';

function expectVecClose(
  actual: readonly number[],
  expected: readonly number[],
  precision = 6
): void {
  for (let i = 0; i < expected.length; i++)
    expect(actual[i]).toBeCloseTo(expected[i] ?? 0, precision);
}

function expectFrameClose(actual: Frame, expected: Frame, precision = 6): void {
  for (let i = 0; i < 16; i++) expect(actual[i]).toBeCloseTo(expected[i] ?? 0, precision);
}

describe('placementFrame', () => {
  it('folds tRotate(30) about Z into axisX/axisZ per the issue', () => {
    const f = frameFromOps([tRotate(30)]);
    const { origin, axisX, axisZ } = decomposeFrame(f);
    expectVecClose(axisX, [0.866025, 0.5, 0]);
    expectVecClose(axisZ, [0, 0, 1]);
    expectVecClose(origin, [0, 0, 0]);
  });

  it('composes [tRotate, tTranslate] and [tTranslate, tRotate] in authored order', () => {
    // applyOps runs ops[0] first: [rotate, translate] rotates in place then moves.
    const rotateThenMove = decomposeFrame(frameFromOps([tRotate(90), tTranslate([10, 0, 0])]));
    expectVecClose(rotateThenMove.axisX, [0, 1, 0]);
    expectVecClose(rotateThenMove.origin, [10, 0, 0]);

    // [translate, rotate] moves +10x then rotates about origin -> lands at +10y.
    const moveThenRotate = decomposeFrame(frameFromOps([tTranslate([10, 0, 0]), tRotate(90)]));
    expectVecClose(moveThenRotate.axisX, [0, 1, 0]);
    expectVecClose(moveThenRotate.origin, [0, 10, 0]);
  });

  it('honours a rotation pivot (at)', () => {
    const f = rotationFrame(90, [0, 0, 1], [5, 0, 0]);
    // The pivot is a fixed point.
    const { origin } = decomposeFrame(f);
    expectVecClose(origin, [5, -5, 0]);
    // A point at [6,0,0] maps to [5,1,0] (unit arm rotated 90deg about [5,0,0]).
    const p = applyFrame(f, [6, 0, 0]);
    expectVecClose(p, [5, 1, 0]);
  });

  it('handles a non-default rotation axis', () => {
    const { axisX, axisZ } = decomposeFrame(rotationFrame(90, [1, 0, 0]));
    expectVecClose(axisX, [1, 0, 0]);
    expectVecClose(axisZ, [0, -1, 0]);
  });

  it('inverts a rigid frame (f . f^-1 = I)', () => {
    const f = frameMul(translationFrame([3, -4, 5]), rotationFrame(37, [0.2, 0.6, 1]));
    expectFrameClose(frameMul(f, frameInverse(f)), IDENTITY_FRAME);
    expectFrameClose(frameMul(frameInverse(f), f), IDENTITY_FRAME);
  });

  it('relativizes a world frame against a parent frame', () => {
    const parent = frameFromOps([tTranslate([100, 0, 0]), tRotate(90)]);
    const world = frameFromOps([tTranslate([100, 0, 0]), tRotate(90), tTranslate([0, 0, 50])]);
    const local = frameMul(frameInverse(parent), world);
    // The child sits +50 along the parent's local Z from the parent origin.
    const { origin, axisX, axisZ } = decomposeFrame(local);
    expectVecClose(origin, [0, 0, 50]);
    expectVecClose(axisX, [1, 0, 0]);
    expectVecClose(axisZ, [0, 0, 1]);
  });

  it('classifies pure translations vs rotations', () => {
    expect(isPureTranslation(translationFrame([1, 2, 3]))).toBe(true);
    expect(isPureTranslation(IDENTITY_FRAME)).toBe(true);
    expect(isPureTranslation(rotationFrame(5))).toBe(false);
  });
});

function applyFrame(f: Frame, p: readonly [number, number, number]): [number, number, number] {
  return [
    f[0] * p[0] + f[4] * p[1] + f[8] * p[2] + f[12],
    f[1] * p[0] + f[5] * p[1] + f[9] * p[2] + f[13],
    f[2] * p[0] + f[6] * p[1] + f[10] * p[2] + f[14],
  ];
}
