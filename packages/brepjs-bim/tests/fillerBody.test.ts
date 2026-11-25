import { authoring } from '../src/model/authoring.js';
import { addDeliveryStorey } from './helpers/deliveryStorey.js';
import { box, clone, unwrap } from 'brepjs';
import { expect, it, vi } from 'vitest';
import { BimDocument } from '../src/model/bimDocument.js';
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
    using model = new BimDocument();
    unwrap(model.init({ name: 'Fillers' }));
    const host = unwrap(
      authoring(model).addSlab({ ...OPENING_WALL, width: 10, predefinedType: 'FLOOR' })
    );
    const opening = unwrap(
      authoring(model).addSlabOpening({
        slabLocalId: host,
        offsetX: 1,
        offsetY: 1,
        sizeX: 2,
        sizeY: 3,
      })
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
    addDeliveryStorey(model, host, id);
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
  using model = new BimDocument();
  const wall = unwrap(authoring(model).addWall(OPENING_WALL));
  const old = model.getElement(wall);
  const relationships = model.getAllRelationships();
  if (old?.representation !== 'BODY') throw new Error('Missing wall');
  using caller = box(1, 1, 1);
  const release = vi.spyOn(caller, Symbol.dispose);
  expect(
    authoring(model).addDoorAndCutWall(
      { ...DOOR, wallLocalId: wall },
      { solids: [caller, old.geometry.solids[0]] }
    )
  ).toMatchObject({ ok: false, error: { code: 'BODY_OWNERSHIP_CONFLICT' } });
  expect(model.getElement(wall)).toBe(old);
  expect(model.getAllElements()).toHaveLength(1);
  expect(model.getAllRelationships()).toEqual(relationships);
  expect(release).not.toHaveBeenCalled();
});

it('keeps arbitrary replacement material under a slab Opening on reload', async () => {
  using model = new BimDocument();
  unwrap(model.init({ name: 'Replacement slab' }));
  const id = unwrap(
    authoring(model).addSlab({ ...OPENING_WALL, width: 10, predefinedType: 'FLOOR' })
  );
  unwrap(
    authoring(model).addSlabOpening({ slabLocalId: id, offsetX: 1, offsetY: 1, sizeX: 2, sizeY: 3 })
  );
  unwrap(
    model.replaceBody({ localId: id, body: { kind: 'AUTHORITATIVE', solids: [box(10, 10, 2)] } })
  );
  addDeliveryStorey(model, id);
  const bytes = unwrap(await toIfc(model, meta));
  expect(new TextDecoder().decode(bytes)).toContain("'Reference'");
  const imported = unwrap(await fromIfc(bytes));
  try {
    const slab = imported.elements.find((el) => el.guid === model.getElement(id)?.guid);
    expect(slab?.geometry.volumeMm3).toBeCloseTo(200);
  } finally {
    disposeImportedModel(imported);
  }
});

