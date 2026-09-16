import { describe, expect, it } from 'vitest';
import { getKernel } from '@/kernel/index.js';
import { currentKernel } from '../../../tests/setup.js';

describe('BIM test backend selection', () => {
  it('uses the requested adapter as the active backend', () => {
    expect(getKernel().kernelId).toBe(currentKernel);
    expect(getKernel()).toBe(getKernel(currentKernel));
  });
});
