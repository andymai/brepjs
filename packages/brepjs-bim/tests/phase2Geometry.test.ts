import { bodySolids } from '../src/types/productBody.js';
import { describe, it, expect, beforeAll } from 'vitest';
import * as WebIFC from 'web-ifc';
import { box, scale, unwrap } from 'brepjs';
import { initKernel } from '../../../tests/setup.js';
import { SpfReader } from '../src/import/spfReader.js';
import { emittedBody } from './helpers/ifcBodyFixture.js';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc, toIfcValidated } from '../src/serialize/toIfc.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

// Builds a spatially-complete model (project→site→building→storey) with a wall
// that hosts a door and a window. Returns the model and the storey id so callers
// can place additional elements.
function buildModelWithOpenings(): { model: BimModel; storeyId: number } {
  const model = new BimModel();
  const initResult = model.init({ name: 'Phase2 Project' });
  if (!initResult.ok) throw new Error(initResult.error.message);
  const projectId = initResult.value;
  const siteId = unwrap(model.addSite({ name: 'Site' }));
  const buildingId = unwrap(model.addBuilding({ name: 'Building' }));
  const storeyId = unwrap(model.addStorey({ name: 'L1', elevation: 0 }));
  model.aggregate(projectId, siteId);
  model.aggregate(siteId, buildingId);
  model.aggregate(buildingId, storeyId);

  const wall = model.addWall({
    length: 5000,
    height: 3000,
    thickness: 250,
    origin: [0, 0, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Concrete',
  });
  if (!wall.ok) throw new Error(wall.error.message);
  model.placeIn(wall.value, storeyId);

  const door = model.addDoor({
    width: 900,
    height: 2100,
    offsetAlongWall: 500,
    offsetFromFloor: 0,
    wallLocalId: wall.value,
    materialName: 'Wood',
  });
  if (!door.ok) throw new Error(door.error.message);
  model.placeIn(door.value, storeyId);

  const win = model.addWindow({
    width: 1200,
    height: 1000,
    offsetAlongWall: 2500,
    offsetFromFloor: 900,
    wallLocalId: wall.value,
    materialName: 'Aluminium',
  });
  if (!win.ok) throw new Error(win.error.message);
  model.placeIn(win.value, storeyId);

  return { model, storeyId };
}

async function open(bytes: Uint8Array): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const mid = api.OpenModel(bytes);
  return { api, mid };
}

function asValue(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (v !== null && typeof v === 'object' && 'value' in v) {
    return (v as { value?: number }).value;
  }
  return undefined;
}

describe('Phase 2 door/window geometry', () => {
  it('emits a non-null door Representation with OverallHeight and OverallWidth', async () => {
    const { model } = buildModelWithOpenings();
    const result = await toIfc(model, META);
    if (!result.ok) throw new Error(result.error.message);

    const { api, mid } = await open(result.value);
    const doorIds = api.GetLineIDsWithType(mid, WebIFC.IFCDOOR);
    expect(doorIds.size()).toBe(1);
    const door = api.GetLine(mid, doorIds.get(0)) as Record<string, unknown>;
    expect(door['Representation']).not.toBeNull();
    // 2100mm height / 900mm width → 2.1m / 0.9m.
    expect(asValue(door['OverallHeight'])).toBeCloseTo(2.1, 5);
    expect(asValue(door['OverallWidth'])).toBeCloseTo(0.9, 5);
    api.CloseModel(mid);
  });

  it('emits a non-null window Representation with OverallHeight and OverallWidth', async () => {
    const { model } = buildModelWithOpenings();
    const result = await toIfc(model, META);
    if (!result.ok) throw new Error(result.error.message);

    const { api, mid } = await open(result.value);
    const winIds = api.GetLineIDsWithType(mid, WebIFC.IFCWINDOW);
    expect(winIds.size()).toBe(1);
    const win = api.GetLine(mid, winIds.get(0)) as Record<string, unknown>;
    expect(win['Representation']).not.toBeNull();
    expect(asValue(win['OverallHeight'])).toBeCloseTo(1.0, 5);
    expect(asValue(win['OverallWidth'])).toBeCloseTo(1.2, 5);
    api.CloseModel(mid);
  });

  it('emits the retained Wall Body as tessellated items', async () => {
    using model = buildModelWithOpenings().model;
    const [wall] = model.getWalls();
    if (!wall) throw new Error('Missing wall');
    const bytes = unwrap(await toIfc(model, META));
    using reader = unwrap(await SpfReader.create(bytes));
    const body = emittedBody(reader, wall.guid);
    expect(body.representationType).toBe('Tessellation');
    expect(body.items).toHaveLength(bodySolids(wall.geometry).length);
    body.items.forEach((item) => expect(item.type).toBe(WebIFC.IFCTRIANGULATEDFACESET));
  });
});

describe('Phase 2 proxy geometry', () => {
  it('writes an IfcBuildingElementProxy with its own tessellated body', async () => {
    using model = buildModelWithOpenings().model;
    const proxyId = unwrap(model.addProxy({ name: 'Custom Block', solid: box(800, 600, 400) }));
    const proxy = model.getElement(proxyId);
    if (proxy?.category !== 'PROXY') throw new Error('Missing proxy');
    const bytes = unwrap(await toIfc(model, META));
    using reader = unwrap(await SpfReader.create(bytes));
    const body = emittedBody(reader, proxy.guid);
    expect(reader.getLineType(body.expressId)).toBe(WebIFC.IFCBUILDINGELEMENTPROXY);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.type).toBe(WebIFC.IFCTRIANGULATEDFACESET);
  });
});

describe('Phase 2 geometry-validity gate', () => {
  it('toIfcValidated flags a proxy built from a degenerate solid as ZERO_VOLUME', async () => {
    const { model } = buildModelWithOpenings();
    // Uniform near-zero scale keeps topology valid but collapses the volume.
    const degenerate = scale(box(1000, 500, 300), 1e-7);
    const proxy = model.addProxy({ name: 'Degenerate', solid: degenerate });
    if (!proxy.ok) throw new Error(proxy.error.message);

    const result = await toIfcValidated(model, META);
    if (!result.ok) throw new Error(result.error.message);
    const zeroVolume = result.value.report.issues.filter((i) => i.code === 'ZERO_VOLUME');
    expect(zeroVolume.length).toBeGreaterThan(0);
    expect(zeroVolume.some((i) => i.severity === 'error')).toBe(true);
  });

  it('toIfcValidated reports no geometry errors for an all-valid model', async () => {
    const { model } = buildModelWithOpenings();
    const proxy = model.addProxy({ name: 'Valid Block', solid: box(800, 600, 400) });
    if (!proxy.ok) throw new Error(proxy.error.message);

    const result = await toIfcValidated(model, META);
    if (!result.ok) throw new Error(result.error.message);
    const geomErrors = result.value.report.issues.filter(
      (i) =>
        i.severity === 'error' &&
        (i.code === 'ZERO_VOLUME' || i.code === 'INVALID_GEOMETRY' || i.code === 'VOLUME_FAILED')
    );
    expect(geomErrors).toHaveLength(0);
  });
});
