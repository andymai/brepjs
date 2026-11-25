import { composeWorldMatrix, readLengthScale } from '../src/import/placement.js';
import { box, unwrap } from 'brepjs';
import { expect, it } from 'vitest';
import { IFCRELCONTAINEDINSPATIALSTRUCTURE } from 'web-ifc';
import {
  BimDocument,
  authoring,
  toIfc,
  toIfcValidated,
  fromIfc,
  disposeImportedModel,
} from '../src/index.js';
import { SpfReader } from '../src/import/spfReader.js';
import { identityPlacement } from '../src/types/placementDefinition.js';
import { OPENING_WALL } from './helpers/openingFixture.js';
const meta = { applicationName: 'Placement test', applicationVersion: '1' };

it('emits W-01 relative to its Opening and contained in Level 2', async () => {
  using doc = new BimDocument();
  const make = authoring(doc);
  const project = unwrap(doc.init({ name: 'P' }));
  const site = unwrap(make.addSite({ name: 'S' }));
  const building = unwrap(make.addBuilding({ name: 'B' }, { placementParent: site }));
  unwrap(doc.aggregate(project, site));
  unwrap(doc.aggregate(site, building));
  const wall = unwrap(
    make.addWall({ ...OPENING_WALL, length: 5000, height: 3000, thickness: 200 })
  );
  const window = unwrap(
    make.addWindowAndCutWall(
      {
        wallLocalId: wall,
        width: 1000,
        height: 1000,
        offsetAlongWall: 200,
        offsetFromFloor: 700,
        materialName: 'glass',
      },
      { stableKey: 'W-01', openingStableKey: 'O-01' }
    )
  );
  // The placement parent is issued after its eventual child.
  const storey = unwrap(
    make.addStorey({ name: 'Level 2', elevation: 3000 }, { placementParent: building })
  );
  unwrap(doc.aggregate(building, storey));
  unwrap(doc.reparent(wall, storey, 'KEEP_LOCAL'));
  unwrap(doc.placeIn(wall, storey));
  unwrap(doc.placeIn(window, storey));
  const opening = unwrap(doc.lookupKey('O-01'));
  for (const bytes of [
    unwrap(await toIfc(doc, meta)),
    unwrap(await toIfcValidated(doc, meta)).bytes,
  ]) {
    using reader = unwrap(await SpfReader.create(bytes));
    const entity = (ref: typeof window) => {
      const id = reader.expressIdFromGuid(unwrap(doc.record(ref)).guid);
      if (id === undefined) throw Error('Missing IFC product');
      return id;
    };
    const position = (ref: typeof window) => {
      const product = reader.getLine<{ ObjectPlacement: { value: number } }>(entity(ref));
      if (!product) throw Error('Missing IFC entity');
      return product.ObjectPlacement.value;
    };
    const parent = (id: number) =>
      reader.getLine<{ PlacementRelTo: { value: number } | null }>(id)?.PlacementRelTo?.value;
    expect(parent(position(window))).toBe(position(opening));
    expect(parent(position(opening))).toBe(position(wall));
    expect(parent(position(wall))).toBe(position(storey));
    expect(parent(position(site))).toBeUndefined();
    const homes = reader
      .getLinesOfType(IFCRELCONTAINEDINSPATIALSTRUCTURE)
      .map((id) =>
        reader.getLine<{
          RelatingStructure: { value: number };
          RelatedElements: { value: number }[];
        }>(id)
      )
      .filter((rel) => rel?.RelatedElements.some((r) => r.value === entity(window)));
    expect(homes.map((r) => r?.RelatingStructure.value)).toEqual([entity(storey)]);
    // World origin from the independent reader, in millimetres.
    const positionMm = composeWorldMatrix(reader, position(window), readLengthScale(reader));
    expect(positionMm?.[14]).toBeCloseTo(4200, 4);
  }
});

it('rejects an uncontained Wall and preserves its data for a valid retry', async () => {
  using doc = new BimDocument();
  unwrap(doc.init({ name: 'P' }));
  const wall = unwrap(
    doc.addAuthoredBody({ category: 'WALL', placement: identityPlacement, solids: [box(1, 2, 3)] })
  );
  for (const deliver of [toIfc, toIfcValidated])
    expect(await deliver(doc, meta)).toMatchObject({
      ok: false,
      error: { code: 'INTEGRITY_FAILURE' },
    });
  const storey = unwrap(authoring(doc).addStorey({ name: 'L', elevation: 0 }));
  unwrap(doc.placeIn(wall, storey));
  expect((await toIfc(doc, meta)).ok).toBe(true);
  expect(unwrap(doc.materialVolume(wall))).toBeCloseTo(6);
});

