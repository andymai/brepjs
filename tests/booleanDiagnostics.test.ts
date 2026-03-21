import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, fuse, cut, intersect, translate, isOk, unwrap, measureVolume } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('boolean diagnostics', () => {
  it('successful fuse does not carry error diagnostics', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [5, 0, 0]);
    const result = fuse(a, b);
    expect(isOk(result)).toBe(true);
    // Successful result — volume should be correct
    expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(1500, 0);
  });

  it('successful cut does not carry error diagnostics', () => {
    const a = box(10, 10, 10);
    const b = translate(box(5, 5, 5), [2.5, 2.5, 2.5]);
    const result = cut(a, b);
    expect(isOk(result)).toBe(true);
  });

  it('successful intersect does not carry error diagnostics', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [5, 5, 5]);
    const result = intersect(a, b);
    expect(isOk(result)).toBe(true);
    expect(unwrap(measureVolume(unwrap(result)))).toBeCloseTo(125, 0);
  });
});
