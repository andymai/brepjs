import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DisposalScope, getBounds, getKernel, measureVolume, unwrap } from 'brepjs';
import { makeLocalIdCounter } from '../src/identity/localId.js';
import { newIfcGuid } from '../src/identity/ifcGuid.js';
import { placedSolids } from '../src/elementFns/placedGeometry.js';
import { validateProductBody } from '../src/types/productBody.js';
import { setProductBodyTestHooksForTesting } from '../src/productBodyTestHooks.js';
import { createOverlapFixture } from './helpers/nativeBodyFixture.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import type { BimElement } from '../src/types/bimTypes.js';
import type { FrameInput } from '../src/placementFrame.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const parentFrame = { origin: [0, 20, 0], axisX: [0, 1, 0], axisZ: [0, 0, 1] } satisfies FrameInput;
const ids = makeLocalIdCounter();
afterEach(() => {
  setProductBodyTestHooksForTesting(null);
  vi.restoreAllMocks();
});

for (const category of ['WALL', 'RAILING'] as const) {
  describe.each(['PARAMETRIC', 'AUTHORITATIVE'] as const)(`${category} %s placedSolids`, (kind) => {
    it('preserves all retained items and applies element and parent frames once', () => {
      const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      {
        using scope = new DisposalScope();
        const { a, b } = createOverlapFixture(scope);
        const geometry = unwrap(validateProductBody({ kind, solids: [a, b] }));
        const element: BimElement<typeof category> = {
          guid: newIfcGuid(),
          localId: ids.next(),
          category,
          geometry,
          spec: {
            length: 999,
            height: 999,
            thickness: 999,
            materialName: 'Steel',
            origin: [10, 0, 0],
            axisX: [0, 1, 0],
            axisZ: [0, 0, 1],
          },
        };
        const live = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
        const output = unwrap(placedSolids(element, { parentFrame }));
        try {
          expect(output).toHaveLength(2);
          output.forEach((solid, i) => {
            expect(solid).not.toBe(geometry.solids[i]);
            const bounds = getBounds(solid);
            expect(bounds.xMin).toBeCloseTo(-1 - i * 0.5, 6);
            expect(bounds.xMax).toBeCloseTo(-i * 0.5, 6);
            expect(bounds.yMin).toBeCloseTo(29, 6);
            expect(bounds.yMax).toBeCloseTo(30, 6);
            expect(bounds.zMin).toBeCloseTo(0, 6);
            expect(unwrap(measureVolume(solid))).toBeCloseTo(1, 8);
          });
        } finally {
          output.forEach((solid) => solid[Symbol.dispose]());
        }
        expect(geometry.kind).toBe(kind);
        expect(geometry.solids).toEqual([a, b]);
        expect(unwrap(measureVolume(a))).toBeCloseTo(1, 8);
        if (live !== null) expect(nativeShapeCount()).toBe(live);
      }
      if (before !== null) expect(nativeShapeCount()).toBe(before);
    });

    it('uses shared partial-output cleanup and rejects invalid frames before allocation', () => {
      using scope = new DisposalScope();
      const { a, b } = createOverlapFixture(scope);
      const geometry = unwrap(validateProductBody({ kind, solids: [a, b] }));
      const element: BimElement<typeof category> = {
        guid: newIfcGuid(),
        localId: ids.next(),
        category,
        geometry,
        spec: {
          length: 2,
          height: 1,
          thickness: 1,
          materialName: 'Steel',
          origin: [0, 0, 0],
          axisX: [1, 0, 0],
          axisZ: [0, 0, 1],
        },
      };
      const locate = vi.spyOn(getKernel(), 'locate');
      const invalid = { ...parentFrame, axisX: [2, 0, 0] } satisfies FrameInput;
      expect(placedSolids(element, { parentFrame: invalid })).toMatchObject({
        ok: false,
        error: { code: 'INVALID_RIGID_FRAME' },
      });
      element.spec.axisX[0] = 2;
      expect(placedSolids(element)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_RIGID_FRAME' },
      });
      expect(locate).not.toHaveBeenCalled();
      element.spec.axisX[0] = 1;
      const releases: ReturnType<typeof vi.spyOn>[] = [];
      setProductBodyTestHooksForTesting({
        afterAllocate({ solid, itemIndex }) {
          releases.push(vi.spyOn(solid, Symbol.dispose));
          if (itemIndex === 1) throw new Error('later placement failure');
        },
      });
      const live = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      expect(placedSolids(element, { parentFrame })).toMatchObject({
        ok: false,
        error: { operation: 'transformProductBody', itemIndex: 1 },
      });
      expect(releases).toHaveLength(2);
      releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
      if (live !== null) expect(nativeShapeCount()).toBe(live);
      expect(unwrap(measureVolume(a))).toBeCloseTo(1, 8);
    });
  });
}
