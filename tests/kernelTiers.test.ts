// @vitest-environment node
/**
 * Capability flags + quality tiers — the preview/exact ergonomics layer.
 *
 * Registers both an exact B-rep kernel (occt) and the mesh kernel (manifold) so
 * tier switching and capability routing can be exercised against real kernels.
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel, initOCCT } from './setup.js';
import {
  getKernel,
  withKernel,
  getKernelCapabilities,
  withQuality,
  currentQuality,
  registerKernelTier,
  getKernelTier,
  withTier,
  sphere,
  mesh,
} from '@/index.js';

let haveManifold = false;
beforeAll(async () => {
  await initOCCT();
  try {
    await initKernel('manifold');
    getKernel('manifold');
    haveManifold = true;
  } catch {
    haveManifold = false;
  }
}, 60_000);

describe('kernel capabilities', () => {
  it('occt is exact B-rep, extract-time tessellation', () => {
    const c = getKernelCapabilities('occt');
    expect(c.exact).toBe(true);
    expect(c.brepExport).toBe(true);
    expect(c.exactMeasurement).toBe(true);
    expect(c.tessellationModel).toBe('extract-time');
  });

  it('manifold is mesh-approximate, build-time tessellation', () => {
    if (!haveManifold) return;
    const c = getKernelCapabilities('manifold');
    expect(c.exact).toBe(false);
    expect(c.brepExport).toBe(false);
    expect(c.tessellationModel).toBe('build-time');
  });

  it('capability-driven routing picks an exact kernel for export', () => {
    if (!haveManifold) return;
    const ids = ['manifold', 'occt'];
    const exactId = ids.find((id) => getKernelCapabilities(id).brepExport);
    expect(exactId).toBe('occt');
  });
});

describe('withQuality', () => {
  it('defaults to standard and restores after the scope', () => {
    expect(currentQuality()).toBe('standard');
    const inside = withKernel('occt', () => withQuality('fine', () => currentQuality()));
    expect(inside).toBe('fine');
    expect(currentQuality()).toBe('standard');
  });

  it('restores quality even if the callback throws', () => {
    expect(currentQuality()).toBe('standard');
    expect(() =>
      withKernel('occt', () =>
        withQuality('fine', () => {
          throw new Error('boom');
        })
      )
    ).toThrow('boom');
    expect(currentQuality()).toBe('standard');
  });

  it('extract-time (occt): finer quality yields more triangles', () => {
    withKernel('occt', () => {
      const s = sphere(5);
      const draft = withQuality('draft', () => mesh(s, { cache: false }).triangles.length);
      const fine = withQuality('fine', () => mesh(s, { cache: false }).triangles.length);
      expect(fine).toBeGreaterThan(draft);
    });
  });

  it('build-time (manifold): finer quality yields more triangles', () => {
    if (!haveManifold) return;
    withKernel('manifold', () => {
      // Quality must be applied BEFORE building, which withQuality does on enter.
      const draft = withQuality('draft', () => mesh(sphere(5), { cache: false }).triangles.length);
      const fine = withQuality('fine', () => mesh(sphere(5), { cache: false }).triangles.length);
      expect(fine).toBeGreaterThan(draft);
    });
  });
});

describe('kernel tiers', () => {
  it('withTier switches kernel + quality, restores both', () => {
    if (!haveManifold) return;
    registerKernelTier('preview', { kernel: 'manifold', quality: 'draft' });
    registerKernelTier('exact', { kernel: 'occt', quality: 'fine' });
    expect(getKernelTier('preview')).toEqual({ kernel: 'manifold', quality: 'draft' });

    const seen = withTier('preview', () => ({
      kernel: getKernel().kernelId,
      quality: currentQuality(),
    }));
    expect(seen).toEqual({ kernel: 'manifold', quality: 'draft' });
    // restored
    expect(currentQuality()).toBe('standard');
  });

  it('throws for an unregistered tier', () => {
    expect(() => withTier('nope', () => 1)).toThrow(/no tier registered/);
  });
});
