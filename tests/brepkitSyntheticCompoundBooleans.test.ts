import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  compound,
  cut,
  cutWithEvolution,
  line,
  measureVolume,
  translate,
  unwrap,
  type Shape3D,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const descBk = process.env['TEST_KERNEL'] === 'brepkit' ? describe : describe.skip;

// A compound holding anything but solids lives JS-side only, so its id is not a
// kernel handle; booleans have to read its solids from the adapter.
descBk('brepkit booleans with a mixed compound tool', () => {
  const base = () => box(10, 10, 10);
  const mixedTool = () =>
    compound([translate(box(2, 2, 20), [4, 4, -5]), line([0, 0, 20], [1, 0, 20])]) as Shape3D;

  it('cuts by the solids of a compound that also holds an edge', () => {
    const result = unwrap(cut(base(), mixedTool(), { unsafe: true }));
    expect(unwrap(measureVolume(result))).toBeCloseTo(960, 6);
  });

  it('cuts with evolution by the solids of a compound that also holds an edge', () => {
    const { shape } = unwrap(cutWithEvolution(base(), mixedTool()));
    expect(unwrap(measureVolume(shape))).toBeCloseTo(960, 6);
  });

  it('leaves the base whole when the compound tool holds no solid', () => {
    const edgesOnly = compound([line([0, 0, 20], [1, 0, 20])]) as Shape3D;
    const { shape } = unwrap(cutWithEvolution(base(), edgesOnly));
    expect(unwrap(measureVolume(shape))).toBeCloseTo(1000, 6);
  });
});
