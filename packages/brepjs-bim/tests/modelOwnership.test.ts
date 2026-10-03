import { beforeAll, expect, it } from 'vitest';
import { box, clone, getKernel, measureVolume, unwrap } from 'brepjs';
import { BimModel } from '../src/model/bimModel.js';
import type { WallSpec } from '../src/specs/wallSpec.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const WALL: WallSpec = {
  length: 2,
  height: 3,
  thickness: 1,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Brick',
};

it('owns a protected recipe Body and releases it when its model closes', () => {
  const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
  {
    using model = new BimModel();
    unwrap(model.init({ name: 'Ownership test' }));
    const id = unwrap(model.addWall(WALL));
    const wall = model.getElement(id);
    if (wall?.category !== 'WALL') throw new Error('Expected retained Wall');
    expect(wall.geometry.kind).toBe('PARAMETRIC');
    expect(wall.geometry.solids).toHaveLength(1);
    expect(Object.isFrozen(wall)).toBe(true);
    expect(Object.isFrozen(wall.geometry)).toBe(true);
    expect(Object.isFrozen(wall.geometry.solids)).toBe(true);
    expect(unwrap(measureVolume(wall.geometry.solids[0]))).toBeCloseTo(6, 8);
    expect(model.getWalls()[0]?.geometry.solids[0]).toBe(wall.geometry.solids[0]);
  }
  if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
});

it('commits fresh multi-item Bodies, preserves identity, and rejects authority reversal', () => {
  using model = new BimModel();
  unwrap(model.init({ name: 'Replacement' }));
  const id = unwrap(model.addWall(WALL));
  const before = model.getElement(id);
  if (before?.category !== 'WALL') throw new Error('Expected Wall');
  const first = box(1, 1, 1);
  const second = box(1, 1, 1);
  const receipt = unwrap(
    model.replaceProductBody({
      localId: id,
      body: { kind: 'PARAMETRIC', solids: [first, second] },
    })
  );
  expect(receipt).toMatchObject({
    kind: 'COMMITTED',
    localId: id,
    guid: before.guid,
    cleanup: { kind: 'COMPLETE' },
  });
  expect(before.geometry.solids[0].disposed).toBe(true);
  const after = model.getElement(id);
  if (after?.category !== 'WALL') throw new Error('Expected Wall');
  expect(after.spec).toBe(before.spec);
  expect(after.geometry.solids).toEqual([first, second]);
  const authored = box(2, 2, 2);
  unwrap(
    model.replaceProductBody({ localId: id, body: { kind: 'AUTHORITATIVE', solids: [authored] } })
  );
  using rejected = box(3, 3, 3);
  expect(
    model.replaceProductBody({ localId: id, body: { kind: 'PARAMETRIC', solids: [rejected] } })
  ).toMatchObject({ ok: false, error: { code: 'BODY_AUTHORITY_TRANSITION' } });
  expect(rejected.disposed).toBe(false);
  expect(model.getElement(id)?.geometry).toMatchObject({
    kind: 'AUTHORITATIVE',
    solids: [authored],
  });
  const later = box(4, 4, 4);
  unwrap(
    model.replaceProductBody({ localId: id, body: { kind: 'AUTHORITATIVE', solids: [later] } })
  );
  expect(authored.disposed).toBe(true);
  expect(model.getElement(id)?.geometry).toMatchObject({ kind: 'AUTHORITATIVE', solids: [later] });
});

it('rejects borrowed Body handles in either adoption direction without consuming a stable key', () => {
  using model = new BimModel();
  const id = unwrap(model.addWall(WALL));
  const wall = model.getElement(id);
  if (wall?.category !== 'WALL') throw new Error('Expected Wall');
  const borrowed = wall.geometry.solids[0];
  expect(
    model.addProxy({ name: 'Borrowed', solid: borrowed }, { stableKey: 'retry' })
  ).toMatchObject({ ok: false, error: { code: 'BODY_OWNERSHIP_CONFLICT' } });
  expect(
    model.replaceProductBody({ localId: id, body: { kind: 'AUTHORITATIVE', solids: [borrowed] } })
  ).toMatchObject({ ok: false, error: { code: 'BODY_OWNERSHIP_CONFLICT' } });
  const independent = unwrap(clone(borrowed));
  const proxy = unwrap(
    model.addProxy({ name: 'Independent', solid: independent }, { stableKey: 'retry' })
  );
  expect(
    model.replaceProductBody({
      localId: id,
      body: { kind: 'AUTHORITATIVE', solids: [independent] },
    })
  ).toMatchObject({ ok: false, error: { code: 'BODY_OWNERSHIP_CONFLICT' } });
  expect(model.getElement(proxy)?.geometry).toBe(independent);
  expect(borrowed.disposed).toBe(false);
  expect(independent.disposed).toBe(false);
});

it.each(['PANEL', 'POSTED'] as const)(
  'adopts real %s railing recipe output as native solid items',
  (infill) => {
    const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    {
      using model = new BimModel();
      const created = model.addRailing({
        ...WALL,
        length: 2000,
        height: 1000,
        thickness: 50,
        infill,
      });
      const id = unwrap(created);
      const railing = model.getElement(id);
      if (railing?.category !== 'RAILING') throw new Error('Expected Railing');
      expect(railing.geometry.kind).toBe('PARAMETRIC');
      expect(railing.geometry.solids.length).toBeGreaterThan(0);
      for (const item of railing.geometry.solids)
        expect(getKernel().shapeType(item.wrapped)).toBe('solid');
    }
    if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
  }
);
