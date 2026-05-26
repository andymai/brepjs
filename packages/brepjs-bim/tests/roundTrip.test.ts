import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import * as WebIFC from 'web-ifc';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';

beforeAll(async () => { await initOCCT(); }, 30000);

describe('IFC round-trip (M1)', () => {
  async function buildModel(): Promise<BimModel> {
    const model = new BimModel();
    const initResult = model.init({ name: 'Test Project' });
    if (!initResult.ok) throw new Error(initResult.error.message);
    const projectLocalId = initResult.value;
    const siteLocalId = model.addSite({ name: 'Test Site' });
    const buildingLocalId = model.addBuilding({ name: 'Test Building' });
    const storeyLocalId = model.addStorey({ name: 'Ground Floor', elevation: 0 });
    model.aggregate(projectLocalId, siteLocalId);
    model.aggregate(siteLocalId, buildingLocalId);
    model.aggregate(buildingLocalId, storeyLocalId);
    const wallResult = model.addWall({
      length: 5000,
      height: 3000,
      thickness: 250,
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Concrete',
    });
    if (!wallResult.ok) throw new Error(wallResult.error.message);
    model.placeIn(wallResult.value, storeyLocalId);
    return model;
  }

  it('toIfc produces non-empty bytes', async () => {
    const model = await buildModel();
    const result = await toIfc(model, { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.byteLength).toBeGreaterThan(0);
  });

  it('exported bytes parse back with web-ifc', async () => {
    const model = await buildModel();
    const result = await toIfc(model, { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' });
    if (!result.ok) throw new Error(result.error.message);

    const api = new WebIFC.IfcAPI();
    await api.Init();
    const modelId = api.OpenModel(result.value);

    const walls = api.GetLineIDsWithType(modelId, WebIFC.IFCWALL);
    expect(walls.size()).toBe(1);

    const storeys = api.GetLineIDsWithType(modelId, WebIFC.IFCBUILDINGSTOREY);
    expect(storeys.size()).toBe(1);

    const projects = api.GetLineIDsWithType(modelId, WebIFC.IFCPROJECT);
    expect(projects.size()).toBe(1);

    const wallExpressId = walls.get(0);
    if (wallExpressId === undefined) throw new Error('Expected at least one wall express ID');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- web-ifc GetLine returns any
    const wall = api.GetLine(modelId, wallExpressId);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- web-ifc GetLine returns any
    const wallGlobalId = wall.GlobalId?.value as string | undefined;
    const bimWalls = model.getWalls();
    expect(bimWalls).toHaveLength(1);
    expect(wallGlobalId).toBe(bimWalls[0]?.guid);

    api.CloseModel(modelId);
  });

  it('exported IFC contains IfcRelContainedInSpatialStructure', async () => {
    const model = await buildModel();
    const result = await toIfc(model, { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' });
    if (!result.ok) throw new Error(result.error.message);

    const api = new WebIFC.IfcAPI();
    await api.Init();
    const modelId = api.OpenModel(result.value);

    const containedRels = api.GetLineIDsWithType(modelId, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    expect(containedRels.size()).toBeGreaterThanOrEqual(1);

    api.CloseModel(modelId);
  });
});
