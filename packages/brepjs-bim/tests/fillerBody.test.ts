import { box, unwrap } from 'brepjs';
import { expect, it, vi } from 'vitest';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { fromIfc } from '../src/import/fromIfc.js';
import { disposeImportedModel } from '../src/import/importedModel.js';
import { bodyRecordContract } from './helpers/bodyRecordContract.js';
import { DOOR, OPENING_WALL } from './helpers/openingFixture.js';
const placement = {
  kind: 'LOCAL_FRAME',
  frame: { origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1] },
} as const;
const meta = { applicationName: 'Fillers', applicationVersion: '1' };
for (const category of ['DOOR', 'WINDOW'] as const) {
  bodyRecordContract(category);
  it('keeps the host unchanged when attaching a multi-item ' + category, async () => {
    using model = new BimModel();
    unwrap(model.init({ name: 'Fillers' }));
    const host = unwrap(model.addSlab({ ...OPENING_WALL, width: 10, predefinedType: 'FLOOR' }));
    const opening = unwrap(
      model.addSlabOpening({ slabLocalId: host, offsetX: 1, offsetY: 1, sizeX: 2, sizeY: 3 })
    );
    const cut = model.getElement(host);
    const id = unwrap(
      model.addAuthoredBody({
        category,
        placement,
        openingLocalId: opening,
        solids: [box(1, 1, 1), box(2, 2, 2)],
      })
    );
    expect(model.getElement(host)).toBe(cut);
    using duplicate = box(1, 1, 1);
    expect(
      model.addAuthoredBody({ category, placement, openingLocalId: opening, solids: [duplicate] })
    ).toMatchObject({ ok: false, error: { code: 'OPENING_ALREADY_FILLED' } });
    expect(duplicate.disposed).toBe(false);
    const loaded = unwrap(await fromIfc(unwrap(await toIfc(model, meta))));
    try {
      const filler = loaded.elements.find((el) => el.guid === model.getElement(id)?.guid);
      expect(filler?.geometry.solids).toHaveLength(2);
      expect(filler?.geometry.volumeMm3).toBeCloseTo(8, 3);
    } finally {
      disposeImportedModel(loaded);
    }
  });
}
it('keeps both caller handles and old host when combined filler adoption fails', () => {
  using model = new BimModel();
  const wall = unwrap(model.addWall(OPENING_WALL));
  const old = model.getElement(wall);
  const relationships = model.getAllRelationships();
  if (old?.representation !== 'BODY') throw new Error('Missing wall');
  using caller = box(1, 1, 1);
  const release = vi.spyOn(caller, Symbol.dispose);
  expect(
    model.addDoorAndCutWall(
      { ...DOOR, wallLocalId: wall },
      { solids: [caller, old.geometry.solids[0]] }
    )
  ).toMatchObject({ ok: false, error: { code: 'BODY_OWNERSHIP_CONFLICT' } });
  expect(model.getElement(wall)).toBe(old);
  expect(model.getAllElements()).toHaveLength(1);
  expect(model.getAllRelationships()).toEqual(relationships);
  expect(release).not.toHaveBeenCalled();
});
