import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { box, DisposalScope, fuseAll, getBounds, measureVolume, unwrap } from 'brepjs';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import { placedSolids } from '../src/elementFns/placedGeometry.js';
import { setProductBodyTestHooksForTesting } from '../src/productBodyTestHooks.js';
import { createOverlapFixture } from './helpers/nativeBodyFixture.js';
import { nativeShapeCount } from './helpers/nativeArena.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

afterEach(() => {
  setProductBodyTestHooksForTesting(null);
  vi.restoreAllMocks();
});

describe('native Body baseline', () => {
  it('distinguishes item-volume sum from occupied material in the A/B/P fixture', () => {
    const beforeFixture = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    {
      using scope = new DisposalScope();
      const { a, b, p } = createOverlapFixture(scope);
      const expected = [
        { solid: a, min: [0, 0, 0], max: [1, 1, 1], volume: 1 },
        { solid: b, min: [0.5, 0, 0], max: [1.5, 1, 1], volume: 1 },
        { solid: p, min: [0, 0, 0], max: [2, 1, 1], volume: 2 },
      ];
      for (const item of expected) {
        const bounds = getBounds(item.solid);
        const min = [bounds.xMin, bounds.yMin, bounds.zMin];
        const max = [bounds.xMax, bounds.yMax, bounds.zMax];
        item.min.forEach((value, axis) => expect(min[axis]).toBeCloseTo(value, 6));
        item.max.forEach((value, axis) => expect(max[axis]).toBeCloseTo(value, 6));
        expect(unwrap(measureVolume(item.solid))).toBeCloseTo(item.volume, 8);
      }
      expect(unwrap(measureVolume(a)) + unwrap(measureVolume(b))).toBeCloseTo(2, 8);
      const liveInputs = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      {
        using occupied = unwrap(fuseAll([a, b]));
        using containing = unwrap(fuseAll([a, b, p]));
        expect(unwrap(measureVolume(occupied))).toBeCloseTo(1.5, 8);
        expect(unwrap(measureVolume(containing))).toBeCloseTo(2, 8);
      }
      if (liveInputs !== null) expect(nativeShapeCount()).toBe(liveInputs);
    }
    if (beforeFixture !== null) expect(nativeShapeCount()).toBe(beforeFixture);
  });

  it('counts actual owner releases and cleans a later placement failure without releasing inputs', () => {
    const beforeFixture = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    const inputReleases: ReturnType<typeof vi.fn>[] = [];
    {
      using model = new BimModel();
      const id = unwrap(
        model.addRailing({
          length: 2,
          height: 1,
          thickness: 1,
          origin: [0, 0, 0],
          axisX: [1, 0, 0],
          axisZ: [0, 0, 1],
          materialName: 'Steel',
        })
      );
      const first = box(1, 1, 1);
      const second = box(1, 1, 1, { at: [0.5, 0, 0] });
      const adopted = model.replaceProductBody({
        localId: id,
        body: { kind: 'AUTHORITATIVE', solids: [first, second] },
      });
      if (!adopted.ok) {
        first[Symbol.dispose]();
        second[Symbol.dispose]();
      }
      unwrap(adopted);
      inputReleases.push(vi.spyOn(first, Symbol.dispose), vi.spyOn(second, Symbol.dispose));
      const element = model.getElement(id);
      if (element === null) throw new Error('Expected retained railing');
      const liveInputs = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      if (liveInputs !== null && beforeFixture !== null) {
        expect(liveInputs).toBe(beforeFixture + 2);
      }
      const outputReleases: ReturnType<typeof vi.fn>[] = [];
      setProductBodyTestHooksForTesting({
        afterAllocate: ({ solid }) => {
          outputReleases.push(vi.spyOn(solid, Symbol.dispose));
          if (outputReleases.length === 2) throw new Error('injected later placement failure');
        },
      });
      const result = placedSolids(element);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected placement rejection');
      expect(result.error.code).toBe('BODY_OPERATION_FAILED');
      expect(outputReleases).toHaveLength(2);
      for (const release of outputReleases) expect(release).toHaveBeenCalledTimes(1);
      for (const release of inputReleases) expect(release).not.toHaveBeenCalled();
      expect(unwrap(measureVolume(first))).toBeCloseTo(1, 8);
      expect(unwrap(measureVolume(second))).toBeCloseTo(1, 8);
      if (liveInputs !== null) expect(nativeShapeCount()).toBe(liveInputs);
    }
    for (const release of inputReleases) expect(release).toHaveBeenCalledTimes(1);
    if (beforeFixture !== null) expect(nativeShapeCount()).toBe(beforeFixture);
  });

  it('distinguishes a disposal exception after real release from native resource retention', () => {
    const beforeFixture = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    const solid = box(1, 1, 1);
    const realDispose = solid[Symbol.dispose].bind(solid);
    const release = vi.spyOn(solid, Symbol.dispose).mockImplementation(() => {
      realDispose();
      throw new Error('injected after native release');
    });
    try {
      expect(() => solid[Symbol.dispose]()).toThrow('injected after native release');
      expect(release).toHaveBeenCalledTimes(1);
      expect(solid.disposed).toBe(true);
      if (beforeFixture !== null) expect(nativeShapeCount()).toBe(beforeFixture);
    } finally {
      release.mockRestore();
      if (!solid.disposed) realDispose();
    }
  });

  it('reports an outstanding input when a disposer throws before release', () => {
    const beforeFixture = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    const solid = box(1, 1, 1);
    const liveInput = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    const realDispose = solid[Symbol.dispose].bind(solid);
    const release = vi.spyOn(solid, Symbol.dispose).mockImplementation(() => {
      throw new Error('injected before native release; release outcome is uncertain to the owner');
    });
    try {
      expect(() => solid[Symbol.dispose]()).toThrow('release outcome is uncertain');
      expect(release).toHaveBeenCalledTimes(1);
      expect(solid.disposed).toBe(false);
      expect(unwrap(measureVolume(solid))).toBeCloseTo(1, 8);
      if (liveInput !== null && beforeFixture !== null) {
        expect(liveInput).toBe(beforeFixture + 1);
        expect(nativeShapeCount()).toBe(liveInput);
      }
    } finally {
      release.mockRestore();
      // This probe knows its injected failure made no release attempt. This
      // explicit fixture cleanup is not evidence that the failed owner reclaimed it.
      realDispose();
    }
    if (beforeFixture !== null) expect(nativeShapeCount()).toBe(beforeFixture);
  });
});
