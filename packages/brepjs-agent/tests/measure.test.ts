import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runMeasure } from '@/verify/measure.js';

const fix = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));

describe('runMeasure', () => {
  it('measures the length of a single part', async () => {
    const { length, distance, errors } = await runMeasure(fix('validBox.brep.ts'));
    expect(errors).toEqual([]);
    expect(typeof length).toBe('number');
    expect(length).toBeGreaterThan(0);
    expect(distance).toBeUndefined();
  }, 30000);

  it('measures the distance between two parts', async () => {
    const { distance, length, errors } = await runMeasure(
      fix('validBox.brep.ts'),
      fix('offsetBox.brep.ts'),
    );
    expect(errors).toEqual([]);
    expect(typeof distance).toBe('number');
    expect(distance).toBeCloseTo(10, 3);
    expect(length).toBeUndefined();
  }, 30000);
});
