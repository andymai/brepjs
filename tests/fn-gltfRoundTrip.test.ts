import { describe, it, expect, beforeAll } from 'vitest';
import { currentKernel, initKernel } from './setup.js';
import { box, importGLB, measureVolume, isSolid, unwrap, isOk } from '../src/index.js';
import { getKernel } from '../src/kernel/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe.skipIf(currentKernel !== 'brepkit')('brepkit-specific: GLB round-trip', () => {
  it('exports a box as GLB then re-imports with preserved volume', async () => {
    const solid = box(10, 10, 10);
    const originalVolume = unwrap(measureVolume(solid));
    expect(originalVolume).toBeCloseTo(1000, 0);

    // Export via kernel (returns ArrayBuffer)
    const glbData = getKernel().exportGLB(solid.wrapped, 0.1);
    expect(glbData.byteLength).toBeGreaterThan(0);

    // Round-trip import
    const blob = new Blob([glbData], { type: 'model/gltf-binary' });
    const importResult = await importGLB(blob);
    expect(isOk(importResult)).toBe(true);

    const imported = unwrap(importResult);
    expect(isSolid(imported)).toBe(true);

    // Volume should be approximately preserved (mesh-based, so allow tolerance)
    if (isSolid(imported)) {
      const reimportedVolume = unwrap(measureVolume(imported));
      // GLB is mesh-based, so volume won't match exactly but should be close
      expect(reimportedVolume).toBeGreaterThan(0);
      expect(reimportedVolume).toBeCloseTo(originalVolume, -1); // within ~10%
    }
  });
});
