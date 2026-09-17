import { beforeAll, describe, expect, it } from 'vitest';
import { getKernel } from '@/kernel/index.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('BIM test backend selection', () => {
  it('uses the requested adapter as the active backend', () => {
    expect(getKernel().kernelId).toBe(currentKernel);
    expect(getKernel()).toBe(getKernel(currentKernel));
  });
});
