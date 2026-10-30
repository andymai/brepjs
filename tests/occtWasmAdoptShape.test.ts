/**
 * OcctWasmAdapter.adoptShape / shapeId: moving shapes between occt-wasm's own
 * OcctKernel calls and brepjs on the same kernel without a BREP round trip.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, castShape, fuse, isOk, isSolid, measureVolume, unwrap } from '@/index.js';
import { getKernel } from '@/kernel/index.js';
import type { OcctWasmAdapter } from '@/kernel/occtWasm/occtWasmAdapter.js';

const isOcctWasm = (process.env['TEST_KERNEL'] ?? 'occt') === 'occt-wasm';

interface RawKernel {
  makeBox(dx: number, dy: number, dz: number): number;
  getVolume(id: number): number;
  getShapeCount(): number;
}

beforeAll(async () => {
  await initKernel();
}, 30000);

describe.skipIf(!isOcctWasm)('OcctWasmAdapter shape exchange', () => {
  const adapter = () => getKernel() as unknown as OcctWasmAdapter;
  const raw = () => adapter().retainedKernelOwner?.getRawKernel() as RawKernel;

  it('adopts a shape built through OcctKernel into brepjs', () => {
    using adopted = castShape(adapter().adoptShape(raw().makeBox(1, 2, 3)));
    expect(isSolid(adopted)).toBe(true);
    if (!isSolid(adopted)) throw new Error('expected a solid');
    expect(unwrap(measureVolume(adopted))).toBeCloseTo(6, 9);

    using other = box(1, 1, 1);
    const fused = fuse(adopted, other, { unsafe: true });
    expect(isOk(fused)).toBe(true);
    using result = unwrap(fused);
    expect(unwrap(measureVolume(result))).toBeCloseTo(6, 9);
  });

  it('hands a brepjs shape to OcctKernel by its arena id', () => {
    using b = box(2, 2, 2);
    expect(raw().getVolume(adapter().shapeId(b.wrapped))).toBeCloseTo(8, 9);
  });

  it('frees an adopted slot when the brepjs shape is disposed', () => {
    const before = raw().getShapeCount();
    for (let i = 0; i < 10; i++) {
      using _adopted = castShape(adapter().adoptShape(raw().makeBox(1, 1, 1)));
    }
    expect(raw().getShapeCount()).toBe(before);
  });
});
