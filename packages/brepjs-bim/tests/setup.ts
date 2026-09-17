import { beforeAll, beforeEach, expect } from 'vitest';
import { getKernel } from '@/kernel/index.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';

beforeAll(async () => {
  await initKernel();
  expect(getKernel().kernelId).toBe(currentKernel);
  expect(getKernel()).toBe(getKernel(currentKernel));
}, 30000);

// A test file's own beforeAll must not silently switch to another backend.
beforeEach(() => {
  expect(getKernel().kernelId).toBe(currentKernel);
  expect(getKernel()).toBe(getKernel(currentKernel));
});
