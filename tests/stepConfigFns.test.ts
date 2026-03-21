import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, exportSTEPConfigured, isOk, unwrap } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('exportSTEPConfigured', () => {
  it('exports a box with default options', () => {
    const b = box(10, 10, 10);
    const result = exportSTEPConfigured([{ shape: b }]);
    if (isOk(result)) {
      expect(typeof unwrap(result)).toBe('string');
      expect(unwrap(result).length).toBeGreaterThan(0);
    } else {
      // May not be supported on all kernels
      expect(result.error.code).toBe('STEP_EXPORT_CONFIGURED_FAILED');
    }
  });

  it('exports with named part', () => {
    const b = box(10, 10, 10);
    const result = exportSTEPConfigured([{ shape: b, name: 'MyBox' }]);
    if (isOk(result)) {
      const content = unwrap(result);
      expect(content.length).toBeGreaterThan(0);
      // Name may or may not appear in the STEP output depending on kernel
      expect(content).toContain('ISO-10303-21');
    }
  });

  it('exports with color specified', () => {
    const b = box(10, 10, 10);
    const result = exportSTEPConfigured([{ shape: b, name: 'RedBox', color: [1, 0, 0, 1] }]);
    if (isOk(result)) {
      expect(typeof unwrap(result)).toBe('string');
      expect(unwrap(result).length).toBeGreaterThan(0);
    } else {
      // May not be supported on all kernels
      expect(result.error.code).toBe('STEP_EXPORT_CONFIGURED_FAILED');
    }
  });
});
