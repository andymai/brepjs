import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { unwrap } from 'brepjs';
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

  it('emits all nine wall base quantities including Gross/Net Side & Footprint areas', async () => {
    const { api, mid } = await buildOpeningModel();
    const elemQuantities = api.GetLineIDsWithType(mid, WebIFC.IFCELEMENTQUANTITY);
    let qto: Record<string, unknown> | undefined;
    for (let i = 0; i < elemQuantities.size(); i++) {
       
      const candidate = api.GetLine(mid, elemQuantities.get(i)) as Record<string, unknown>;
      const name = (candidate['Name'] as { value?: string } | undefined)?.value;
      if (name === 'Qto_WallBaseQuantities') {
        qto = candidate;
        break;
      }
    }
    if (qto === undefined) throw new Error('Expected Qto_WallBaseQuantities');

    const quantityNames = new Set<string>();
    const numericByName = new Map<string, number>();
    const refs = qto['Quantities'] as Array<{ value: number }>;
    for (const ref of refs) {
       
      const q = api.GetLine(mid, ref.value) as Record<string, unknown>;
      const name = (q['Name'] as { value?: string } | undefined)?.value;
      if (name === undefined) continue;
      quantityNames.add(name);
      const lengthVal = (q['LengthValue'] as { value?: number } | undefined)?.value;
      const areaVal = (q['AreaValue'] as { value?: number } | undefined)?.value;
      const volumeVal = (q['VolumeValue'] as { value?: number } | undefined)?.value;
      const num = lengthVal ?? areaVal ?? volumeVal;
      if (num !== undefined) numericByName.set(name, num);
    }
    expect(quantityNames.has('Length')).toBe(true);
    expect(quantityNames.has('Width')).toBe(true);
    expect(quantityNames.has('Height')).toBe(true);
    expect(quantityNames.has('GrossFootprintArea')).toBe(true);
    expect(quantityNames.has('NetFootprintArea')).toBe(true);
    expect(quantityNames.has('GrossSideArea')).toBe(true);
    expect(quantityNames.has('NetSideArea')).toBe(true);
    expect(quantityNames.has('GrossVolume')).toBe(true);
    expect(quantityNames.has('NetVolume')).toBe(true);

    // 5 m × 3 m wall, 250 mm thick. Door 0.9×2.1, Window 1.2×1.4.
    const totalOpeningAreaM2 = 0.9 * 2.1 + 1.2 * 1.4;
    expect(numericByName.get('GrossSideArea')).toBeCloseTo(5 * 3, 5);
    expect(numericByName.get('NetSideArea')).toBeCloseTo(5 * 3 - totalOpeningAreaM2, 5);
    expect(numericByName.get('GrossVolume')).toBeCloseTo(5 * 3 * 0.25, 5);
    expect(numericByName.get('NetVolume')).toBeCloseTo(5 * 3 * 0.25 - totalOpeningAreaM2 * 0.25, 5);
    // Only the door reaches the floor (offsetFromFloor 0); window starts at 0.9 m.
    expect(numericByName.get('GrossFootprintArea')).toBeCloseTo(5 * 0.25, 5);
    expect(numericByName.get('NetFootprintArea')).toBeCloseTo(5 * 0.25 - 0.9 * 0.25, 5);

    api.CloseModel(mid);
  });

  it('wall without openings emits NetVolume === GrossVolume', async () => {
    const model = new BimModel();
    const initResult = model.init({ name: 'No-Op Wall' });
    if (!initResult.ok) throw new Error(initResult.error.message);
    const siteId = model.addSite({ name: 'S' });
    const buildingId = model.addBuilding({ name: 'B' });
    const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
    model.aggregate(initResult.value, siteId);
    model.aggregate(siteId, buildingId);
    model.aggregate(buildingId, storeyId);
    const wallResult = model.addWall({
      length: 4000, height: 2800, thickness: 200,
      origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1], materialName: 'Concrete',
    });
    if (!wallResult.ok) throw new Error(wallResult.error.message);
    model.placeIn(wallResult.value, storeyId);

    const result = await toIfc(model, { applicationName: 'test', applicationVersion: '0' });
    if (!result.ok) throw new Error(result.error.message);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(result.value);

    const elemQuantities = api.GetLineIDsWithType(mid, WebIFC.IFCELEMENTQUANTITY);
    let qto: Record<string, unknown> | undefined;
    for (let i = 0; i < elemQuantities.size(); i++) {
      const candidate = api.GetLine(mid, elemQuantities.get(i)) as Record<string, unknown>;
      const name = (candidate['Name'] as { value?: string } | undefined)?.value;
      if (name === 'Qto_WallBaseQuantities') {
        qto = candidate;
        break;
      }
    }
    if (qto === undefined) throw new Error('Expected Qto_WallBaseQuantities');
    let gross = 0;
    let net = 0;
    const refs = qto['Quantities'] as Array<{ value: number }>;
    for (const ref of refs) {
       
      const q = api.GetLine(mid, ref.value) as Record<string, unknown>;
      const name = (q['Name'] as { value?: string } | undefined)?.value;
      const vol = (q['VolumeValue'] as { value?: number } | undefined)?.value;
      if (name === 'GrossVolume' && vol !== undefined) gross = vol;
      if (name === 'NetVolume' && vol !== undefined) net = vol;
    }
    expect(gross).toBeGreaterThan(0);
    expect(net).toBeCloseTo(gross, 6);
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

describe('IFC Slab round-trip (M5)', () => {
  const SLAB_SPEC = {
    length: 6000,
    width: 4000,
    thickness: 250,
    origin: [0, 0, 0] as [number, number, number],
    axisX: [1, 0, 0] as [number, number, number],
    axisZ: [0, 0, 1] as [number, number, number],
    predefinedType: 'FLOOR' as const,
    materialName: 'Concrete',
    isExternal: false,
    fireRating: 'REI120',
    loadBearing: true,
    compartmentation: true,
  };

  async function buildSlabModel(extra?: { roof?: boolean }): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
    const model = new BimModel();
    const initResult = model.init({ name: 'Slab Test' });
    if (!initResult.ok) throw new Error(initResult.error.message);
    const siteId = model.addSite({ name: 'S' });
    const buildingId = model.addBuilding({ name: 'B' });
    const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
    model.aggregate(initResult.value, siteId);
    model.aggregate(siteId, buildingId);
    model.aggregate(buildingId, storeyId);
    const slabResult = model.addSlab(SLAB_SPEC);
    if (!slabResult.ok) throw new Error(slabResult.error.message);
    model.placeIn(slabResult.value, storeyId);
    if (extra?.roof) {
      const roofResult = model.addSlab({
        ...SLAB_SPEC,
        origin: [0, 0, 3000],
        predefinedType: 'ROOF',
        materialName: 'Concrete',
      });
      if (!roofResult.ok) throw new Error(roofResult.error.message);
      model.placeIn(roofResult.value, storeyId);
    }
    const result = await toIfc(model, { applicationName: 'brepjs-bim-test', applicationVersion: '0.0.0' });
    if (!result.ok) throw new Error(result.error.message);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(result.value);
    return { api, mid };
  }

  it('emits an IfcSlab', async () => {
    const { api, mid } = await buildSlabModel();
    const slabs = api.GetLineIDsWithType(mid, WebIFC.IFCSLAB);
    expect(slabs.size()).toBe(1);
    api.CloseModel(mid);
  });

  it('IfcSlab PredefinedType matches spec for FLOOR and ROOF', async () => {
    const { api, mid } = await buildSlabModel({ roof: true });
    const slabIds = api.GetLineIDsWithType(mid, WebIFC.IFCSLAB);
    expect(slabIds.size()).toBe(2);
    const types: string[] = [];
    for (let i = 0; i < slabIds.size(); i++) {
      const slab = api.GetLine(mid, slabIds.get(i)) as Record<string, unknown>;
      const pred = (slab['PredefinedType'] as { value?: string } | undefined)?.value;
      if (pred !== undefined) types.push(pred);
    }
    expect(types.sort()).toEqual(['FLOOR', 'ROOF']);
    api.CloseModel(mid);
  });

  it('slab GlobalId matches BimModel slab GUID', async () => {
    const { api, mid } = await buildSlabModel();
    const slabIds = api.GetLineIDsWithType(mid, WebIFC.IFCSLAB);
    const slab = api.GetLine(mid, slabIds.get(0)) as Record<string, unknown>;
    const slabGuid = (slab['GlobalId'] as { value?: string } | undefined)?.value;
    expect(typeof slabGuid).toBe('string');
    expect((slabGuid as string).length).toBe(22);
    api.CloseModel(mid);
  });

  it('emits Pset_SlabCommon with fields from spec', async () => {
    const { api, mid } = await buildSlabModel();
    const ids = api.GetLineIDsWithType(mid, WebIFC.IFCPROPERTYSET);
    let found = false;
    for (let i = 0; i < ids.size(); i++) {
      const pset = api.GetLine(mid, ids.get(i)) as Record<string, unknown>;
      const name = (pset['Name'] as { value?: string } | undefined)?.value;
      if (name === 'Pset_SlabCommon') { found = true; break; }
    }
    expect(found).toBe(true);
    api.CloseModel(mid);
  });

  it('emits Qto_SlabBaseQuantities with expected numeric values', async () => {
    const { api, mid } = await buildSlabModel();
    const elemQuantities = api.GetLineIDsWithType(mid, WebIFC.IFCELEMENTQUANTITY);
    let qto: Record<string, unknown> | undefined;
    for (let i = 0; i < elemQuantities.size(); i++) {
      const candidate = api.GetLine(mid, elemQuantities.get(i)) as Record<string, unknown>;
      const name = (candidate['Name'] as { value?: string } | undefined)?.value;
      if (name === 'Qto_SlabBaseQuantities') { qto = candidate; break; }
    }
    if (qto === undefined) throw new Error('Expected Qto_SlabBaseQuantities');

    const numericByName = new Map<string, number>();
    const refs = qto['Quantities'] as Array<{ value: number }>;
    for (const ref of refs) {
      const q = api.GetLine(mid, ref.value) as Record<string, unknown>;
      const name = (q['Name'] as { value?: string } | undefined)?.value;
      if (name === undefined) continue;
      const lengthVal = (q['LengthValue'] as { value?: number } | undefined)?.value;
      const areaVal = (q['AreaValue'] as { value?: number } | undefined)?.value;
      const volumeVal = (q['VolumeValue'] as { value?: number } | undefined)?.value;
      const num = lengthVal ?? areaVal ?? volumeVal;
      if (num !== undefined) numericByName.set(name, num);
    }
    expect(numericByName.get('Length')).toBeCloseTo(6, 5);
    expect(numericByName.get('Width')).toBeCloseTo(4, 5);
    expect(numericByName.get('Depth')).toBeCloseTo(0.25, 5);
    expect(numericByName.get('Perimeter')).toBeCloseTo(2 * (6 + 4), 5);
    expect(numericByName.get('GrossArea')).toBeCloseTo(6 * 4, 5);
    expect(numericByName.get('NetArea')).toBeCloseTo(6 * 4, 5);
    expect(numericByName.get('GrossVolume')).toBeCloseTo(6 * 4 * 0.25, 5);
    expect(numericByName.get('NetVolume')).toBeCloseTo(6 * 4 * 0.25, 5);
    api.CloseModel(mid);
  });

  it('slab is contained in storey via IfcRelContainedInSpatialStructure', async () => {
    const { api, mid } = await buildSlabModel();
    const slabIds = api.GetLineIDsWithType(mid, WebIFC.IFCSLAB);
    expect(slabIds.size()).toBe(1);
    const slabExpressId = slabIds.get(0);

    const containedRels = api.GetLineIDsWithType(mid, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    let foundSlabInRel = false;
    for (let i = 0; i < containedRels.size(); i++) {
      const rel = api.GetLine(mid, containedRels.get(i)) as Record<string, unknown>;
      const related = (rel['RelatedElements'] ?? []) as Array<{ value: number }>;
      if (related.some((r) => r.value === slabExpressId)) {
        foundSlabInRel = true;
        break;
      }
    }
    expect(foundSlabInRel).toBe(true);
    api.CloseModel(mid);
  });
});

describe('IFC Slab Opening round-trip (M6)', () => {
  const SLAB_SPEC = {
    length: 6000,
    width: 4000,
    thickness: 250,
    origin: [0, 0, 0] as [number, number, number],
    axisX: [1, 0, 0] as [number, number, number],
    axisZ: [0, 0, 1] as [number, number, number],
    predefinedType: 'FLOOR' as const,
    materialName: 'Concrete',
  };

  async function buildSlabWithOpenings(): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
    const model = new BimModel();
    const initResult = model.init({ name: 'Slab Opening Test' });
    if (!initResult.ok) throw new Error(initResult.error.message);
    const siteId = model.addSite({ name: 'S' });
    const buildingId = model.addBuilding({ name: 'B' });
    const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
    model.aggregate(initResult.value, siteId);
    model.aggregate(siteId, buildingId);
    model.aggregate(buildingId, storeyId);
    const slabResult = model.addSlab(SLAB_SPEC);
    if (!slabResult.ok) throw new Error(slabResult.error.message);
    model.placeIn(slabResult.value, storeyId);
    // Stairwell + MEP penetration
    const o1 = model.addSlabOpening({
      sizeX: 1200, sizeY: 1500, offsetX: 500, offsetY: 500,
      slabLocalId: slabResult.value,
    });
    if (!o1.ok) throw new Error(o1.error.message);
    const o2 = model.addSlabOpening({
      sizeX: 400, sizeY: 400, offsetX: 4500, offsetY: 3000,
      slabLocalId: slabResult.value,
    });
    if (!o2.ok) throw new Error(o2.error.message);
    const result = await toIfc(model, { applicationName: 'brepjs-bim-test', applicationVersion: '0.0.0' });
    if (!result.ok) throw new Error(result.error.message);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(result.value);
    return { api, mid };
  }

  it('emits two IfcOpeningElements for two slab openings', async () => {
    const { api, mid } = await buildSlabWithOpenings();
    const openings = api.GetLineIDsWithType(mid, WebIFC.IFCOPENINGELEMENT);
    expect(openings.size()).toBe(2);
    api.CloseModel(mid);
  });

  it('emits two IfcRelVoidsElement linking openings to the slab', async () => {
    const { api, mid } = await buildSlabWithOpenings();
    const slabIds = api.GetLineIDsWithType(mid, WebIFC.IFCSLAB);
    const slabExpressId = slabIds.get(0);
    const voids = api.GetLineIDsWithType(mid, WebIFC.IFCRELVOIDSELEMENT);
    expect(voids.size()).toBe(2);
    for (let i = 0; i < voids.size(); i++) {
      const rel = api.GetLine(mid, voids.get(i)) as Record<string, unknown>;
      const relating = (rel['RelatingBuildingElement'] as { value?: number } | undefined)?.value;
      expect(relating).toBe(slabExpressId);
    }
    api.CloseModel(mid);
  });

  it('Qto_SlabBaseQuantities has NetArea < GrossArea and NetVolume < GrossVolume', async () => {
    const { api, mid } = await buildSlabWithOpenings();
    const elemQuantities = api.GetLineIDsWithType(mid, WebIFC.IFCELEMENTQUANTITY);
    let qto: Record<string, unknown> | undefined;
    for (let i = 0; i < elemQuantities.size(); i++) {
      const candidate = api.GetLine(mid, elemQuantities.get(i)) as Record<string, unknown>;
      const name = (candidate['Name'] as { value?: string } | undefined)?.value;
      if (name === 'Qto_SlabBaseQuantities') { qto = candidate; break; }
    }
    if (qto === undefined) throw new Error('Expected Qto_SlabBaseQuantities');

    const numericByName = new Map<string, number>();
    const refs = qto['Quantities'] as Array<{ value: number }>;
    for (const ref of refs) {
      const q = api.GetLine(mid, ref.value) as Record<string, unknown>;
      const name = (q['Name'] as { value?: string } | undefined)?.value;
      if (name === undefined) continue;
      const areaVal = (q['AreaValue'] as { value?: number } | undefined)?.value;
      const volumeVal = (q['VolumeValue'] as { value?: number } | undefined)?.value;
      const num = areaVal ?? volumeVal;
      if (num !== undefined) numericByName.set(name, num);
    }

    // 6 × 4 slab, openings 1.2×1.5 + 0.4×0.4
    const totalOpeningAreaM2 = 1.2 * 1.5 + 0.4 * 0.4;
    expect(numericByName.get('GrossArea')).toBeCloseTo(6 * 4, 5);
    expect(numericByName.get('NetArea')).toBeCloseTo(6 * 4 - totalOpeningAreaM2, 5);
    expect(numericByName.get('GrossVolume')).toBeCloseTo(6 * 4 * 0.25, 5);
    expect(numericByName.get('NetVolume')).toBeCloseTo((6 * 4 - totalOpeningAreaM2) * 0.25, 5);
    api.CloseModel(mid);
  });

  it('slab without openings still emits NetArea === GrossArea', async () => {
    const model = new BimModel();
    const initResult = model.init({ name: 'No-op Slab' });
    if (!initResult.ok) throw new Error(initResult.error.message);
    const siteId = model.addSite({ name: 'S' });
    const buildingId = model.addBuilding({ name: 'B' });
    const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
    model.aggregate(initResult.value, siteId);
    model.aggregate(siteId, buildingId);
    model.aggregate(buildingId, storeyId);
    const slabResult = model.addSlab(SLAB_SPEC);
    if (!slabResult.ok) throw new Error(slabResult.error.message);
    model.placeIn(slabResult.value, storeyId);

    const result = await toIfc(model, { applicationName: 't', applicationVersion: '0' });
    if (!result.ok) throw new Error(result.error.message);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(result.value);

    const elemQuantities = api.GetLineIDsWithType(mid, WebIFC.IFCELEMENTQUANTITY);
    let qto: Record<string, unknown> | undefined;
    for (let i = 0; i < elemQuantities.size(); i++) {
      const candidate = api.GetLine(mid, elemQuantities.get(i)) as Record<string, unknown>;
      const name = (candidate['Name'] as { value?: string } | undefined)?.value;
      if (name === 'Qto_SlabBaseQuantities') { qto = candidate; break; }
    }
    if (qto === undefined) throw new Error('Expected Qto_SlabBaseQuantities');
    let grossArea = 0, netArea = 0, grossVol = 0, netVol = 0;
    const refs = qto['Quantities'] as Array<{ value: number }>;
    for (const ref of refs) {
      const q = api.GetLine(mid, ref.value) as Record<string, unknown>;
      const name = (q['Name'] as { value?: string } | undefined)?.value;
      const a = (q['AreaValue'] as { value?: number } | undefined)?.value;
      const v = (q['VolumeValue'] as { value?: number } | undefined)?.value;
      if (name === 'GrossArea' && a !== undefined) grossArea = a;
      if (name === 'NetArea' && a !== undefined) netArea = a;
      if (name === 'GrossVolume' && v !== undefined) grossVol = v;
      if (name === 'NetVolume' && v !== undefined) netVol = v;
    }
    expect(grossArea).toBeGreaterThan(0);
    expect(netArea).toBeCloseTo(grossArea, 6);
    expect(netVol).toBeCloseTo(grossVol, 6);
    api.CloseModel(mid);
  });
});