it('names unrepresentable placement and containment endpoints on both delivery paths', async () => {
  using doc = new BimDocument();
  const a = authoring(doc);
  unwrap(doc.init({ name: 'P' }));
  const floor = unwrap(a.addStorey({ name: 'L', elevation: 0 }));
  const beam = unwrap(
    a.addBeam({
      materialName: 'Steel',
      length: 600,
      profile: { kind: 'RECTANGULAR', width: 20, height: 30 },
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
    })
  );
  unwrap(doc.placeIn(beam, floor));
  const unsupported = unwrap(
    doc.addAuthoredBody({ category: 'SIGN', placement: identityPlacement, solids: [box(1, 1, 1)] })
  );
  unwrap(doc.reparent(beam, unsupported, 'KEEP_LOCAL'));
  for (const deliver of [toIfc, toIfcValidated])
    expect(await deliver(doc, meta)).toMatchObject({
      ok: false,
      error: {
        code: 'IFC_UNREPRESENTABLE_PLACEMENT_PARENT',
        metadata: { record: beam, parent: unsupported },
      },
    });
  unwrap(doc.reparent(beam, 'WORLD', 'KEEP_LOCAL'));
  unwrap(doc.delete(unsupported));
  const bridge = unwrap(a.addBridge({ name: 'Bridge' }));
  unwrap(doc.assignContainer(beam, bridge));
  for (const deliver of [toIfc, toIfcValidated])
    expect(await deliver(doc, meta)).toMatchObject({
      ok: false,
      error: { code: 'IFC4X3_REQUIRED', metadata: { container: bridge, children: [beam] } },
    });
});

it('keeps a moved swept beam World-rooted when its rotated container moves', async () => {
  using doc = new BimDocument();
  const commands = authoring(doc);
  unwrap(doc.init({ name: 'P' }));
  const level = unwrap(commands.addStorey({ name: 'L', elevation: 3000 }));
  const beam = unwrap(
    commands.addBeam({
      materialName: 'steel',
      length: 600,
      profile: { kind: 'RECTANGULAR', width: 20, height: 30 },
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
    })
  );
  unwrap(doc.placeIn(beam, level));
  unwrap(doc.move(level, { origin: [4, 8, 7000], axisX: [0, 1, 0], axisZ: [0, 0, 1] }));
  unwrap(doc.move(beam, { origin: [100, 200, 300], axisX: [0, 1, 0], axisZ: [0, 0, 1] }));
  const bytes = unwrap(await toIfc(doc, meta));
  using reader = unwrap(await SpfReader.create(bytes));
  const id = reader.expressIdFromGuid(unwrap(doc.record(beam)).guid);
  if (id === undefined) throw Error('No beam');
  const plc = reader.getLine<{ ObjectPlacement: { value: number } }>(id)?.ObjectPlacement.value;
  if (plc === undefined) throw Error('No beam placement');
  expect(reader.getLine<{ PlacementRelTo: null }>(plc)?.PlacementRelTo).toBeNull();
  expect(composeWorldMatrix(reader, plc, readLengthScale(reader))?.slice(12, 15)).toEqual([
    100, 200, 300,
  ]);
  const imported = unwrap(await fromIfc(bytes));
  try {
    const record = imported.elements.find((x) => x.guid === unwrap(doc.record(beam)).guid);
    expect(record?.geometry.fidelity).toBe('PARAMETRIC');
    expect(record?.geometry.bounds?.yMin).toBeCloseTo(200, 3);
    expect(record?.geometry.bounds?.yMax).toBeCloseTo(800, 3);
  } finally {
    disposeImportedModel(imported);
  }
});

it('rejects a concurrent edit while the IFC writer initializes', async () => {
  using doc = new BimDocument();
  unwrap(doc.init({ name: 'Initial' }));
  const pending = toIfc(doc, meta);
  unwrap(authoring(doc).addStorey({ name: 'Later', elevation: 50 }));
  expect(await pending).toMatchObject({
    ok: false,
    error: { code: 'DOCUMENT_CHANGED_DURING_EXPORT' },
  });
});
