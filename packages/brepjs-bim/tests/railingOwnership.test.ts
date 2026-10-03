import { beforeAll, afterEach, expect, it, vi } from 'vitest';
import { getKernel, measureVolume, unwrap } from 'brepjs';
import { railingToSolid } from '../src/elementFns/railingFns.js';
import type { RailingSpec } from '../src/specs/railingSpec.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const SPEC: RailingSpec = {
  length: 2000,
  height: 1000,
  thickness: 50,
  infill: 'POSTED',
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Steel',
};
afterEach(() => vi.restoreAllMocks());

it('returns an independently owned native solid with the analytical posted material volume', () => {
  const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
  {
    using solid = unwrap(railingToSolid(SPEC));
    expect(getKernel().shapeType(solid.wrapped)).toBe('solid');
    expect(unwrap(measureVolume(solid))).toBeCloseTo(16_750_000, 5);
  }
  if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
});

it('reclaims generated bars and intermediates when a later native Boolean throws', () => {
  const kernel = getKernel();
  const fuse = kernel.fuse.bind(kernel);
  const history = kernel.fuseWithHistory.bind(kernel);
  const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
  let calls = 0;
  const cause = new Error('Later railing union');
  vi.spyOn(kernel, 'fuse').mockImplementation((...args): unknown => {
    if (++calls === 2) throw cause;
    return fuse(...args);
  });
  vi.spyOn(kernel, 'fuseWithHistory').mockImplementation((...args) => {
    if (++calls === 2) throw cause;
    return history(...args);
  });
  expect(railingToSolid(SPEC)).toMatchObject({ ok: false });
  if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
});

it.each(['copy', 'extract'] as const)(
  'reclaims the compound and borrowed topology when native %s fails',
  (step) => {
    const kernel = getKernel();
    const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    const cause = new Error('Railing extraction');
    if (step === 'copy')
      vi.spyOn(kernel, 'copyShape').mockImplementation(() => {
        throw cause;
      });
    else {
      const iterate = kernel.iterShapes.bind(kernel);
      const downcast = kernel.downcast.bind(kernel);
      let extracted: unknown;
      vi.spyOn(kernel, 'iterShapes').mockImplementation((...args): unknown[] => {
        const shapes = iterate(...args);
        if (args[1] === 'solid') extracted = shapes[0];
        return shapes;
      });
      vi.spyOn(kernel, 'downcast').mockImplementation((raw, type): unknown => {
        if (raw === extracted) throw cause;
        return downcast(raw, type);
      });
    }
    expect(railingToSolid(SPEC)).toMatchObject({ ok: false });
    if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
  }
);
