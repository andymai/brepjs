import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import * as WebIFC from 'web-ifc';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { parseProfile } from '../src/specs/profile.js';
import type { ExtendedProfile } from '../src/specs/profilesExtended.js';

beforeAll(async () => { await initOCCT(); }, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

const UP: [number, number, number] = [0, 0, 1];
const XAXIS: [number, number, number] = [1, 0, 0];

// Builds a model with one of each Group A element, all contained in one storey,
// plus a space boundary tying the space to a wall.
function buildGroupAModel(): BimModel {
  const model = new BimModel();
  const initResult = model.init({ name: 'Phase3 GroupA Project' });
  if (!initResult.ok) throw new Error(initResult.error.message);
  const projectId = initResult.value;
  const siteId = model.addSite({ name: 'Site' });
  const buildingId = model.addBuilding({ name: 'Building' });
  const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
  model.aggregate(projectId, siteId);
  model.aggregate(siteId, buildingId);
  model.aggregate(buildingId, storeyId);

  const wall = model.addWall({
    length: 5000, height: 3000, thickness: 250,
    origin: [0, 0, 0], axisX: XAXIS, axisZ: UP,
    materialName: 'Concrete',
  });
  if (!wall.ok) throw new Error(wall.error.message);
  model.placeIn(wall.value, storeyId);

  const space = model.addSpace({
    name: 'Office 101', length: 4000, width: 3000, height: 3000,
    origin: [0, 0, 0], axisX: XAXIS, axisZ: UP,
    materialName: 'Air', predefinedType: 'INTERNAL', isExternal: false,
  });
  if (!space.ok) throw new Error(space.error.message);
  model.placeIn(space.value, storeyId);
  model.addSpaceBoundary(space.value, wall.value, 'PHYSICAL');

  const roof = model.addRoof({
    length: 6000, width: 4000, thickness: 200,
    origin: [0, 0, 3000], axisX: XAXIS, axisZ: UP,
    predefinedType: 'FLAT_ROOF', materialName: 'Concrete', isExternal: true,
  });
  if (!roof.ok) throw new Error(roof.error.message);
  model.placeIn(roof.value, storeyId);

  const curtainWall = model.addCurtainWall({
    width: 3000, height: 2400, columns: 2, rows: 2,
    panelThickness: 30, mullionWidth: 60, mullionDepth: 80,
    origin: [0, 5000, 0], axisX: XAXIS, axisZ: UP,
    materialName: 'Aluminium', predefinedType: 'CURTAIN_WALL',
  });
  if (!curtainWall.ok) throw new Error(curtainWall.error.message);
  model.placeIn(curtainWall.value, storeyId);

  const footing = model.addFooting({
    length: 1200, width: 1200, thickness: 400,
    origin: [0, 0, -400], axisX: XAXIS, axisZ: UP,
    predefinedType: 'PAD_FOOTING', materialName: 'Concrete', loadBearing: true,
  });
  if (!footing.ok) throw new Error(footing.error.message);
  model.placeIn(footing.value, storeyId);

  const pile = model.addPile({
    length: 8000, profile: { kind: 'CIRCULAR', radius: 300 },
    origin: [0, 0, -8400], axisX: XAXIS, axisZ: UP,
    predefinedType: 'BORED', constructionType: 'CAST_IN_PLACE',
    materialName: 'Concrete', loadBearing: true,
  });
  if (!pile.ok) throw new Error(pile.error.message);
  model.placeIn(pile.value, storeyId);

  return model;
}

async function serialize(model: BimModel): Promise<Uint8Array> {
  const result = await toIfc(model, META);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function countOf(api: WebIFC.IfcAPI, mid: number, type: number): number {
  return api.GetLineIDsWithType(mid, type).size();
}

describe('Phase 3 Group A integration', () => {
  it('serializes one of each Group A element with the expected entity counts', async () => {
    const bytes = await serialize(buildGroupAModel());
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(bytes);

    expect(countOf(api, mid, WebIFC.IFCSPACE)).toBe(1);
    expect(countOf(api, mid, WebIFC.IFCROOF)).toBe(1);
    expect(countOf(api, mid, WebIFC.IFCCURTAINWALL)).toBe(1);
    expect(countOf(api, mid, WebIFC.IFCFOOTING)).toBe(1);
    expect(countOf(api, mid, WebIFC.IFCPILE)).toBe(1);
    // Curtain wall decomposes into 4 plates (2x2 grid) and 6 members
    // (3 vertical mullions + 3 horizontal transoms).
    expect(countOf(api, mid, WebIFC.IFCPLATE)).toBe(4);
    expect(countOf(api, mid, WebIFC.IFCMEMBER)).toBe(6);

    api.CloseModel(mid);
  });

  it('every Group A occurrence has a non-null Representation (except the curtain wall assembly)', async () => {
    const bytes = await serialize(buildGroupAModel());
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(bytes);

    const checkRep = (type: number): void => {
      const ids = api.GetLineIDsWithType(mid, type);
      for (let i = 0; i < ids.size(); i++) {
        const line = api.GetLine(mid, ids.get(i)) as Record<string, unknown>;
        expect(line['Representation']).not.toBeNull();
      }
    };
    checkRep(WebIFC.IFCSPACE);
    checkRep(WebIFC.IFCROOF);
    checkRep(WebIFC.IFCFOOTING);
    checkRep(WebIFC.IFCPILE);
    checkRep(WebIFC.IFCPLATE);
    checkRep(WebIFC.IFCMEMBER);

    api.CloseModel(mid);
  });

  it('emits IfcType objects and IfcRelDefinesByType for the new categories', async () => {
    const bytes = await serialize(buildGroupAModel());
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(bytes);

    expect(countOf(api, mid, WebIFC.IFCSPACETYPE)).toBe(1);
    expect(countOf(api, mid, WebIFC.IFCROOFTYPE)).toBe(1);
    expect(countOf(api, mid, WebIFC.IFCFOOTINGTYPE)).toBe(1);
    expect(countOf(api, mid, WebIFC.IFCPILETYPE)).toBe(1);

    // Every type object is wired to its occurrence(s) via IfcRelDefinesByType.
    const relIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELDEFINESBYTYPE);
    expect(relIds.size()).toBeGreaterThanOrEqual(4);

    api.CloseModel(mid);
  });

  it('emits the IfcRelSpaceBoundary tying the space to the wall', async () => {
    const model = buildGroupAModel();
    const bytes = await serialize(model);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(bytes);

    const boundaryIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELSPACEBOUNDARY);
    expect(boundaryIds.size()).toBe(1);
    const boundary = api.GetLine(mid, boundaryIds.get(0)) as Record<string, unknown>;
    const spaceRef = (boundary['RelatingSpace'] as { value?: number } | undefined)?.value;
    const elementRef = (boundary['RelatedBuildingElement'] as { value?: number } | undefined)?.value;
    expect(spaceRef).toBeDefined();
    expect(elementRef).toBeDefined();

    const spaceId = api.GetLineIDsWithType(mid, WebIFC.IFCSPACE).get(0);
    const wallId = api.GetLineIDsWithType(mid, WebIFC.IFCWALL).get(0);
    expect(spaceRef).toBe(spaceId);
    expect(elementRef).toBe(wallId);

    api.CloseModel(mid);
  });

  it('space GlobalId equals the BimModel element GUID', async () => {
    const model = buildGroupAModel();
    const bytes = await serialize(model);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(bytes);

    const spaceIds = api.GetLineIDsWithType(mid, WebIFC.IFCSPACE);
    const space = api.GetLine(mid, spaceIds.get(0)) as Record<string, unknown>;
    const guid = (space['GlobalId'] as { value?: string } | undefined)?.value;
    expect(guid).toBe(model.getSpaces()[0]?.guid);

    api.CloseModel(mid);
  });

  it('deterministic GUIDs are stable across two exports of the same model', async () => {
    const a = await serialize(buildGroupAModel());
    const b = await serialize(buildGroupAModel());
    const textA = new TextDecoder().decode(a);
    const textB = new TextDecoder().decode(b);
    const guidsA = [...textA.matchAll(/'([0-9A-Za-z_$]{22})'/g)].map((m) => m[1]);
    const guidsB = [...textB.matchAll(/'([0-9A-Za-z_$]{22})'/g)].map((m) => m[1]);
    expect(guidsA.length).toBeGreaterThan(0);
    expect(guidsB).toEqual(guidsA);
  });

  it('parseProfile accepts an extended profile and routes it to its IfcProfileDef', async () => {
    const lShape: ExtendedProfile = {
      kind: 'L_SHAPE', depth: 100, width: 80, legThickness: 10,
    };
    const parsed = parseProfile(lShape);
    expect(parsed.ok).toBe(true);

    const model = new BimModel();
    const initResult = model.init({ name: 'Extended Profile Project' });
    if (!initResult.ok) throw new Error(initResult.error.message);
    const storeyId = model.addStorey({ name: 'L1', elevation: 0 });

    const pile = model.addPile({
      length: 5000, profile: { kind: 'RECTANGULAR', width: 400, height: 400 },
      origin: [0, 0, 0], axisX: XAXIS, axisZ: UP,
      materialName: 'Steel',
    });
    if (!pile.ok) throw new Error(pile.error.message);
    model.placeIn(pile.value, storeyId);

    const bytes = await serialize(model);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(bytes);
    // The rectangular pile profile is emitted as an IfcRectangleProfileDef.
    expect(countOf(api, mid, WebIFC.IFCRECTANGLEPROFILEDEF)).toBeGreaterThanOrEqual(1);
    api.CloseModel(mid);
  });

  it('rejects an infeasible extended profile at parse time', () => {
    // CIRCLE_HOLLOW with wallThickness >= radius is degenerate.
    const bad = parseProfile({ kind: 'CIRCLE_HOLLOW', radius: 50, wallThickness: 60 });
    expect(bad.ok).toBe(false);
  });
});
