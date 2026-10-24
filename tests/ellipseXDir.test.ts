/**
 * Ellipses and elliptical arcs lay their major axis along `xDir`. occt-wasm's
 * raw builders take no xDir, so the adapter uses makeEllipseArcOriented
 * (occt-wasm 5.8+) or turns the shape into place on older builds.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { castShape, curveEndPoint, curveStartPoint, ellipse, ellipseArc, unwrap } from '@/index.js';
import type { Edge } from '@/core/shapeTypes.js';
import type { Vec3 } from '@/core/types.js';
import { getKernel } from '@/kernel/index.js';
import type { OcctWasmAdapter } from '@/kernel/occtWasm/occtWasmAdapter.js';
import type { OcctKernelWasm } from '@/kernel/occtWasm/occtWasmTypes.js';
import { makeEllipseArc as occtWasmEllipseArc } from '@/kernel/occtWasm/constructionOps.js';

const isOcctWasm = (process.env['TEST_KERNEL'] ?? 'occt') === 'occt-wasm';

beforeAll(async () => {
  await initKernel();
}, 30000);

function expectPoint(actual: Vec3, expected: Vec3): void {
  actual.forEach((v, i) => {
    expect(v).toBeCloseTo(expected[i] ?? Number.NaN, 6);
  });
}

describe('ellipse xDir', () => {
  it('lays an arc major axis along xDir', () => {
    // Angle 0 sits on +major (xDir = +Y); 90 deg on +minor (normal x xDir = -X).
    using arc = unwrap(ellipseArc(4, 2, 0, 90, { xDir: [0, 1, 0] }));
    expectPoint(curveStartPoint(arc), [0, 4, 0]);
    expectPoint(curveEndPoint(arc), [-2, 0, 0]);
  });

  it('starts an arc without xDir on the major axis the kernel picks', () => {
    using arc = unwrap(ellipseArc(4, 2, 0, 90));
    expect(Math.hypot(...curveStartPoint(arc))).toBeCloseTo(4, 6);
  });

  it('lays a whole ellipse major axis along xDir', () => {
    // A whole ellipse starts on its +major axis.
    const d = Math.SQRT1_2;
    using e = unwrap(ellipse(4, 2, { xDir: [d, d, 0] }));
    expectPoint(curveStartPoint(e), [4 * d, 4 * d, 0]);
  });
});

describe.skipIf(!isOcctWasm)('occt-wasm builds without makeEllipseArcOriented', () => {
  const raw = () =>
    (
      getKernel() as unknown as OcctWasmAdapter
    ).retainedKernelOwner?.getRawKernel() as OcctKernelWasm & { getShapeCount(): number };
  // An occt-wasm older than 5.8: the same kernel with the oriented builder hidden.
  const legacy = (): OcctKernelWasm => {
    const target = raw();
    return new Proxy(target, {
      get(t, prop) {
        if (prop === 'makeEllipseArcOriented') return undefined;
        const value: unknown = Reflect.get(t, prop);
        return typeof value === 'function' ? value.bind(t) : value;
      },
    });
  };

  it('turns the arc into the xDir frame', () => {
    using arc = castShape(
      occtWasmEllipseArc(legacy(), [1, 2, 3], [0, 0, 1], 4, 2, 0, Math.PI / 2, [0, 1, 0])
    ) as Edge;
    expectPoint(curveStartPoint(arc), [1, 6, 3]);
    expectPoint(curveEndPoint(arc), [-1, 2, 3]);
  });

  it('releases its probe and pre-rotation slots', () => {
    const build = () => {
      using _arc = castShape(
        occtWasmEllipseArc(legacy(), [0, 0, 0], [0, 0, 1], 4, 2, 0, 1, [0, 1, 0])
      );
    };
    build();
    const before = raw().getShapeCount();
    for (let i = 0; i < 10; i++) build();
    expect(raw().getShapeCount()).toBe(before);
  });
});
