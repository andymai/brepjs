// @vitest-environment node
/**
 * Regression: a sketch extruded on a non-XY plane must land in the same world
 * position on Manifold as on OCCT. The Manifold extrude used to align only the
 * extrude axis (Euler rotate) and drop the in-plane basis, so 'YZ'/'XZ' sketches
 * were mis-oriented — e.g. a gridfinity scoop ramp (drawn on 'YZ') extruded
 * mirrored below Z=0 instead of across the bin. See manifold sweepOps
 * `orientExtrusion`.
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel, initOCCT } from '../setup.js';
import { draw, mesh, withKernel, getKernel } from '@/index.js';

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

function bounds(v: Float32Array) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < v.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], v[i + a]);
      hi[a] = Math.max(hi[a], v[i + a]);
    }
  }
  return [...lo, ...hi];
}

describe('plane-extrude orientation parity (manifold vs occt)', () => {
  for (const plane of ['XY', 'YZ', 'XZ'] as const) {
    it(`extrude on ${plane} lands in the same place on both kernels`, () => {
      if (!haveManifold) return;
      const build = () =>
        bounds(
          mesh(
            draw([0, 0])
              .lineTo([0, 5])
              .lineTo([4, 5])
              .lineTo([4, 0])
              .close()
              .sketchOnPlane(plane)
              .extrude(10),
            { cache: false }
          ).vertices
        );
      const occt = withKernel('occt', build);
      const manifold = withKernel('manifold', build);
      for (let i = 0; i < 6; i++) {
        expect(manifold[i]).toBeCloseTo(occt[i], 1);
      }
    });
  }
});
