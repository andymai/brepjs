import { describe, expect, it } from 'vitest';
import { toVec3, toVec2, resolveDirection } from '../src/core/types.js';

describe('toVec3', () => {
  it('passes through Vec3 unchanged', () => {
    expect(toVec3([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('converts Vec2 to Vec3 with z=0', () => {
    expect(toVec3([1, 2])).toEqual([1, 2, 0]);
  });

  it('handles readonly arrays', () => {
    const v = [4, 5, 6] as const;
    expect(toVec3(v)).toEqual([4, 5, 6]);
  });

  it('handles readonly 2-element arrays', () => {
    const v = [4, 5] as const;
    expect(toVec3(v)).toEqual([4, 5, 0]);
  });

  it('handles zero vectors', () => {
    expect(toVec3([0, 0, 0])).toEqual([0, 0, 0]);
    expect(toVec3([0, 0])).toEqual([0, 0, 0]);
  });

  it('handles negative values', () => {
    expect(toVec3([-1, -2, -3])).toEqual([-1, -2, -3]);
  });
});

describe('toVec2', () => {
  it('extracts first two components from Vec3', () => {
    expect(toVec2([1, 2, 3])).toEqual([1, 2]);
  });

  it('passes through Vec2 unchanged', () => {
    expect(toVec2([1, 2])).toEqual([1, 2]);
  });

  it('drops z component', () => {
    expect(toVec2([10, 20, 999])).toEqual([10, 20]);
  });
});

describe('resolveDirection', () => {
  it('resolves X', () => {
    expect(resolveDirection('X')).toEqual([1, 0, 0]);
  });

  it('resolves Y', () => {
    expect(resolveDirection('Y')).toEqual([0, 1, 0]);
  });

  it('resolves Z', () => {
    expect(resolveDirection('Z')).toEqual([0, 0, 1]);
  });

  it('passes through custom Vec3', () => {
    expect(resolveDirection([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('throws for unknown string direction', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing invalid input
    expect(() => resolveDirection('W' as any)).toThrow('Unknown direction');
  });
});
