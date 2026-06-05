// @vitest-environment node
/**
 * Regression: `composeTransform` rotate ops are DEGREES at the kernel boundary
 * (the OCCT adapters convert to radians internally), but the Manifold adapter
 * fed them to `rotationMatrix`, which expects radians. A composed 90° rotate
 * became a 90-radian one, so `transformCopy`-placed shapes (e.g. gridfinity's
 * honeycomb wall-pattern hex prisms) landed off-target and boolean cuts
 * silently removed nothing.
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel, initOCCT } from '../setup.js';
import {
  circularPattern,
  compound,
  composeTransforms,
  cut,
  drawPolysides,
  makeBaseBox,
  measureVolume,
  mesh,
  transformCopy,
  translate,
  unwrap,
  withKernel,
  getKernel,
  type TransformOp,
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

function placed(ops: TransformOp[]) {
  const box = makeBaseBox(10, 4, 2);
  const trsf = composeTransforms(ops);
  try {
    return transformCopy(box, trsf);
  } finally {
    trsf.cleanup();
  }
}

describe('composed-transform parity (manifold vs occt)', () => {
  it('rotate inside composeTransforms is degrees on both kernels', (ctx) => {
    if (!haveManifold) return ctx.skip();
    const build = () =>
      bounds(
        mesh(
          placed([
            { type: 'rotate', angle: 90, axis: [1, 0, 0] },
            { type: 'translate', v: [5, 6, 7] },
          ]),
          { cache: false }
        ).vertices
      );
    const occt = withKernel('occt', build);
    const manifold = withKernel('manifold', build);
    for (let i = 0; i < 6; i++) {
      expect(manifold[i]).toBeCloseTo(occt[i], 1);
    }
  });

  it('chained rotates compose in the same order on both kernels', (ctx) => {
    if (!haveManifold) return ctx.skip();
    const build = () =>
      bounds(
        mesh(
          placed([
            { type: 'translate', v: [1, 2, -3] },
            { type: 'rotate', angle: 90, axis: [1, 0, 0] },
            { type: 'rotate', angle: 30, axis: [0, 0, 1] },
            { type: 'translate', v: [4, 0, 9] },
          ]),
          { cache: false }
        ).vertices
      );
    const occt = withKernel('occt', build);
    const manifold = withKernel('manifold', build);
    for (let i = 0; i < 6; i++) {
      expect(manifold[i]).toBeCloseTo(occt[i], 1);
    }
  });

  it('wall-pattern shaped cut (hex prism compound) removes material on both kernels', (ctx) => {
    if (!haveManifold) return ctx.skip();
    // Mirrors gridfinity's honeycomb path: hex prisms extruded on XY, placed
    // onto a vertical wall via composeTransforms + transformCopy, grouped with
    // compound(), then cut from the wall solid.
    const build = () => {
      const wall = makeBaseBox(40, 2, 20);
      const template = drawPolysides(3, 6).sketchOnPlane('XY').extrude(8);
      const prisms = [];
      for (const [cx, cz] of [
        [-10, 6],
        [0, 10],
        [10, 14],
      ] as const) {
        const trsf = composeTransforms([
          { type: 'translate', v: [cx, cz, -4] },
          { type: 'rotate', angle: 90, axis: [1, 0, 0] },
          { type: 'translate', v: [0, 1, 0] },
        ]);
        try {
          prisms.push(transformCopy(template, trsf));
        } finally {
          trsf.cleanup();
        }
      }
      const tool = compound(prisms);
      const result = unwrap(cut(wall, tool));
      return unwrap(measureVolume(result));
    };
    const occt = withKernel('occt', build);
    const manifold = withKernel('manifold', build);
    const plain = withKernel('occt', () => unwrap(measureVolume(makeBaseBox(40, 2, 20))));
    expect(occt).toBeLessThan(plain);
    expect(manifold).toBeCloseTo(occt, 0);
  });

  it('circularPattern spreads copies over degrees on both kernels', (ctx) => {
    if (!haveManifold) return ctx.skip();
    const build = () =>
      bounds(
        mesh(unwrap(circularPattern(translate(makeBaseBox(2, 2, 2), 8, 0, 0), [0, 0, 1], 4, 270)), {
          cache: false,
        }).vertices
      );
    const occt = withKernel('occt', build);
    const manifold = withKernel('manifold', build);
    for (let i = 0; i < 6; i++) {
      expect(manifold[i]).toBeCloseTo(occt[i], 1);
    }
  });
});
