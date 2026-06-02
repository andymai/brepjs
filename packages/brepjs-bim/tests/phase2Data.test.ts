import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import * as WebIFC from 'web-ifc';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';

beforeAll(async () => { await initOCCT(); }, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

function spatialModel(): { model: BimModel; storeyId: number } {
  const model = new BimModel();
  const initResult = model.init({ name: 'Phase2 Data' });
  if (!initResult.ok) throw new Error(initResult.error.message);
  const projectId = initResult.value;
  const siteId = model.addSite({ name: 'Site' });
  const buildingId = model.addBuilding({ name: 'Building' });
  const storeyId = model.addStorey({ name: 'L1', elevation: 0 });
  model.aggregate(projectId, siteId);
  model.aggregate(siteId, buildingId);
  model.aggregate(buildingId, storeyId);
  return { model, storeyId };
}

async function openModel(bytes: Uint8Array): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const mid = api.OpenModel(bytes);
  return { api, mid };
}

// A round-tripped NominalValue wrapper carries the schema type name (e.g.
// 'IFCBOOLEAN', 'IFCTHERMALTRANSMITTANCEMEASURE') that the measure type was
// minted with. The numeric `type` field is only a coarse kind code (string/
// real/enum) that cannot distinguish IFCREAL from IFCTHERMALTRANSMITTANCEMEASURE.
function measureName(value: Record<string, unknown> | undefined): string | undefined {
  return (value as { name?: string } | undefined)?.name;
}

