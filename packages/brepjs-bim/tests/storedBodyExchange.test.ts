import { box, clone, translate, unwrap } from 'brepjs';
import { beforeAll, expect, it } from 'vitest';
import { initKernel } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { fromIfc } from '../src/import/fromIfc.js';
import { disposeImportedModel } from '../src/import/importedModel.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const meta = {
  applicationName: 'Exchange test',
  applicationVersion: '1',
  ifcSchema: 'IFC4X3',
} as const;
const frame = { origin: [100, 200, 300], axisX: [1, 0, 0], axisZ: [0, 0, 1] } as const;

it.each([
  'SLAB',
  'ROOF',
  'SPACE',
  'COVERING',
  'BEAM',
  'COLUMN',
  'FOOTING',
  'PILE',
  'PROXY',
  'EARTHWORKS_FILL',
] as const)('reloads both authored %s items at the retained placement', async (category) => {
  using model = new BimModel();
  unwrap(model.init({ name: 'Round trip' }));
  const solid = box(10, 10, 10);
  const id = unwrap(
    model.addAuthoredBody({
      category,
      placement: { kind: 'LOCAL_FRAME', frame },
      solids: [solid, translate(solid, [5, 0, 0])],
    })
  );
  const bytes = unwrap(await toIfc(model, meta));
  const imported = unwrap(await fromIfc(bytes));
  try {
    const actual = imported.elements.find((e) => e.guid === model.getElement(id)?.guid);
    expect(actual?.category).toBe(category);
    expect(actual?.geometry.solids).toHaveLength(2);
    expect(actual?.geometry.volumeMm3).toBeCloseTo(1500, 2);
    expect(actual?.geometry.bounds?.xMin).toBeCloseTo(100, 4);
    expect(actual?.geometry.bounds?.xMax).toBeCloseTo(115, 4);
  } finally {
    disposeImportedModel(imported);
  }
});

it('invalidates slab swept geometry for coincident and repartitioned replacements', async () => {
  using model = new BimModel();
  unwrap(model.init({ name: 'Encoding' }));
  const id = unwrap(
    model.addSlab({
      length: 10,
      width: 10,
      thickness: 10,
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      predefinedType: 'FLOOR',
      materialName: 'Stone',
    })
  );
  const saved = async () => new TextDecoder().decode(unwrap(await toIfc(model, meta)));
  expect(await saved()).toContain('IFCEXTRUDEDAREASOLID(');
  const slab = model.getSlabs()[0];
  if (!slab) throw new Error('Missing slab');
  unwrap(
    model.replaceProductBody({
      localId: id,
      body: { kind: 'AUTHORITATIVE', solids: [unwrap(clone(slab.geometry.solids[0]))] },
    })
  );
  const coincident = await saved();
  expect(coincident).not.toContain('IFCEXTRUDEDAREASOLID(');
  expect(coincident.match(/IFCTRIANGULATEDFACESET\(/g)).toHaveLength(1);
  const half = box(5, 10, 10);
  unwrap(
    model.replaceProductBody({
      localId: id,
      body: { kind: 'AUTHORITATIVE', solids: [half, translate(half, [5, 0, 0])] },
    })
  );
  const divided = await saved();
  expect(divided.match(/IFCTRIANGULATEDFACESET\(/g)).toHaveLength(2);
  const imported = unwrap(await fromIfc(new TextEncoder().encode(divided)));
  try {
    const element = imported.elements.find((e) => e.guid === slab.guid);
    expect(element?.geometry.solids).toHaveLength(2);
    expect(element?.geometry.volumeMm3).toBeCloseTo(1000, 3);
  } finally {
    disposeImportedModel(imported);
  }
});