it.each(['DOOR', 'WINDOW'] as const)(
  'exports a standalone %s panel only while it describes the retained Body',
  async (category) => {
    using model = new BimDocument();
    unwrap(model.init({ name: 'Independent panel' }));
    const id = unwrap(
      authoring(model).addFillerPanel({
        category,
        width: 10,
        height: 20,
        materialName: 'Wood',
        placement,
      })
    );
    const panel = model.getElement(id);
    if (panel?.representation !== 'BODY') throw new Error('Missing panel Body');
    expect(panel.geometry.kind).toBe('PARAMETRIC');
    const extents = unwrap(model.bounds(panel.localId, 'LOCAL')).bounds;
    expect(extents.xMin).toBeCloseTo(-5);
    expect(extents.yMax).toBeCloseTo(10);
    expect(extents.zMax).toBeCloseTo(100);
    expect(unwrap(model.materialVolume(panel.localId))).toBeCloseTo(20000);
    addDeliveryStorey(model, id);
    const analytic = new TextDecoder().decode(unwrap(await toIfc(model, meta)));
    expect(analytic).toContain('IFCEXTRUDEDAREASOLID(');
    const replacement = unwrap(clone(panel.geometry.solids[0]));
    unwrap(
      model.replaceBody({ localId: id, body: { kind: 'AUTHORITATIVE', solids: [replacement] } })
    );
    const bytes = unwrap(await toIfc(model, meta));
    const text = new TextDecoder().decode(bytes);
    expect(text).not.toContain('IFCEXTRUDEDAREASOLID(');
    expect(text.match(/=IFCTRIANGULATEDFACESET\(/g)).toHaveLength(1);
    expect(text).not.toContain('IFCOPENINGELEMENT(');
    const imported = unwrap(await fromIfc(bytes));
    try {
      const result = imported.elements.find((el) => el.guid === panel.guid);
      expect(result?.geometry.solids).toHaveLength(1);
      expect(result?.geometry.volumeMm3).toBeCloseTo(20000, 3);
    } finally {
      disposeImportedModel(imported);
    }
  }
);

it('rejects unsupported Opening definitions and nonphysical Body classifications before adoption', () => {
  using model = new BimDocument();
  const wall = unwrap(authoring(model).addWall(OPENING_WALL));
  const slab = unwrap(
    authoring(model).addSlab({ ...OPENING_WALL, width: 10, predefinedType: 'FLOOR' })
  );
  const initial = model.getAllElements();
  const relationships = model.getAllRelationships();
  using solid = box(1, 1, 1);
  const wallRequest = { ...DOOR, wallLocalId: wall, kind: 'CURVED_OPENING' };
  const slabRequest = {
    slabLocalId: slab,
    offsetX: 1,
    offsetY: 1,
    sizeX: 2,
    sizeY: 2,
    kind: 'CURVED_OPENING',
  };
  const error = { ok: false, error: { code: 'UNSUPPORTED_OPENING_DEFINITION' } };
  expect(authoring(model).addDoorAndCutWall(wallRequest, { solids: [solid] })).toMatchObject(error);
  expect(authoring(model).addSlabOpening(slabRequest)).toMatchObject(error);
  expect(
    Reflect.apply(model.addAuthoredBody.bind(model), model, [
      { category: 'ZONE', solids: [solid], placement },
    ])
  ).toMatchObject({ ok: false, error: { code: 'BODY_UNSUPPORTED_CATEGORY' } });
  expect(solid.disposed).toBe(false);
  expect(model.getAllElements()).toEqual(initial);
  expect(model.getAllRelationships()).toEqual(relationships);
});

it.each(['DOOR', 'WINDOW'] as const)(
  'places a cut-in %s upright on its translated, rotated host',
  (category) => {
    using model = new BimDocument();
    const wallId = unwrap(
      authoring(model).addWall({
        ...OPENING_WALL,
        length: 6000,
        height: 3000,
        thickness: 200,
        origin: [5000, 3000, 0],
        axisX: [0, 1, 0],
      })
    );
    const spec = { ...DOOR, width: 900, height: 2100, offsetAlongWall: 550, wallLocalId: wallId };
    const id = unwrap(
      category === 'DOOR'
        ? authoring(model).addDoorAndCutWall(spec)
        : authoring(model).addWindowAndCutWall(spec)
    );
    const filler = model.getElement(id);
    if (filler?.placement?.kind !== 'LOCAL_FRAME' || filler.placement.relativeTo === undefined)
      throw new Error('Missing filler placement');
    const opening = model.getElement(filler.placement.relativeTo);
    const wall = model.getElement(wallId);
    if (opening?.placement?.kind !== 'LOCAL_FRAME' || wall?.placement?.kind !== 'LOCAL_FRAME')
      throw new Error('Missing Opening or Wall frame');
    expect(opening.placement.relativeTo).toBe(wallId);
    const b = unwrap(model.bounds(filler.localId, 'WORLD')).bounds;
    const actual = [b.xMin, b.xMax, b.yMin, b.yMax, b.zMin, b.zMax];
    [4800, 4900, 3550, 4450, 0, 2100].forEach((value, i) =>
      expect(actual[i]).toBeCloseTo(value, 4)
    );
  }
);
