/**
 * Custom IR kinds — EvaluatorOptions.kinds lets a caller materialize node kinds
 * brepjs does not define, inside ordinary trees and through the same cache.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from '../setup.js';
import {
  box,
  fuse,
  translate,
  Evaluator,
  type CustomIRNode,
  type CustomKindEvaluator,
  type IRNode,
} from '@/csg/index.js';
import { box as makeBox, getBounds, isErr, isOk, unwrap, measureVolume } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

interface CubeNode extends CustomIRNode {
  readonly kind: 'Cube';
  readonly side: number;
}

const cube = (side: number): IRNode =>
  ({
    kind: 'Cube',
    side,
    structuralHash: 0xc0be0000n + BigInt(side),
    freeParams: new Set<string>(),
  }) satisfies CubeNode as IRNode;

let calls = 0;
const evalCube: CustomKindEvaluator = (node) => {
  calls++;
  const { side } = node as CubeNode;
  return { ok: true, value: makeBox(side, side, side) };
};

describe('Evaluator — custom kinds', () => {
  it('materializes a custom kind', () => {
    using ev = new Evaluator({ kinds: { Cube: evalCube } });
    const r = ev.evaluate(cube(10));
    expect(isOk(r)).toBe(true);
    expect(unwrap(measureVolume(unwrap(r)))).toBeCloseTo(1000, 3);
  });

  it('composes with built-in nodes and caches like them', () => {
    calls = 0;
    using ev = new Evaluator({ kinds: { Cube: evalCube } });
    const tree = fuse(cube(10), translate(box(10, 10, 10), [20, 0, 0]));
    expect(unwrap(measureVolume(unwrap(ev.evaluate(tree))))).toBeCloseTo(2000, 3);
    expect(unwrap(measureVolume(unwrap(ev.evaluate(translate(cube(10), [0, 0, 50])))))).toBeCloseTo(
      1000,
      3
    );
    expect(calls).toBe(1);
  });

  it('evaluates children through ctx.evalNode', () => {
    interface ShiftNode extends CustomIRNode {
      readonly kind: 'Shift';
      readonly target: IRNode;
    }
    const target = box(5, 5, 5);
    const shifted = {
      kind: 'Shift',
      target,
      structuralHash: target.structuralHash ^ 0x5151n,
      freeParams: target.freeParams,
    } satisfies ShiftNode as IRNode;
    const evalShift: CustomKindEvaluator = (node, ctx) =>
      ctx.evalNode(translate((node as ShiftNode).target, [1, 0, 0]));
    using ev = new Evaluator({ kinds: { Shift: evalShift } });
    const bounds = getBounds(unwrap(ev.evaluate(shifted)));
    expect(bounds.xMin).toBeCloseTo(1, 6);
    expect(bounds.xMax).toBeCloseTo(6, 6);
  });

  it('returns an error for a kind with no evaluator', () => {
    using ev = new Evaluator();
    const r = ev.evaluate(cube(10));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe('CSG_UNKNOWN_KIND');
  });

  it('refuses to replace a built-in kind', () => {
    expect(() => new Evaluator({ kinds: { Box: evalCube } })).toThrow(RangeError);
  });
});
