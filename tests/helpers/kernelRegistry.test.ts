import { describe, it, expect } from 'vitest';
import { kernelConfigs, getKernelConfig, getKernelCapabilities } from './kernelRegistry.js';

describe('kernelRegistry', () => {
  it('exports at least occt and brepkit configs', () => {
    const ids = kernelConfigs.map((k) => k.id);
    expect(ids).toContain('occt');
    expect(ids).toContain('brepkit');
  });

  it('each config has required fields', () => {
    for (const cfg of kernelConfigs) {
      expect(cfg.id).toBeTruthy();
      expect(cfg.displayName).toBeTruthy();
      expect(cfg.capabilities).toBeDefined();
    }
  });

  it('getKernelConfig returns config by id', () => {
    const occt = getKernelConfig('occt');
    expect(occt).toBeDefined();
    expect(occt?.id).toBe('occt');
  });

  it('getKernelConfig returns undefined for unknown id', () => {
    expect(getKernelConfig('nonexistent')).toBeUndefined();
  });

  it('getKernelCapabilities returns capabilities', () => {
    const caps = getKernelCapabilities('occt');
    expect(caps.variableFillet).toBe(true);
    expect(caps.offsetSolidV2).toBe(false);
  });

  it('getKernelCapabilities throws for unknown kernel', () => {
    expect(() => getKernelCapabilities('nonexistent')).toThrow();
  });

  it('occt has coverage thresholds, brepkit is informational', () => {
    const occt = getKernelConfig('occt');
    const brepkit = getKernelConfig('brepkit');
    expect(occt).toBeDefined();
    expect(brepkit).toBeDefined();
    expect(occt?.coverageThresholds).not.toBe('informational');
    expect(brepkit?.coverageThresholds).toBe('informational');
  });
});