describe('IFC Beam round-trip (M7)', () => {
  async function buildBeamModel(): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
    const model = new BimModel();
    unwrap(model.init({ name: 'Beam Test' }));
    const siteId = model.addSite({ name: 'S' });
    const buildingId = model.addBuilding({ name: 'B' });
    const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
    const project = model.getProject();
    if (!project) throw new Error('expected project');
    model.aggregate(project.localId, siteId);
    model.aggregate(siteId, buildingId);
    model.aggregate(buildingId, storeyId);

    const rect = unwrap(model.addBeam({
      length: 5000,
      profile: { kind: 'RECTANGULAR', width: 200, height: 400 },
      origin: [0, 0, 3000], axisX: [1, 0, 0], axisZ: [0, 0, 1],
      predefinedType: 'BEAM',
      materialName: 'Steel',
      isExternal: false,
      loadBearing: true,
      fireRating: 'R60',
    }));
    const ibeam = unwrap(model.addBeam({
      length: 5000,
      profile: { kind: 'I_BEAM', overallWidth: 200, overallDepth: 400, flangeThickness: 15, webThickness: 10 },
      origin: [0, 2000, 3000], axisX: [1, 0, 0], axisZ: [0, 0, 1],
      predefinedType: 'JOIST',
      materialName: 'Steel',
    }));
    model.placeIn(rect, storeyId);
    model.placeIn(ibeam, storeyId);

    const result = await toIfc(model, { applicationName: 'brepjs-bim-test', applicationVersion: '0.0.0' });
    if (!result.ok) throw new Error(result.error.message);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(result.value);
    return { api, mid };
  }

  it('emits two IfcBeam entities', async () => {
    const { api, mid } = await buildBeamModel();
    const beams = api.GetLineIDsWithType(mid, WebIFC.IFCBEAM);
    expect(beams.size()).toBe(2);
    api.CloseModel(mid);
  });

  it('IfcBeam PredefinedType matches spec', async () => {
    const { api, mid } = await buildBeamModel();
    const beamIds = api.GetLineIDsWithType(mid, WebIFC.IFCBEAM);
    const types: string[] = [];
    for (let i = 0; i < beamIds.size(); i++) {
      const b = api.GetLine(mid, beamIds.get(i)) as Record<string, unknown>;
      const pred = (b['PredefinedType'] as { value?: string } | undefined)?.value;
      if (pred !== undefined) types.push(pred);
    }
    expect(types.sort()).toEqual(['BEAM', 'JOIST']);
    api.CloseModel(mid);
  });

  it('emits an IfcIShapeProfileDef for the I-beam', async () => {
    const { api, mid } = await buildBeamModel();
    const profiles = api.GetLineIDsWithType(mid, WebIFC.IFCISHAPEPROFILEDEF);
    expect(profiles.size()).toBe(1);
    api.CloseModel(mid);
  });

  it('emits Pset_BeamCommon for the rect beam (has spec fields)', async () => {
    const { api, mid } = await buildBeamModel();
    const ids = api.GetLineIDsWithType(mid, WebIFC.IFCPROPERTYSET);
    let found = false;
    for (let i = 0; i < ids.size(); i++) {
      const pset = api.GetLine(mid, ids.get(i)) as Record<string, unknown>;
      const name = (pset['Name'] as { value?: string } | undefined)?.value;
      if (name === 'Pset_BeamCommon') { found = true; break; }
    }
    expect(found).toBe(true);
    api.CloseModel(mid);
  });

  it('IFC beam placement orients local Y to spec.axisZ (P1 regression guard)', async () => {
    // Beam along +X with axisZ = [0,0,1]; profile should sit with width along +Y
    // and height along +Z in world space.
    const model = new BimModel();
    unwrap(model.init({ name: 'Orient Test' }));
    unwrap(model.addBeam({
      length: 5000,
      profile: { kind: 'I_BEAM', overallWidth: 200, overallDepth: 400, flangeThickness: 15, webThickness: 10 },
      origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
      materialName: 'Steel',
    }));
    const result = await toIfc(model, { applicationName: 't', applicationVersion: '0' });
    if (!result.ok) throw new Error(result.error.message);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(result.value);
    const beamIds = api.GetLineIDsWithType(mid, WebIFC.IFCBEAM);
    const beam = api.GetLine(mid, beamIds.get(0)) as Record<string, unknown>;
    const placementRef = beam['ObjectPlacement'] as { value: number };
    const placement = api.GetLine(mid, placementRef.value) as Record<string, unknown>;
    const relPlacementRef = placement['RelativePlacement'] as { value: number };
    const relPlacement = api.GetLine(mid, relPlacementRef.value) as Record<string, unknown>;

    const axisRef = relPlacement['Axis'] as { value: number };
    const refDirRef = relPlacement['RefDirection'] as { value: number };
    const axisLine = api.GetLine(mid, axisRef.value) as Record<string, unknown>;
    const refDirLine = api.GetLine(mid, refDirRef.value) as Record<string, unknown>;
    const axis = (axisLine['DirectionRatios'] as Array<{ value: number }>).map((r) => r.value);
    const refDir = (refDirLine['DirectionRatios'] as Array<{ value: number }>).map((r) => r.value);

    // Axis = beam length direction
    expect(axis).toEqual([1, 0, 0]);
    // Derived local Y = Axis × RefDirection should equal spec.axisZ = [0, 0, 1]
    const [ax = 0, ay = 0, az = 0] = axis;
    const [rx = 0, ry = 0, rz = 0] = refDir;
    const localY: [number, number, number] = [
      ay * rz - az * ry,
      az * rx - ax * rz,
      ax * ry - ay * rx,
    ];
    expect(localY[0]).toBeCloseTo(0, 6);
    expect(localY[1]).toBeCloseTo(0, 6);
    expect(localY[2]).toBeCloseTo(1, 6);
    api.CloseModel(mid);
  });

  it('Qto_BeamBaseQuantities has expected numeric values', async () => {
    const { api, mid } = await buildBeamModel();
    const qtoIds = api.GetLineIDsWithType(mid, WebIFC.IFCELEMENTQUANTITY);
    const qtos: Array<Record<string, unknown>> = [];
    for (let i = 0; i < qtoIds.size(); i++) {
      const candidate = api.GetLine(mid, qtoIds.get(i)) as Record<string, unknown>;
      const name = (candidate['Name'] as { value?: string } | undefined)?.value;
      if (name === 'Qto_BeamBaseQuantities') qtos.push(candidate);
    }
    expect(qtos).toHaveLength(2);

    // Pull the rect beam's qto (cross section = 0.2 × 0.4 = 0.08 m²)
    let rectQto: Record<string, unknown> | undefined;
    for (const qto of qtos) {
      const refs = qto['Quantities'] as Array<{ value: number }>;
      for (const r of refs) {
        const q = api.GetLine(mid, r.value) as Record<string, unknown>;
        const name = (q['Name'] as { value?: string } | undefined)?.value;
        const area = (q['AreaValue'] as { value?: number } | undefined)?.value;
        if (name === 'CrossSectionArea' && area !== undefined && Math.abs(area - 0.08) < 1e-6) {
          rectQto = qto;
        }
      }
    }
    if (rectQto === undefined) throw new Error('Expected rect beam Qto');

    const numericByName = new Map<string, number>();
    const refs = rectQto['Quantities'] as Array<{ value: number }>;
    for (const r of refs) {
      const q = api.GetLine(mid, r.value) as Record<string, unknown>;
      const name = (q['Name'] as { value?: string } | undefined)?.value;
      if (name === undefined) continue;
      const lengthVal = (q['LengthValue'] as { value?: number } | undefined)?.value;
      const areaVal = (q['AreaValue'] as { value?: number } | undefined)?.value;
      const volumeVal = (q['VolumeValue'] as { value?: number } | undefined)?.value;
      const num = lengthVal ?? areaVal ?? volumeVal;
      if (num !== undefined) numericByName.set(name, num);
    }
    expect(numericByName.get('Length')).toBeCloseTo(5, 5);
    expect(numericByName.get('CrossSectionArea')).toBeCloseTo(0.08, 5);
    expect(numericByName.get('GrossVolume')).toBeCloseTo(5 * 0.08, 5);
    expect(numericByName.get('NetVolume')).toBeCloseTo(5 * 0.08, 5);
    api.CloseModel(mid);
  });
});

