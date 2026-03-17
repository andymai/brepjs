/**
 * Tests for the init() convenience function.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from './setup.js';
import { init, getKernel } from '../src/kernel/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('init()', () => {
  it('is idempotent — returns current kernel ID when already initialised', async () => {
    // initKernel() has already registered a kernel
    const id = await init();
    expect(id).toBe(currentKernel);
  });

  it('returns the same kernel that getKernel() provides', async () => {
    const id = await init();
    const kernel = getKernel();
    expect(kernel.kernelId).toBe(id);
  });
});
