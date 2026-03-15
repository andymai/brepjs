import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, sphere, resize, measureVolume, unwrap } from '../src/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('resize', () => {
  it('resizes box to exact dimensions', () => {
    const b = box(10, 20, 30);
    const resized = resize(b, [5, 10, 15]);
    const vol = unwrap(measureVolume(resized));
    expect(vol).toBeCloseTo(5 * 10 * 15, 0);
  });

  it('resizes with partial dimensions (auto-proportional)', () => {
    const b = box(10, 20, 30);
    const resized = resize(b, [5, undefined, undefined], { auto: true });
    const vol = unwrap(measureVolume(resized));
    expect(vol).toBeCloseTo(750, 0);
  });

  it('throws for non-uniform resize (WASM limitation)', () => {
    const b = box(10, 20, 30);
    expect(() => resize(b, [5, undefined, undefined])).toThrow('non-uniform scaling');
  });

  it('works on non-box shapes', () => {
    const s = sphere(10);
    // Sphere bbox is 20x20x20, resize to 10x10x10 → scale 0.5 → r=5
    const resized = resize(s, [10, 10, 10]);
    const vol = unwrap(measureVolume(resized));
    expect(vol).toBeCloseTo((4 / 3) * Math.PI * 125, 0);
  });
});
