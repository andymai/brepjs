import { describe, expect, it } from 'vitest';
import { unwrap } from 'brepjs';
import { frameFromOps } from '../src/familiesFrame.js';
import { tRotate, tTranslate } from 'brepjs-families';
import {
  IDENTITY_FRAME,
  decomposeFrame,
  frameInverse,
  frameMul,
  isPureTranslation,
  rotationFrame,
  translationFrame,
  type RigidFrame,
} from '../src/placementFrame.js';

function expectVecClose(
  actual: readonly number[],
  expected: readonly number[],
  precision = 6
): void {
  for (let i = 0; i < expected.length; i++)
    expect(actual[i]).toBeCloseTo(expected[i] ?? 0, precision);
}

function expectFrameClose(actual: RigidFrame, expected: RigidFrame, precision = 6): void {
  for (let i = 0; i < 16; i++)
    expect(actual.matrix[i]).toBeCloseTo(expected.matrix[i] ?? 0, precision);
}

describe('placementFrame', () => {
  it('folds a pivoted arbitrary-axis rotation in both authored orders', () => {
    const rotate = tRotate(120, { axis: [1, 1, 1], at: [1, 2, 3] });
    const before = unwrap(frameFromOps([tTranslate([10, 0, 0]), rotate]));
    const after = unwrap(frameFromOps([rotate, tTranslate([10, 0, 0])]));
    expectVecClose(decomposeFrame(before).origin, [-2, 11, 1]);
    expectVecClose(decomposeFrame(after).origin, [8, 1, 1]);
    const pivot = unwrap(frameFromOps([rotate]));
    expectVecClose(applyFrame(pivot, [1, 2, 3]), [1, 2, 3]);
    expectVecClose(applyFrame(pivot, [2, 2, 3]), [1, 3, 3]);
  });
  it('folds tRotate(30) about Z into axisX/axisZ per the issue', () => {
    const f = unwrap(frameFromOps([tRotate(30)]));
    const { origin, axisX, axisZ } = decomposeFrame(f);
    expectVecClose(axisX, [0.866025, 0.5, 0]);
    expectVecClose(axisZ, [0, 0, 1]);
    expectVecClose(origin, [0, 0, 0]);
  });

  it('composes [tRotate, tTranslate] and [tTranslate, tRotate] in authored order', () => {
    // applyOps runs ops[0] first: [rotate, translate] rotates in place then moves.
    const rotateThenMove = decomposeFrame(
      unwrap(frameFromOps([tRotate(90), tTranslate([10, 0, 0])]))
    );
    expectVecClose(rotateThenMove.axisX, [0, 1, 0]);
    expectVecClose(rotateThenMove.origin, [10, 0, 0]);

    // [translate, rotate] moves +10x then rotates about origin -> lands at +10y.
    const moveThenRotate = decomposeFrame(
      unwrap(frameFromOps([tTranslate([10, 0, 0]), tRotate(90)]))
    );
    expectVecClose(moveThenRotate.axisX, [0, 1, 0]);
    expectVecClose(moveThenRotate.origin, [0, 10, 0]);
  });

  it('honours a rotation pivot (at)', () => {
    const f = unwrap(rotationFrame(90, [0, 0, 1], [5, 0, 0]));
    // The pivot is a fixed point.
    const { origin } = decomposeFrame(f);
    expectVecClose(origin, [5, -5, 0]);
    // A point at [6,0,0] maps to [5,1,0] (unit arm rotated 90deg about [5,0,0]).
    const p = applyFrame(f, [6, 0, 0]);
    expectVecClose(p, [5, 1, 0]);
  });

  it('handles a non-default rotation axis', () => {
    const { axisX, axisZ } = decomposeFrame(unwrap(rotationFrame(90, [1, 0, 0])));
    expectVecClose(axisX, [1, 0, 0]);
    expectVecClose(axisZ, [0, -1, 0]);
  });

  it('inverts a rigid frame (f . f^-1 = I)', () => {
    const f = unwrap(
      frameMul(unwrap(translationFrame([3, -4, 5])), unwrap(rotationFrame(37, [0.2, 0.6, 1])))
    );
    expectFrameClose(unwrap(frameMul(f, unwrap(frameInverse(f)))), IDENTITY_FRAME);
    expectFrameClose(unwrap(frameMul(unwrap(frameInverse(f)), f)), IDENTITY_FRAME);
  });

  it('relativizes a world frame against a parent frame', () => {
    const parent = unwrap(frameFromOps([tTranslate([100, 0, 0]), tRotate(90)]));
    const world = unwrap(
      frameFromOps([tTranslate([100, 0, 0]), tRotate(90), tTranslate([0, 0, 50])])
    );
    const local = unwrap(frameMul(unwrap(frameInverse(parent)), world));
    // The child sits +50 along the parent's local Z from the parent origin.
    const { origin, axisX, axisZ } = decomposeFrame(local);
    expectVecClose(origin, [0, 0, 50]);
    expectVecClose(axisX, [1, 0, 0]);
    expectVecClose(axisZ, [0, 0, 1]);
  });

  it('classifies pure translations vs rotations', () => {
    expect(isPureTranslation(unwrap(translationFrame([1, 2, 3])))).toBe(true);
    expect(isPureTranslation(IDENTITY_FRAME)).toBe(true);
    expect(isPureTranslation(unwrap(rotationFrame(5)))).toBe(false);
  });
});

function applyFrame(
  frame: RigidFrame,
  p: readonly [number, number, number]
): [number, number, number] {
  const f = frame.matrix;
  return [
    f[0] * p[0] + f[4] * p[1] + f[8] * p[2] + f[12],
    f[1] * p[0] + f[5] * p[1] + f[9] * p[2] + f[13],
    f[2] * p[0] + f[6] * p[1] + f[10] * p[2] + f[14],
  ];
}
