import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  cylinder,
  translate,
  booleanPipeline,
  isShape3D,
  isOk,
  unwrap,
  measureVolume,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('booleanPipeline', () => {
  it('executes a fuse+cut chain and returns valid solid', () => {
    const base = box(10, 10, 10);
    const addBox = translate(box(5, 5, 5), [5, 5, 5]);
    const hole = cylinder(2, 20);

    const result = booleanPipeline(base, [
      { op: 'fuse', tool: addBox },
      { op: 'cut', tool: hole },
    ]);

    expect(result).toMatchObject({ ok: true });
    const shape = unwrap(result);
    expect(isShape3D(shape)).toBe(true);
    const vol = unwrap(measureVolume(shape));
    expect(vol).toBeGreaterThan(0);
  });

  it('returns base shape unchanged for empty pipeline', () => {
    const base = box(10, 10, 10);
    const result = booleanPipeline(base, []);
    expect(isOk(result)).toBe(true);
    const vol = unwrap(measureVolume(unwrap(result)));
    expect(vol).toBeCloseTo(1000, 0);
  });

  it('handles 8-step fuse pipeline', () => {
    const shapes = Array.from({ length: 8 }, (_, i) => translate(box(3, 3, 3), [i * 2, 0, 0]));
    const base = shapes[0];
    const tools = shapes.slice(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length is 8, guaranteed
    const result = booleanPipeline(base!, [
      ...tools.map((t) => ({ op: 'fuse' as const, tool: t })),
    ]);
    expect(isOk(result)).toBe(true);
    expect(isShape3D(unwrap(result))).toBe(true);
  });

  it('mixed fuse+cut pipeline', () => {
    const result = booleanPipeline(box(20, 20, 20), [
      { op: 'fuse', tool: translate(box(10, 10, 10), [10, 0, 0]) },
      { op: 'cut', tool: cylinder(3, 40) },
    ]);
    expect(isOk(result)).toBe(true);
    expect(isShape3D(unwrap(result))).toBe(true);
  });
});