describe('Phase 2 data integration', () => {
  it('emits Pset_WallCommon properties with correct (non-IFCREAL) measure types', async () => {
    const { model, storeyId } = spatialModel();
    const wall = model.addWall({
      length: 5000, height: 3000, thickness: 250,
      origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
      materialName: 'Concrete',
      isExternal: true,
      fireRating: 'REI120',
      thermalTransmittance: 0.35,
    });
    if (!wall.ok) throw new Error(wall.error.message);
    model.placeIn(wall.value, storeyId);

    const result = await toIfc(model, META);
    if (!result.ok) throw new Error(result.error.message);
    const { api, mid } = await openModel(result.value);

    const propIds = api.GetLineIDsWithType(mid, WebIFC.IFCPROPERTYSINGLEVALUE);
    const byName = new Map<string, string | undefined>();
    for (let i = 0; i < propIds.size(); i++) {
      const prop = api.GetLine(mid, propIds.get(i)) as Record<string, unknown>;
      const name = (prop['Name'] as { value?: string } | undefined)?.value;
      if (name === undefined) continue;
      byName.set(name, measureName(prop['NominalValue'] as Record<string, unknown> | undefined));
    }

    expect(byName.get('IsExternal')).toBe('IFCBOOLEAN');
    expect(byName.get('FireRating')).toBe('IFCLABEL');
    expect(byName.get('ThermalTransmittance')).toBe('IFCTHERMALTRANSMITTANCEMEASURE');
    // The legacy heuristic would have typed ThermalTransmittance as IFCREAL.
    expect(byName.get('ThermalTransmittance')).not.toBe('IFCREAL');
    api.CloseModel(mid);
  });

  it('emits the Status property as an IfcPropertyEnumeratedValue', async () => {
    const { model, storeyId } = spatialModel();
    const wall = model.addWall({
      length: 4000, height: 2700, thickness: 200,
      origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
      materialName: 'Concrete',
      status: 'EXISTING',
    });
    if (!wall.ok) throw new Error(wall.error.message);
    model.placeIn(wall.value, storeyId);

    const result = await toIfc(model, META);
    if (!result.ok) throw new Error(result.error.message);
    const { api, mid } = await openModel(result.value);

    const enumIds = api.GetLineIDsWithType(mid, WebIFC.IFCPROPERTYENUMERATEDVALUE);
    expect(enumIds.size()).toBe(1);
    const enumProp = api.GetLine(mid, enumIds.get(0)) as Record<string, unknown>;
    expect((enumProp['Name'] as { value?: string } | undefined)?.value).toBe('Status');
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCPROPERTYENUMERATION).size()).toBe(1);
    api.CloseModel(mid);
  });

  it('associates a layered material via IfcRelAssociatesMaterial + IfcMaterialLayerSet', async () => {
    const { model, storeyId } = spatialModel();
    const wall = model.addWall({
      length: 5000, height: 3000, thickness: 300,
      origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
      materialName: 'Wall Buildup',
      layerSetName: 'Cavity Wall',
      materialLayers: [
        { name: 'Brick', thicknessMm: 100 },
        { name: 'Insulation', thicknessMm: 100, isVentilated: false },
        { name: 'Blockwork', thicknessMm: 100 },
      ],
    });
    if (!wall.ok) throw new Error(wall.error.message);
    model.placeIn(wall.value, storeyId);

    const result = await toIfc(model, META);
    if (!result.ok) throw new Error(result.error.message);
    const { api, mid } = await openModel(result.value);

    const layerSets = api.GetLineIDsWithType(mid, WebIFC.IFCMATERIALLAYERSET);
    expect(layerSets.size()).toBe(1);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCMATERIALLAYER).size()).toBe(3);

    const rels = api.GetLineIDsWithType(mid, WebIFC.IFCRELASSOCIATESMATERIAL);
    expect(rels.size()).toBe(1);
    const wallId = api.GetLineIDsWithType(mid, WebIFC.IFCWALL).get(0);
    const rel = api.GetLine(mid, rels.get(0)) as Record<string, unknown>;
    const related = (rel['RelatedObjects'] as Array<{ value?: number }> | undefined) ?? [];
    expect(related.map((r) => r.value)).toContain(wallId);
    api.CloseModel(mid);
  });

  it('associates a classification reference via IfcRelAssociatesClassification', async () => {
    const { model, storeyId } = spatialModel();
    const wall = model.addWall({
      length: 5000, height: 3000, thickness: 250,
      origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
      materialName: 'Concrete',
      classification: {
        system: 'Uniclass2015',
        edition: '2015',
        code: 'Ss_25_10_30',
        description: 'Framed walls',
      },
    });
    if (!wall.ok) throw new Error(wall.error.message);
    model.placeIn(wall.value, storeyId);

    const result = await toIfc(model, META);
    if (!result.ok) throw new Error(result.error.message);
    const { api, mid } = await openModel(result.value);

    expect(api.GetLineIDsWithType(mid, WebIFC.IFCCLASSIFICATION).size()).toBe(1);
    const refIds = api.GetLineIDsWithType(mid, WebIFC.IFCCLASSIFICATIONREFERENCE);
    expect(refIds.size()).toBe(1);
    const refLine = api.GetLine(mid, refIds.get(0)) as Record<string, unknown>;
    expect((refLine['Identification'] as { value?: string } | undefined)?.value).toBe('Ss_25_10_30');

    const rels = api.GetLineIDsWithType(mid, WebIFC.IFCRELASSOCIATESCLASSIFICATION);
    expect(rels.size()).toBe(1);
    const wallId = api.GetLineIDsWithType(mid, WebIFC.IFCWALL).get(0);
    const rel = api.GetLine(mid, rels.get(0)) as Record<string, unknown>;
    const related = (rel['RelatedObjects'] as Array<{ value?: number }> | undefined) ?? [];
    expect(related.map((r) => r.value)).toContain(wallId);
    api.CloseModel(mid);
  });

  it('addClassification associates an existing element after the fact', async () => {
    const { model, storeyId } = spatialModel();
    const wall = model.addWall({
      length: 5000, height: 3000, thickness: 250,
      origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
      materialName: 'Concrete',
    });
    if (!wall.ok) throw new Error(wall.error.message);
    model.placeIn(wall.value, storeyId);
    model.addClassification({ system: 'OmniClass', code: '21-02 10 10' }, [wall.value]);

    const result = await toIfc(model, META);
    if (!result.ok) throw new Error(result.error.message);
    const { api, mid } = await openModel(result.value);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCRELASSOCIATESCLASSIFICATION).size()).toBe(1);
    api.CloseModel(mid);
  });

  it('keeps the bare-material path for walls without layers (backward compat)', async () => {
    const { model, storeyId } = spatialModel();
    const wall = model.addWall({
      length: 5000, height: 3000, thickness: 250,
      origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
      materialName: 'Concrete',
    });
    if (!wall.ok) throw new Error(wall.error.message);
    model.placeIn(wall.value, storeyId);

    const result = await toIfc(model, META);
    if (!result.ok) throw new Error(result.error.message);
    const { api, mid } = await openModel(result.value);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCMATERIALLAYERSET).size()).toBe(0);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCMATERIAL).size()).toBe(1);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCRELASSOCIATESMATERIAL).size()).toBe(1);
    api.CloseModel(mid);
  });
});
