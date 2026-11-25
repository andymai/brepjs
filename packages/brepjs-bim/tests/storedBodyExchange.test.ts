import { authoring } from '../src/model/authoring.js';
import {addDeliveryStorey} from './helpers/deliveryStorey.js';
import { box, clone, translate, unwrap } from 'brepjs';
import { beforeAll, expect, it } from 'vitest';
import { initKernel } from '../../../tests/setup.js';
import { BimDocument } from '../src/model/bimDocument.js';
import type { ColumnSpec } from '../src/specs/columnSpec.js';
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
  using model = new BimDocument();
  unwrap(model.init({ name: 'Round trip' }));
  const solid = box(10, 10, 10);
  const id = unwrap(
    model.addAuthoredBody({
      category,
      placement: { kind: 'LOCAL_FRAME', frame },
      solids: [solid, translate(solid, [5, 0, 0])],
    })
  );
  addDeliveryStorey(model,id);
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

it('writes the swept volume until a beam, column, or pile receives a replacement Body', async () => {
  using model = new BimDocument();
  unwrap(model.init({ name: 'Swept quantities' }));
  const section = {
    profile: { kind: 'CIRCULAR', radius: 30 },
    materialName: 'Steel',
    origin: [0, 0, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
  } satisfies Omit<ColumnSpec, 'height'>;
  const ids = [
    unwrap(authoring(model).addBeam({ ...section, length: 600 })),
    unwrap(authoring(model).addColumn({ ...section, height: 600 })),
    unwrap(authoring(model).addPile({ ...section, length: 600 })),
  ];

  addDeliveryStorey(model,...ids);
  async function expectNetVolume(volumeM3: number) {
    const imported = unwrap(await fromIfc(unwrap(await toIfc(model, meta))));
    try {
      for (const id of ids) {
        const element = imported.elements.find((item) => item.guid === model.getElement(id)?.guid);
        const qto = element?.psets.find(({ name }) => name.endsWith('BaseQuantities'));
        expect(qto?.properties['NetVolume'], element?.category).toBeCloseTo(volumeM3, 12);
      }
    } finally {
      disposeImportedModel(imported);
    }
  }

  await expectNetVolume((Math.PI * 30 ** 2 * 600) / 1e9);
  for (const id of ids) {
    const cube = box(10, 10, 10);
    unwrap(
      model.replaceBody({
        localId: id,
        body: { kind: 'AUTHORITATIVE', solids: [cube, translate(cube, [5, 0, 0])] },
      })
    );
  }
  await expectNetVolume(1500 / 1e9);
});

it('invalidates slab swept geometry for coincident and repartitioned replacements', async () => {
  using model = new BimDocument();
  unwrap(model.init({ name: 'Encoding' }));
  const id = unwrap(
    authoring(model).addSlab({
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
  addDeliveryStorey(model,id);
  const saved = async () => new TextDecoder().decode(unwrap(await toIfc(model, meta)));
  expect(await saved()).toContain('IFCEXTRUDEDAREASOLID(');
  const slab = model.getSlabs()[0];
  if (!slab) throw new Error('Missing slab');
  unwrap(
    model.replaceBody({
      localId: id,
      body: { kind: 'AUTHORITATIVE', solids: [unwrap(clone(slab.geometry.solids[0]))] },
    })
  );
  const coincident = await saved();
  expect(coincident).not.toContain('IFCEXTRUDEDAREASOLID(');
  expect(coincident.match(/IFCTRIANGULATEDFACESET\(/g)).toHaveLength(1);
  const half = box(5, 10, 10);
  unwrap(
    model.replaceBody({
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
