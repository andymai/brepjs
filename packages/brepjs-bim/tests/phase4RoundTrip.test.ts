import { describe, it, expect, beforeAll } from 'vitest';
import { measureVolume } from 'brepjs';
import { initOCCT } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { fromIfc } from '../src/import/fromIfc.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

interface BuiltModel {
  readonly model: BimModel;
}

/**
 * Builds a representative model: project/site/building/storey + a wall (with a
 * custom Pset), a slab, a circular column, and a door cut into the wall.
 */
function buildRoundTripModel(): BuiltModel {
  const model = new BimModel();
  const initResult = model.init({ name: 'RoundTrip Project' });
  if (!initResult.ok) throw new Error(initResult.error.message);
  const projectId = initResult.value;
  const siteId = model.addSite({ name: 'Site A' });
  const buildingId = model.addBuilding({ name: 'Building A' });
  const storeyId = model.addStorey({ name: 'Level 1', elevation: 0 });
  model.aggregate(projectId, siteId);
  model.aggregate(siteId, buildingId);
  model.aggregate(buildingId, storeyId);

  const wall = model.addWall({
    length: 5000,
    height: 3000,
    thickness: 200,
    origin: [0, 0, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Concrete',
    isExternal: true,
    customProperties: {
      Pset_Custom: { LoadRating: 42, Tag: 'W-01', Approved: true },
    },
  });
  if (!wall.ok) throw new Error(wall.error.message);
  model.placeIn(wall.value, storeyId);

  const slab = model.addSlab({
    length: 6000,
    width: 4000,
    thickness: 250,
    origin: [0, 0, -250],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    predefinedType: 'FLOOR',
    materialName: 'Concrete',
  });
  if (!slab.ok) throw new Error(slab.error.message);
  model.placeIn(slab.value, storeyId);

  const column = model.addColumn({
    height: 3000,
    profile: { kind: 'CIRCULAR', radius: 150 },
    origin: [4500, 0, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    predefinedType: 'COLUMN',
    materialName: 'Steel',
  });
  if (!column.ok) throw new Error(column.error.message);
  model.placeIn(column.value, storeyId);

  const door = model.addDoor({
    wallLocalId: wall.value,
    width: 900,
    height: 2100,
    offsetAlongWall: 1000,
    offsetFromFloor: 0,
    materialName: 'Wood',
  });
  if (!door.ok) throw new Error(door.error.message);
  model.placeIn(door.value, storeyId);

  return { model };
}

describe('Phase 4 round-trip — fromIfc(toIfc(model))', () => {
  it('reconstructs the spatial tree shape with preserved GlobalIds', async () => {
    const { model } = buildRoundTripModel();
    const bytes = await toIfc(model, META);
    if (!bytes.ok) throw new Error(bytes.error.message);

    const imported = await fromIfc(bytes.value);
    if (!imported.ok) throw new Error(imported.error.message);
    const m = imported.value;

    expect(m.schema).toBe('IFC4');
    const tree = m.spatialTree;
    expect(tree).not.toBeNull();
    expect(tree?.category).toBe('PROJECT');
    expect(tree?.guid).toBe(model.getProject()?.guid);

    const site = tree?.children[0];
    expect(site?.category).toBe('SITE');
    const building = site?.children[0];
    expect(building?.category).toBe('BUILDING');
    const storey = building?.children[0];
    expect(storey?.category).toBe('STOREY');
    expect(storey?.elevationMm).toBe(0);
  });

  it('preserves element count and categories', async () => {
    const { model } = buildRoundTripModel();
    const bytes = await toIfc(model, META);
    if (!bytes.ok) throw new Error(bytes.error.message);

    const imported = await fromIfc(bytes.value);
    if (!imported.ok) throw new Error(imported.error.message);
    const cats = imported.value.elements.map((e) => e.category).sort();

    // wall + slab + column + opening + door = 5 physical elements.
    expect(cats).toContain('WALL');
    expect(cats).toContain('SLAB');
    expect(cats).toContain('COLUMN');
    expect(cats).toContain('DOOR');
    expect(cats).toContain('OPENING');
    expect(imported.value.elements.length).toBe(5);
  });

  it('preserves GlobalIds byte-for-byte', async () => {
    const { model } = buildRoundTripModel();
    const bytes = await toIfc(model, META);
    if (!bytes.ok) throw new Error(bytes.error.message);

    const imported = await fromIfc(bytes.value);
    if (!imported.ok) throw new Error(imported.error.message);

    const wallGuid = model.getWalls()[0]?.guid;
    const slabGuid = model.getSlabs()[0]?.guid;
    const columnGuid = model.getColumns()[0]?.guid;
    const doorGuid = model.getDoors()[0]?.guid;

    const importedWall = imported.value.elements.find((e) => e.category === 'WALL');
    const importedSlab = imported.value.elements.find((e) => e.category === 'SLAB');
    const importedColumn = imported.value.elements.find((e) => e.category === 'COLUMN');
    const importedDoor = imported.value.elements.find((e) => e.category === 'DOOR');

    expect(importedWall?.guid).toBe(wallGuid);
    expect(importedSlab?.guid).toBe(slabGuid);
    expect(importedColumn?.guid).toBe(columnGuid);
    expect(importedDoor?.guid).toBe(doorGuid);
  });

  it('reconstructs the slab solid with PARAMETRIC fidelity and exact volume', async () => {
    const { model } = buildRoundTripModel();
    const bytes = await toIfc(model, META);
    if (!bytes.ok) throw new Error(bytes.error.message);

    const imported = await fromIfc(bytes.value);
    if (!imported.ok) throw new Error(imported.error.message);

    const slab = imported.value.elements.find((e) => e.category === 'SLAB');
    expect(slab?.geometry.fidelity).toBe('PARAMETRIC');
    const solid = slab?.geometry.solid;
    if (solid === null || solid === undefined) throw new Error('slab solid missing');
    const vol = measureVolume(solid);
    if (!vol.ok) throw new Error(vol.error.message);
    // Clean rectangular extrusion, no voids → reconstructs losslessly.
    expect(vol.value).toBeCloseTo(6000 * 4000 * 250, 0);
  });

  it('subtracts the door void from the reconstructed wall (PARAMETRIC)', async () => {
    const { model } = buildRoundTripModel();
    const bytes = await toIfc(model, META);
    if (!bytes.ok) throw new Error(bytes.error.message);

    const imported = await fromIfc(bytes.value);
    if (!imported.ok) throw new Error(imported.error.message);

    const wall = imported.value.elements.find((e) => e.category === 'WALL');
    expect(wall?.geometry.fidelity).toBe('PARAMETRIC');
    const solid = wall?.geometry.solid;
    if (solid === null || solid === undefined) throw new Error('wall solid missing');
    const vol = measureVolume(solid);
    if (!vol.ok) throw new Error(vol.error.message);
    // The full wall body extrusion is 5000×3000×200 = 3e9 mm³; the door void
    // (per IfcRelVoidsElement) removes material, so the reconstructed cut wall
    // must be strictly smaller than the uncut body.
    const uncutBody = 5000 * 3000 * 200;
    expect(vol.value).toBeLessThan(uncutBody);
    expect(vol.value).toBeGreaterThan(uncutBody * 0.8);
  });

  it('reads back Pset values and material', async () => {
    const { model } = buildRoundTripModel();
    const bytes = await toIfc(model, META);
    if (!bytes.ok) throw new Error(bytes.error.message);

    const imported = await fromIfc(bytes.value);
    if (!imported.ok) throw new Error(imported.error.message);

    const wall = imported.value.elements.find((e) => e.category === 'WALL');
    expect(wall?.psets.length).toBeGreaterThan(0);
    const custom = wall?.psets.find((p) => p.name === 'Pset_Custom');
    expect(custom).toBeDefined();
    expect(custom?.properties['LoadRating']).toBe(42);
    expect(custom?.properties['Tag']).toBe('W-01');
    expect(custom?.properties['Approved']).toBe(true);
    // measure-type codes are exposed per property (round-6 fix).
    expect(Object.keys(custom?.measureTypes ?? {}).length).toBeGreaterThan(0);
    expect(wall?.material?.name).toBe('Concrete');
  });

  it('reads back the door→opening void/fill relation', async () => {
    const { model } = buildRoundTripModel();
    const bytes = await toIfc(model, META);
    if (!bytes.ok) throw new Error(bytes.error.message);

    const imported = await fromIfc(bytes.value);
    if (!imported.ok) throw new Error(imported.error.message);

    const wall = imported.value.elements.find((e) => e.category === 'WALL');
    const door = imported.value.elements.find((e) => e.category === 'DOOR');
    const opening = imported.value.elements.find((e) => e.category === 'OPENING');
    expect(wall?.voidedBy.length).toBe(1);
    expect(opening).toBeDefined();
    expect(wall?.voidedBy[0]).toBe(opening?.expressId);
    expect(door?.fills).toBe(opening?.expressId);
  });

  it('produces no error-severity diagnostics for a clean round-trip', async () => {
    const { model } = buildRoundTripModel();
    const bytes = await toIfc(model, META);
    if (!bytes.ok) throw new Error(bytes.error.message);

    const imported = await fromIfc(bytes.value);
    if (!imported.ok) throw new Error(imported.error.message);

    const errors = imported.value.diagnostics.issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('exposes a byExpressId lookup map consistent with the element list', async () => {
    const { model } = buildRoundTripModel();
    const bytes = await toIfc(model, META);
    if (!bytes.ok) throw new Error(bytes.error.message);

    const imported = await fromIfc(bytes.value);
    if (!imported.ok) throw new Error(imported.error.message);
    const m = imported.value;

    expect(m.byExpressId.size).toBe(m.elements.length);
    for (const el of m.elements) {
      expect(m.byExpressId.get(el.expressId)).toBe(el);
    }
  });
});
