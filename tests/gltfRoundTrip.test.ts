import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { shouldSkipSuite } from './helpers/kernelDivergences.js';
import {
  box,
  importGLB,
  measureVolume,
  isSolid,
  unwrap,
  isOk,
  getBounds,
  exportGlb,
} from '@/index.js';
import { mesh as meshOf } from '@/topology/meshFns.js';
import { getKernel } from '@/kernel/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe.skipIf(shouldSkipSuite('gltfRoundTrip'))('brepkit-specific: GLB round-trip', () => {
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

  // The JS glTF exporter defaults to Y-up (a −90°-X root node) so parts display
  // upright in standard glTF viewers. A round-trip must still recover the
  // original Z-up orientation — i.e. the importer inverts the node rotation.
  // An asymmetric box makes any uncorrected rotation visible as swapped extents.
  it('Y-up export round-trips back to the original orientation', async () => {
    const solid = box(10, 20, 40, { centered: true });
    const before = getBounds(solid);
    const ext = (b: ReturnType<typeof getBounds>) => [
      b.xMax - b.xMin,
      b.yMax - b.yMin,
      b.zMax - b.zMin,
    ];

    for (const upAxis of ['Y', 'Z'] as const) {
      const glb = exportGlb(meshOf(solid), { upAxis });
      const imported = unwrap(await importGLB(new Blob([glb])));
      const after = getBounds(imported);
      // extents preserved per-axis ⇒ no net rotation leaked through the round-trip
      expect(ext(after)[0]).toBeCloseTo(ext(before)[0], 1);
      expect(ext(after)[1]).toBeCloseTo(ext(before)[1], 1);
      expect(ext(after)[2]).toBeCloseTo(ext(before)[2], 1);
    }
  });
});