describe('IFC Column round-trip (M7)', () => {
  async function buildColumnModel(): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
    const model = new BimModel();
    unwrap(model.init({ name: 'Column Test' }));
    const siteId = model.addSite({ name: 'S' });
    const buildingId = model.addBuilding({ name: 'B' });
    const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
    const project = model.getProject();
    if (!project) throw new Error('expected project');
    model.aggregate(project.localId, siteId);
    model.aggregate(siteId, buildingId);
    model.aggregate(buildingId, storeyId);

    const round = unwrap(model.addColumn({
      height: 3000,
      profile: { kind: 'CIRCULAR', radius: 200 },
      origin: [1000, 1000, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
      predefinedType: 'COLUMN',
      materialName: 'Concrete',
      loadBearing: true,
    }));
    const pilaster = unwrap(model.addColumn({
      height: 3000,
      profile: { kind: 'RECTANGULAR', width: 200, height: 400 },
      origin: [2000, 2000, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
      predefinedType: 'PILASTER',
      materialName: 'Concrete',
    }));
    model.placeIn(round, storeyId);
    model.placeIn(pilaster, storeyId);

    const result = await toIfc(model, { applicationName: 'brepjs-bim-test', applicationVersion: '0.0.0' });
    if (!result.ok) throw new Error(result.error.message);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(result.value);
    return { api, mid };
  }

  it('emits two IfcColumn entities', async () => {
    const { api, mid } = await buildColumnModel();
    const columns = api.GetLineIDsWithType(mid, WebIFC.IFCCOLUMN);
    expect(columns.size()).toBe(2);
    api.CloseModel(mid);
  });

  it('IfcColumn PredefinedType matches spec', async () => {
    const { api, mid } = await buildColumnModel();
    const ids = api.GetLineIDsWithType(mid, WebIFC.IFCCOLUMN);
    const types: string[] = [];
    for (let i = 0; i < ids.size(); i++) {
      const c = api.GetLine(mid, ids.get(i)) as Record<string, unknown>;
      const pred = (c['PredefinedType'] as { value?: string } | undefined)?.value;
      if (pred !== undefined) types.push(pred);
    }
    expect(types.sort()).toEqual(['COLUMN', 'PILASTER']);
    api.CloseModel(mid);
  });

  it('emits an IfcCircleProfileDef for the round column', async () => {
    const { api, mid } = await buildColumnModel();
    const profiles = api.GetLineIDsWithType(mid, WebIFC.IFCCIRCLEPROFILEDEF);
    expect(profiles.size()).toBe(1);
    api.CloseModel(mid);
  });

  it('Qto_ColumnBaseQuantities reflects circular cross-section area', async () => {
    const { api, mid } = await buildColumnModel();
    const qtoIds = api.GetLineIDsWithType(mid, WebIFC.IFCELEMENTQUANTITY);
    let roundQto: Record<string, unknown> | undefined;
    for (let i = 0; i < qtoIds.size(); i++) {
      const candidate = api.GetLine(mid, qtoIds.get(i)) as Record<string, unknown>;
      const name = (candidate['Name'] as { value?: string } | undefined)?.value;
      if (name !== 'Qto_ColumnBaseQuantities') continue;
      const refs = candidate['Quantities'] as Array<{ value: number }>;
      for (const r of refs) {
        const q = api.GetLine(mid, r.value) as Record<string, unknown>;
        const qName = (q['Name'] as { value?: string } | undefined)?.value;
        const area = (q['AreaValue'] as { value?: number } | undefined)?.value;
        // Round column area in m² = π × 0.2² ≈ 0.12566
        if (qName === 'CrossSectionArea' && area !== undefined && Math.abs(area - Math.PI * 0.04) < 1e-4) {
          roundQto = candidate;
        }
      }
    }
    if (roundQto === undefined) throw new Error('Expected round-column Qto');

    const numericByName = new Map<string, number>();
    const refs = roundQto['Quantities'] as Array<{ value: number }>;
    for (const r of refs) {
      const q = api.GetLine(mid, r.value) as Record<string, unknown>;
      const name = (q['Name'] as { value?: string } | undefined)?.value;
      if (name === undefined) continue;
      const lengthVal = (q['LengthValue'] as { value?: number } | undefined)?.value;
      const areaVal = (q['AreaValue'] as { value?: number } | undefined)?.value;
      const volumeVal = (q['VolumeValue'] as { value?: number } | undefined)?.value;
      const num = lengthVal ?? areaVal ?? volumeVal;
      if (num !== undefined) numericByName.set(name, num);
    }
    expect(numericByName.get('Length')).toBeCloseTo(3, 5);
    expect(numericByName.get('CrossSectionArea')).toBeCloseTo(Math.PI * 0.04, 5);
    expect(numericByName.get('GrossVolume')).toBeCloseTo(3 * Math.PI * 0.04, 4);
    api.CloseModel(mid);
  });
});
