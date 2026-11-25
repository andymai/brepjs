import { BimDocument, authoring } from '../src/index.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { box, getBounds, getKernel, measureVolume, unwrap } from 'brepjs';
import { setBodyTestHooksForTesting } from '../src/bodyTestHooks.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import type { FrameInput } from '../src/placementFrame.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const parentFrame = { origin: [0, 20, 0], axisX: [0, 1, 0], axisZ: [0, 0, 1] } satisfies FrameInput;

afterEach(() => {
  setBodyTestHooksForTesting(null);
  vi.restoreAllMocks();
});

function fixture(
  model: BimDocument,
  category: 'WALL' | 'RAILING',
  kind: 'PARAMETRIC' | 'AUTHORITATIVE'
) {
  const commands = authoring(model);
  const parent = unwrap(
    commands.addSite({
      name: 'Parent',
      origin: [...parentFrame.origin],
      axisX: [...parentFrame.axisX],
      axisZ: [...parentFrame.axisZ],
    })
  );
  const spec = {
    length: 999,
    height: 999,
    thickness: 999,
    materialName: 'Steel',
    origin: [10, 0, 0],
    axisX: [0, 1, 0],
    axisZ: [0, 0, 1],
  } as const;
  const id = unwrap(
    category === 'WALL'
      ? commands.addWall({
          ...spec,
          origin: [...spec.origin],
          axisX: [...spec.axisX],
          axisZ: [...spec.axisZ],
        })
      : commands.addRailing({
          ...spec,
          origin: [...spec.origin],
          axisX: [...spec.axisX],
          axisZ: [...spec.axisZ],
        })
  );
  unwrap(model.reparent(id, parent, 'KEEP_LOCAL'));
  const a = box(1, 1, 1),
    b = box(1, 1, 1, { at: [1, 0.5, 0.5] });
  unwrap(model.replaceBody({ localId: id, body: { kind, solids: [a, b] } }));
  const record = model.getElement(id);
  if (record.representation !== 'BODY') throw Error('Body required');
  return { id, parent, a, b, geometry: record.geometry };
}

for (const category of ['WALL', 'RAILING'] as const) {
  describe.each(['PARAMETRIC', 'AUTHORITATIVE'] as const)(`${category} %s placedSolids`, (kind) => {
    it('preserves all retained items and applies element and parent frames once', () => {
      const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      {
        using model = new BimDocument();
        const { id, a, b, geometry } = fixture(model, category, kind);
        const live = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
        const output = unwrap(model.placedSolids(id, 'WORLD'));
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
      using model = new BimDocument();
      const { id, parent, a } = fixture(model, category, kind);
      const locate = vi.spyOn(getKernel(), 'locate');
      const invalid = { ...parentFrame, axisX: [2, 0, 0] } satisfies FrameInput;
      expect(model.move(parent, invalid)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_RIGID_FRAME' },
      });
      expect(model.move(id, invalid)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_RIGID_FRAME' },
      });
      expect(locate).not.toHaveBeenCalled();
      const releases: ReturnType<typeof vi.spyOn>[] = [];
      setBodyTestHooksForTesting({
        afterAllocate({ solid, itemIndex }) {
          releases.push(vi.spyOn(solid, Symbol.dispose));
          if (itemIndex === 1) throw new Error('later placement failure');
        },
      });
      const live = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      expect(model.placedSolids(id, 'WORLD')).toMatchObject({
        ok: false,
        error: { operation: 'transformBody', itemIndex: 1 },
      });
      expect(releases).toHaveLength(2);
      releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
      if (live !== null) expect(nativeShapeCount()).toBe(live);
      expect(unwrap(measureVolume(a))).toBeCloseTo(1, 8);
    });
  });
}
