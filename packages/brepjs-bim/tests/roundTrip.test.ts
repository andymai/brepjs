import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import * as WebIFC from 'web-ifc';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';

beforeAll(async () => { await initOCCT(); }, 30000);

describe('IFC round-trip (M1)', () => {
  function buildModel(): BimModel {
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
    const model = buildModel();
    const result = await toIfc(model, { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.byteLength).toBeGreaterThan(0);
  });

  it('exported bytes parse back with web-ifc', async () => {
    const model = buildModel();
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
    const model = buildModel();
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

describe('IFC Pset/Qto round-trip (M2)', () => {
  const PSET_SPEC = {
    length: 4000,
    height: 3000,
    thickness: 300,
    origin: [0, 0, 0] as [number, number, number],
    axisX: [1, 0, 0] as [number, number, number],
    axisZ: [0, 0, 1] as [number, number, number],
    materialName: 'Concrete',
    isExternal: true,
    fireRating: 'REI90',
    thermalTransmittance: 0.3,
    loadBearing: true,
    manufacturerName: 'Wienerberger',
    customProperties: {
      'Pset_Acoustic': { SoundReductionIndex: 45 },
    },
  };

  async function buildPsetModel(): Promise<{ bytes: Uint8Array; api: WebIFC.IfcAPI; mid: number }> {
    const model = new BimModel();
    const initResult = model.init({ name: 'Pset Test' });
    if (!initResult.ok) throw new Error(initResult.error.message);
    const projectLocalId = initResult.value;
    const siteId = model.addSite({ name: 'S' });
    const buildingId = model.addBuilding({ name: 'B' });
    const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
    model.aggregate(projectLocalId, siteId);
    model.aggregate(siteId, buildingId);
    model.aggregate(buildingId, storeyId);
    const wallResult = model.addWall(PSET_SPEC);
    if (!wallResult.ok) throw new Error(wallResult.error.message);
    model.placeIn(wallResult.value, storeyId);

    const result = await toIfc(model, { applicationName: 'brepjs-bim-test', applicationVersion: '0.0.0' });
    if (!result.ok) throw new Error(result.error.message);

    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(result.value);
    return { bytes: result.value, api, mid };
  }

  it('emits at least one IfcPropertySet', async () => {
    const { api, mid } = await buildPsetModel();
    const ids = api.GetLineIDsWithType(mid, WebIFC.IFCPROPERTYSET);
    expect(ids.size()).toBeGreaterThan(0);
    api.CloseModel(mid);
  });

  it('emits Pset_WallCommon', async () => {
    const { api, mid } = await buildPsetModel();
    const ids = api.GetLineIDsWithType(mid, WebIFC.IFCPROPERTYSET);
    let found = false;
    for (let i = 0; i < ids.size(); i++) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- web-ifc GetLine returns any
      const pset = api.GetLine(mid, ids.get(i));
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- web-ifc GetLine returns any
      if ((pset.Name?.value as string | undefined) === 'Pset_WallCommon') {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    api.CloseModel(mid);
  });

  it('emits Pset_ManufacturerTypeInformation', async () => {
    const { api, mid } = await buildPsetModel();
    const ids = api.GetLineIDsWithType(mid, WebIFC.IFCPROPERTYSET);
    let found = false;
    for (let i = 0; i < ids.size(); i++) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- web-ifc GetLine returns any
      const pset = api.GetLine(mid, ids.get(i));
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- web-ifc GetLine returns any
      if ((pset.Name?.value as string | undefined) === 'Pset_ManufacturerTypeInformation') {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    api.CloseModel(mid);
  });

  it('emits custom Pset_Acoustic', async () => {
    const { api, mid } = await buildPsetModel();
    const ids = api.GetLineIDsWithType(mid, WebIFC.IFCPROPERTYSET);
    let found = false;
    for (let i = 0; i < ids.size(); i++) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- web-ifc GetLine returns any
      const pset = api.GetLine(mid, ids.get(i));
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- web-ifc GetLine returns any
      if ((pset.Name?.value as string | undefined) === 'Pset_Acoustic') {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    api.CloseModel(mid);
  });

  it('emits Qto_WallBaseQuantities', async () => {
    const { api, mid } = await buildPsetModel();
    const ids = api.GetLineIDsWithType(mid, WebIFC.IFCELEMENTQUANTITY);
    let found = false;
    for (let i = 0; i < ids.size(); i++) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- web-ifc GetLine returns any
      const qto = api.GetLine(mid, ids.get(i));
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- web-ifc GetLine returns any
      if ((qto.Name?.value as string | undefined) === 'Qto_WallBaseQuantities') {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    api.CloseModel(mid);
  });

  it('emits IfcRelDefinesByProperties linking wall to Psets', async () => {
    const { api, mid } = await buildPsetModel();
    const ids = api.GetLineIDsWithType(mid, WebIFC.IFCRELDEFINESBYPROPERTIES);
    expect(ids.size()).toBeGreaterThan(0);
    api.CloseModel(mid);
  });

  it('wall without Pset fields emits no IfcPropertySet but always emits Qto', async () => {
    const model = new BimModel();
    const initResult = model.init({ name: 'No-Pset Test' });
    if (!initResult.ok) throw new Error(initResult.error.message);
    const projectLocalId = initResult.value;
    const siteId = model.addSite({ name: 'S' });
    const buildingId = model.addBuilding({ name: 'B' });
    const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
    model.aggregate(projectLocalId, siteId);
    model.aggregate(siteId, buildingId);
    model.aggregate(buildingId, storeyId);
    const wallResult = model.addWall({
      length: 3000, height: 2700, thickness: 200,
      origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
      materialName: 'Concrete',
    });
    if (!wallResult.ok) throw new Error(wallResult.error.message);
    model.placeIn(wallResult.value, storeyId);

    const result = await toIfc(model, { applicationName: 'test', applicationVersion: '0' });
    if (!result.ok) throw new Error(result.error.message);

    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(result.value);

    const psetIds = api.GetLineIDsWithType(mid, WebIFC.IFCPROPERTYSET);
    expect(psetIds.size()).toBe(0);

    const qtoIds = api.GetLineIDsWithType(mid, WebIFC.IFCELEMENTQUANTITY);
    expect(qtoIds.size()).toBe(1);

    api.CloseModel(mid);
  });
});

describe('IFC Opening round-trip (M3)', () => {
  async function buildOpeningModel(): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
    const model = new BimModel();
    const initResult = model.init({ name: 'Opening Test' });
    if (!initResult.ok) throw new Error(initResult.error.message);
    const projectLocalId = initResult.value;
    const siteId = model.addSite({ name: 'S' });
    const buildingId = model.addBuilding({ name: 'B' });
    const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
    model.aggregate(projectLocalId, siteId);
    model.aggregate(siteId, buildingId);
    model.aggregate(buildingId, storeyId);
    const wallResult = model.addWall({
      length: 5000, height: 3000, thickness: 250,
      origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
      materialName: 'Concrete',
    });
    if (!wallResult.ok) throw new Error(wallResult.error.message);
    model.placeIn(wallResult.value, storeyId);

    const doorResult = model.addDoor({
      width: 900, height: 2100, offsetAlongWall: 500, offsetFromFloor: 0,
      wallLocalId: wallResult.value, materialName: 'Wood',
      isExternal: false, fireRating: 'EI30',
    });
    if (!doorResult.ok) throw new Error(doorResult.error.message);

    const windowResult = model.addWindow({
      width: 1200, height: 1400, offsetAlongWall: 2000, offsetFromFloor: 900,
      wallLocalId: wallResult.value, materialName: 'Aluminum',
      isExternal: true, thermalTransmittance: 1.2,
    });
    if (!windowResult.ok) throw new Error(windowResult.error.message);

    const result = await toIfc(model, { applicationName: 'brepjs-bim-test', applicationVersion: '0.0.0' });
    if (!result.ok) throw new Error(result.error.message);

    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(result.value);
    return { api, mid };
  }

  it('emits two IfcOpeningElements', async () => {
    const { api, mid } = await buildOpeningModel();
    const openings = api.GetLineIDsWithType(mid, WebIFC.IFCOPENINGELEMENT);
    expect(openings.size()).toBe(2);
    api.CloseModel(mid);
  });

  it('emits one IfcDoor', async () => {
    const { api, mid } = await buildOpeningModel();
    const doors = api.GetLineIDsWithType(mid, WebIFC.IFCDOOR);
    expect(doors.size()).toBe(1);
    api.CloseModel(mid);
  });

  it('emits one IfcWindow', async () => {
    const { api, mid } = await buildOpeningModel();
    const windows = api.GetLineIDsWithType(mid, WebIFC.IFCWINDOW);
    expect(windows.size()).toBe(1);
    api.CloseModel(mid);
  });

  it('emits two IfcRelVoidsElement', async () => {
    const { api, mid } = await buildOpeningModel();
    const voids = api.GetLineIDsWithType(mid, WebIFC.IFCRELVOIDSELEMENT);
    expect(voids.size()).toBe(2);
    api.CloseModel(mid);
  });

  it('emits two IfcRelFillsElement', async () => {
    const { api, mid } = await buildOpeningModel();
    const fills = api.GetLineIDsWithType(mid, WebIFC.IFCRELFILLSELEMENT);
    expect(fills.size()).toBe(2);
    api.CloseModel(mid);
  });

  it('emits Pset_DoorCommon', async () => {
    const { api, mid } = await buildOpeningModel();
    const ids = api.GetLineIDsWithType(mid, WebIFC.IFCPROPERTYSET);
    let found = false;
    for (let i = 0; i < ids.size(); i++) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- web-ifc GetLine returns any
      const pset = api.GetLine(mid, ids.get(i));
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- web-ifc GetLine returns any
      if ((pset.Name?.value as string | undefined) === 'Pset_DoorCommon') { found = true; break; }
    }
    expect(found).toBe(true);
    api.CloseModel(mid);
  });

  it('emits Pset_WindowCommon', async () => {
    const { api, mid } = await buildOpeningModel();
    const ids = api.GetLineIDsWithType(mid, WebIFC.IFCPROPERTYSET);
    let found = false;
    for (let i = 0; i < ids.size(); i++) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- web-ifc GetLine returns any
      const pset = api.GetLine(mid, ids.get(i));
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- web-ifc GetLine returns any
      if ((pset.Name?.value as string | undefined) === 'Pset_WindowCommon') { found = true; break; }
    }
    expect(found).toBe(true);
    api.CloseModel(mid);
  });

  it('door GlobalId matches BimModel door GUID', async () => {
    const model = new BimModel();
    const initResult = model.init({ name: 'GUID Test' });
    if (!initResult.ok) throw new Error(initResult.error.message);
    const siteId = model.addSite({ name: 'S' });
    const buildingId = model.addBuilding({ name: 'B' });
    const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
    model.aggregate(initResult.value, siteId);
    model.aggregate(siteId, buildingId);
    model.aggregate(buildingId, storeyId);
    const wallResult = model.addWall({
      length: 5000, height: 3000, thickness: 250,
      origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1], materialName: 'Concrete',
    });
    if (!wallResult.ok) throw new Error(wallResult.error.message);
    const doorResult = model.addDoor({
      width: 900, height: 2100, offsetAlongWall: 500, offsetFromFloor: 0,
      wallLocalId: wallResult.value, materialName: 'Wood',
    });
    if (!doorResult.ok) throw new Error(doorResult.error.message);

    const result = await toIfc(model, { applicationName: 'test', applicationVersion: '0' });
    if (!result.ok) throw new Error(result.error.message);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(result.value);
    const doorIds = api.GetLineIDsWithType(mid, WebIFC.IFCDOOR);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- web-ifc GetLine returns any
    const door = api.GetLine(mid, doorIds.get(0));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- web-ifc GetLine returns any
    const doorGuid = door.GlobalId?.value as string | undefined;
    const bimDoors = model.getDoors();
    expect(bimDoors).toHaveLength(1);
    expect(doorGuid).toBe(bimDoors[0]?.guid);
    api.CloseModel(mid);
  });
});
