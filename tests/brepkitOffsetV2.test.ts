import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel } from './setup.js';
import { shouldSkipSuite } from './helpers/kernelDivergences.js';
import { box, unwrap, measureVolume, offset } from '@/index.js';

const descBk = shouldSkipSuite('brepkitOffsetV2') ? describe.skip : describe;

beforeAll(async () => {
  await initKernel();
}, 30000);

descBk('offsetSolidV2 feature detection', () => {
  it('offset a box outward produces larger volume', () => {
    const b = box(10, 10, 10);
    const result = unwrap(offset(b, 1));
    const vol = unwrap(measureVolume(result));
    // A 10x10x10 box offset by 1 should be ~12x12x12 = 1728
    expect(vol).toBeGreaterThan(1000);
    expect(vol).toBeCloseTo(1728, -1);
  });

  it('offset a box inward produces smaller volume', () => {
    const b = box(10, 10, 10);
    const result = unwrap(offset(b, -1));
    const vol = unwrap(measureVolume(result));
    // 8x8x8 = 512
    expect(vol).toBeLessThan(1000);
    expect(vol).toBeCloseTo(512, -1);
  });
});
