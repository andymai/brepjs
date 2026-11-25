import { box, getBounds, translate, unwrap, type ValidSolid } from 'brepjs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { currentKernel, initKernel } from '../../../../tests/setup.js';
import { BimDocument } from '../../src/model/bimDocument.js';
import { setBodyTestHooksForTesting } from '../../src/bodyTestHooks.js';
import type { BodyClassification } from '../../src/types/bimTypes.js';
import { measureBodyMaterial, type NonEmpty } from '../../src/types/body.js';
import { nativeShapeCount } from './nativeArena.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const frame = { origin: [1000, 2000, 3000], axisX: [0, 1, 0], axisZ: [0, 0, 1] } as const;
const cases = [
  {
    name: 'panel',
    offset: null,
    volume: 4500000,
    local: [-250, 250, -30, 0, 0, 300],
    placed: [1000, 1030, 1750, 2250, 3000, 3300],
  },
  {
    name: 'disconnected',
    offset: 15,
    volume: 2000,
    local: [0, 25, 0, 10, 0, 10],
    placed: [990, 1000, 2000, 2025, 3000, 3010],
  },
  {
    name: 'overlap',
    offset: 5,
    volume: 1500,
    local: [0, 15, 0, 10, 0, 10],
    placed: [990, 1000, 2000, 2015, 3000, 3010],
  },
] as const;

function items(offset: number | null): NonEmpty<ValidSolid> {
  if (offset === null) {
    using panel = box(500, 30, 300);
    return [translate(panel, [-250, -30, 0])];
  }
  const first = box(10, 10, 10);
  return [first, translate(first, [offset, 0, 0])];
}

export function bodyRecordContract(category: BodyClassification) {
  describe(category, () => {
    it.each(['GRID_REFERENCE', 'LINEAR_REFERENCE'] as const)(
      'preserves %s identities and parameters through adoption and replacement',
      (kind) => {
        using model = new BimDocument();
        const references = [{ kind: 'EXTERNAL' as const, identifier: ' datum ' }];
        const parameters = { offset: 1.5 };
        const id = unwrap(
          model.addAuthoredBody({
            category,
            solids: [box(1, 1, 1)],
            placement: { kind, references, parameters },
          })
        );
        references[0] = { kind: 'EXTERNAL', identifier: 'changed' };
        parameters.offset = 0;
        unwrap(
          model.replaceBody({
            localId: id,
            body: { kind: 'AUTHORITATIVE', solids: [box(2, 2, 2)] },
          })
        );
        const record = model.getElement(id);
        if (record?.representation !== 'BODY') throw new Error('Missing Body');
        expect(record.placement).toEqual({
          kind,
          references: [{ kind: 'EXTERNAL' as const, identifier: ' datum ' }],
          parameters: { offset: 1.5 },
        });
        expect(unwrap(model.materialVolume(record.localId))).toBeCloseTo(8);
        expect(model.placedSolids(record.localId, 'WORLD')).toMatchObject({
          ok: false,
          error: { code: 'PLACEMENT_REFERENCE_UNRESOLVED' },
        });
      }
    );

    it('places an independently owned copy at identity and rejects duplicate items before transfer', () => {
      using model = new BimDocument();
      const placement = {
        kind: 'LOCAL_FRAME',
        frame: { origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1] },
      } as const;
      const solid = box(3, 4, 5);
      expect(model.addAuthoredBody({ category, placement, solids: [solid, solid] }).ok).toBe(false);
      expect(solid.disposed).toBe(false);
      const id = unwrap(model.addAuthoredBody({ category, placement, solids: [solid] }));
      const record = model.getElement(id);
      if (record?.representation !== 'BODY') throw new Error('Missing Body');
      const output = unwrap(model.placedSolids(record.localId, 'WORLD'));
      try {
        model[Symbol.dispose]();
        const [copy] = output;
        if (!copy) throw new Error('Missing independent copy');
        expect(unwrap(measureBodyMaterial([copy]))).toBeCloseTo(60);
      } finally {
        output.forEach((item) => item[Symbol.dispose]());
      }
    });
    it.each(cases)(
      'owns, places and replaces a $name Body',
      ({ offset, volume, local, placed }) => {
        const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
        using model = new BimDocument();
        const solids = items(offset);
        const releases = solids.map((solid) => vi.spyOn(solid, Symbol.dispose));
        const id = unwrap(
          model.addAuthoredBody({
            category,
            metadata: { name: 'Test panel' },
            placement: { kind: 'LOCAL_FRAME', frame },
            solids,
          })
        );
        const record = model.getElement(id);
        if (record?.representation !== 'BODY') throw new Error('Missing retained Body');
        expect(record.geometry.kind).toBe('AUTHORITATIVE');
        expect(record.geometry.solids).toHaveLength(solids.length);
        solids.forEach((solid, index) => expect(record.geometry.solids[index]).toBe(solid));
        const bounds = unwrap(model.bounds(record.localId, 'LOCAL')).bounds;
        const world = unwrap(model.bounds(record.localId, 'WORLD')).bounds;
        [world.xMin, world.xMax, world.yMin, world.yMax, world.zMin, world.zMax].forEach((n, i) =>
          expect(n).toBeCloseTo(Number(placed[i]), 5)
        );
        const observedLocal = [
          bounds.xMin,
          bounds.xMax,
          bounds.yMin,
          bounds.yMax,
          bounds.zMin,
          bounds.zMax,
        ];
        local.forEach((expected, i) => expect(observedLocal[i]).toBeCloseTo(expected, 5));
        expect(unwrap(model.materialVolume(record.localId))).toBeCloseTo(volume, 3);
        expect(
          model.addAuthoredBody({ category, placement: record.placement, solids })
        ).toMatchObject({ ok: false, error: { code: 'BODY_OWNERSHIP_CONFLICT' } });
        if (offset !== null) {
          setBodyTestHooksForTesting({
            before({ step, itemIndex }) {
              if (step === 'union') throw new Error('union failed');
              if (step === 'transform' && itemIndex === 1) throw new Error('second transform');
            },
          });
          try {
            expect(model.placedSolids(record.localId, 'WORLD').ok).toBe(false);
            expect(model.materialVolume(record.localId).ok).toBe(false);
          } finally {
            setBodyTestHooksForTesting(null);
          }
        }
        const output = unwrap(model.placedSolids(record.localId, 'WORLD'));
        try {
          using fresh = box(1, 1, 1);
          const replacement = translate(fresh, [2, 0, 0]);
          const releaseReplacement = vi.spyOn(replacement, Symbol.dispose);
          unwrap(
            model.replaceBody({
              localId: id,
              body: { kind: 'AUTHORITATIVE', solids: [replacement] },
            })
          );
          expect(model.getElement(id)).toMatchObject({
            guid: record.guid,
            metadata: { name: 'Test panel' },
            placement: record.placement,
          });
          releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
          model[Symbol.dispose]();
          expect(releaseReplacement).toHaveBeenCalledTimes(1);
          const boxes = output.map(getBounds);
          const observed = [
            Math.min(...boxes.map((b) => b.xMin)),
            Math.max(...boxes.map((b) => b.xMax)),
            Math.min(...boxes.map((b) => b.yMin)),
            Math.max(...boxes.map((b) => b.yMax)),
            Math.min(...boxes.map((b) => b.zMin)),
            Math.max(...boxes.map((b) => b.zMax)),
          ];
          placed.forEach((expected, i) => expect(observed[i]).toBeCloseTo(expected, 5));
        } finally {
          output.forEach((solid) => solid[Symbol.dispose]());
        }
        if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
      }
    );
  });
}
