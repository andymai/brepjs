import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import * as WebIFC from 'web-ifc';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc, toIfcValidated } from '../src/serialize/toIfc.js';
import { hasErrors } from '../src/validation/severity.js';
import { DEFAULT_MVD_VIEW_DEFINITION } from '../src/ifc-writer/ifcWriter.js';

beforeAll(async () => { await initOCCT(); }, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

function buildModel(): BimModel {
  const model = new BimModel();
  const initResult = model.init({ name: 'Phase1 Project' });
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
    origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
    materialName: 'Concrete',
  });
  if (!wall.ok) throw new Error(wall.error.message);
  model.placeIn(wall.value, storeyId);

  const slab = model.addSlab({
    length: 6000, width: 4000, thickness: 250,
    origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
    predefinedType: 'FLOOR', materialName: 'Concrete',
  });
  if (!slab.ok) throw new Error(slab.error.message);
  model.placeIn(slab.value, storeyId);

  return model;
}

describe('Phase 1 integration', () => {
  it('deterministic GUIDs are stable across two exports of the same model', async () => {
    const a = await toIfc(buildModel(), META);
    const b = await toIfc(buildModel(), META);
    if (!a.ok) throw new Error(a.error.message);
    if (!b.ok) throw new Error(b.error.message);

    const guidsA = collectGlobalIds(a.value);
    const guidsB = collectGlobalIds(b.value);
    expect(guidsA.length).toBeGreaterThan(0);
    expect(guidsB).toEqual(guidsA);
  });

  it('element GlobalId still equals the BimModel element GUID', async () => {
    const model = buildModel();
    const result = await toIfc(model, META);
    if (!result.ok) throw new Error(result.error.message);

    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(result.value);
    const wallIds = api.GetLineIDsWithType(mid, WebIFC.IFCWALL);
    const wall = api.GetLine(mid, wallIds.get(0)) as Record<string, unknown>;
    const wallGuid = (wall['GlobalId'] as { value?: string } | undefined)?.value;
    expect(wallGuid).toBe(model.getWalls()[0]?.guid);
    api.CloseModel(mid);
  });

  it('produced IFC declares the MVD ViewDefinition in FILE_DESCRIPTION', async () => {
    const result = await toIfc(buildModel(), META);
    if (!result.ok) throw new Error(result.error.message);
    const text = new TextDecoder().decode(result.value.subarray(0, 1024));
    expect(text).toContain(`ViewDefinition [${DEFAULT_MVD_VIEW_DEFINITION}]`);
  });

  it('honors a custom mvdViewDefinition from meta', async () => {
    const result = await toIfc(buildModel(), { ...META, mvdViewDefinition: 'DesignTransferView_V1.0' });
    if (!result.ok) throw new Error(result.error.message);
    const text = new TextDecoder().decode(result.value.subarray(0, 1024));
    expect(text).toContain('ViewDefinition [DesignTransferView_V1.0]');
  });

  it('emits IfcType objects and IfcRelDefinesByType for occurrences', async () => {
    const result = await toIfc(buildModel(), META);
    if (!result.ok) throw new Error(result.error.message);

    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(result.value);

    expect(api.GetLineIDsWithType(mid, WebIFC.IFCWALLTYPE).size()).toBe(1);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCSLABTYPE).size()).toBe(1);

    const rels = api.GetLineIDsWithType(mid, WebIFC.IFCRELDEFINESBYTYPE);
    expect(rels.size()).toBe(2);

    // The wall rel must point its RelatingType at the IfcWallType.
    const wallTypeId = api.GetLineIDsWithType(mid, WebIFC.IFCWALLTYPE).get(0);
    let relPointsAtWallType = false;
    for (let i = 0; i < rels.size(); i++) {
      const rel = api.GetLine(mid, rels.get(i)) as Record<string, unknown>;
      const relating = (rel['RelatingType'] as { value?: number } | undefined)?.value;
      if (relating === wallTypeId) relPointsAtWallType = true;
    }
    expect(relPointsAtWallType).toBe(true);
    api.CloseModel(mid);
  });

  it('toIfcValidated returns a clean report for a valid model', async () => {
    const result = await toIfcValidated(buildModel(), META);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.bytes.byteLength).toBeGreaterThan(0);
    expect(hasErrors(result.value.report)).toBe(false);
  });

  it('toIfcValidated rejects a model that fails referential integrity', async () => {
    const model = new BimModel();
    const initResult = model.init({ name: 'Broken' });
    if (!initResult.ok) throw new Error(initResult.error.message);
    // Wall added but never placed in a spatial structure → ELEMENT_NOT_CONTAINED.
    const wall = model.addWall({
      length: 3000, height: 2700, thickness: 200,
      origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
      materialName: 'Concrete',
    });
    if (!wall.ok) throw new Error(wall.error.message);

    const result = await toIfcValidated(model, META);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INTEGRITY_FAILURE');

    // Plain toIfc remains permissive and still serializes.
    const plain = await toIfc(model, META);
    expect(plain.ok).toBe(true);
  });
});

function collectGlobalIds(bytes: Uint8Array): string[] {
  // Synchronous-ish text scan of the SPF body for all GlobalId string literals.
  // GlobalIds are the 22-char IFC base64 strings in IfcRoot lines; we extract
  // them in file order so two exports can be compared positionally.
  const text = new TextDecoder().decode(bytes);
  const guids: string[] = [];
  const re = /'([0-9A-Za-z_$]{22})'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1] !== undefined) guids.push(m[1]);
  }
  return guids;
}
