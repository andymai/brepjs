import { describe, it, expect } from 'vitest';
import * as WebIFC from 'web-ifc';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import {
  writeMaterialLayerSet,
  writeMaterialSimple,
  type MaterialLayerSetSpec,
} from '../src/ifc-writer/materialWriter.js';
import { deriveIfcGuid } from '../src/identity/guidDerivation.js';
import { newIfcGuid } from '../src/identity/ifcGuid.js';

async function makeWriter(): Promise<IfcWriter> {
  const result = await IfcWriter.create();
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

// Minimal owner history + element occurrences so the association rel has valid refs.
function writeOwnerHistory(w: IfcWriter): number {
  const personId = w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCPERSON,
    Identification: null,
    FamilyName: null,
    GivenName: null,
    MiddleNames: null,
    PrefixTitles: null,
    SuffixTitles: null,
    Roles: null,
    Addresses: null,
  });
  const orgId = w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCORGANIZATION,
    Identification: null,
    Name: w.mkType(WebIFC.IFCLABEL, 'brepjs-bim'),
    Description: null,
    Roles: null,
    Addresses: null,
  });
  const personAndOrgId = w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCPERSONANDORGANIZATION,
    ThePerson: w.ref(personId),
    TheOrganization: w.ref(orgId),
    Roles: null,
  });
  const appId = w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCAPPLICATION,
    ApplicationDeveloper: w.ref(orgId),
    Version: w.mkType(WebIFC.IFCLABEL, '0'),
    ApplicationFullName: w.mkType(WebIFC.IFCLABEL, 'brepjs-bim-test'),
    ApplicationIdentifier: w.mkType(WebIFC.IFCIDENTIFIER, 'brepjs-bim-test'),
  });
  return w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCOWNERHISTORY,
    OwningUser: w.ref(personAndOrgId),
    OwningApplication: w.ref(appId),
    State: null,
    ChangeAction: { type: 3, value: 'NOCHANGE' },
    LastModifiedDate: null,
    LastModifyingUser: null,
    LastModifyingApplication: null,
    CreationDate: w.mkType(WebIFC.IFCTIMESTAMP, 0),
  });
}

function writeWall(w: IfcWriter, ownerHistoryId: number): number {
  return w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCWALL,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, newIfcGuid()),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, 'Wall'),
    Description: null,
    ObjectType: null,
    ObjectPlacement: null,
    Representation: null,
    Tag: null,
    PredefinedType: null,
  });
}

async function openSaved(w: IfcWriter): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
  const saved = w.save();
  if (!saved.ok) throw new Error(saved.error.message);
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const mid = api.OpenModel(saved.value);
  return { api, mid };
}

const LAYERED_WALL: MaterialLayerSetSpec = {
  kind: 'LAYER_SET',
  layerSetName: 'Exterior Wall - 250mm',
  layers: [
    { name: 'Brick', thicknessMm: 100 },
    { name: 'Air Gap', thicknessMm: 25, isVentilated: true },
    { name: 'Insulation', thicknessMm: 50, priority: 1 },
    { name: 'Concrete Block', thicknessMm: 75 },
  ],
  offsetFromReferenceLine: 0,
};

describe('materialWriter', () => {
  it('serializes a layered wall material set without throwing', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const wall = writeWall(w, oh);
    const guid = await deriveIfcGuid('rel-material:layered-wall');

    const relId = writeMaterialLayerSet(w, guid, oh, LAYERED_WALL, [wall]);
    expect(relId).toBeGreaterThan(0);

    const { api, mid } = await openSaved(w);

    const layerSetIds = api.GetLineIDsWithType(mid, WebIFC.IFCMATERIALLAYERSET);
    expect(layerSetIds.size()).toBe(1);

    const layerIds = api.GetLineIDsWithType(mid, WebIFC.IFCMATERIALLAYER);
    expect(layerIds.size()).toBe(LAYERED_WALL.layers.length);

    const usageIds = api.GetLineIDsWithType(mid, WebIFC.IFCMATERIALLAYERSETUSAGE);
    expect(usageIds.size()).toBe(1);

    api.CloseModel(mid);
  });

  it('layer set carries the layer names and thicknesses', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const wall = writeWall(w, oh);
    const guid = await deriveIfcGuid('rel-material:layered-wall-2');

    writeMaterialLayerSet(w, guid, oh, LAYERED_WALL, [wall]);

    const { api, mid } = await openSaved(w);
    const layerIds = api.GetLineIDsWithType(mid, WebIFC.IFCMATERIALLAYER);
    const thicknesses: number[] = [];
    for (let i = 0; i < layerIds.size(); i++) {
      const layer = api.GetLine(mid, layerIds.get(i)) as Record<string, unknown>;
      const t = (layer['LayerThickness'] as { value?: number } | undefined)?.value;
      if (typeof t === 'number') thicknesses.push(t);
    }
    // Thicknesses are emitted in metres (mm / 1000).
    expect(thicknesses).toContain(0.1);
    expect(thicknesses).toContain(0.05);
    api.CloseModel(mid);
  });

  it('association rel references the related element(s)', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const wallA = writeWall(w, oh);
    const wallB = writeWall(w, oh);
    const guid = await deriveIfcGuid('rel-material:layered-wall-multi');

    writeMaterialLayerSet(w, guid, oh, LAYERED_WALL, [wallA, wallB]);

    const { api, mid } = await openSaved(w);
    const relIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELASSOCIATESMATERIAL);
    expect(relIds.size()).toBe(1);

    const rel = api.GetLine(mid, relIds.get(0)) as Record<string, unknown>;
    const related = (rel['RelatedObjects'] ?? []) as Array<{ value: number }>;
    const relatedIds = related.map((r) => r.value);
    expect(relatedIds).toContain(wallA);
    expect(relatedIds).toContain(wallB);

    // The rel must point its RelatingMaterial at the IfcMaterialLayerSetUsage.
    const usageIds = api.GetLineIDsWithType(mid, WebIFC.IFCMATERIALLAYERSETUSAGE);
    const relatingMaterial = (rel['RelatingMaterial'] as { value?: number } | undefined)?.value;
    expect(relatingMaterial).toBe(usageIds.get(0));

    // GUID is the deterministic one we passed in.
    const relGuid = (rel['GlobalId'] as { value?: string } | undefined)?.value;
    expect(relGuid).toBe(guid);
    api.CloseModel(mid);
  });

  it('empty layer list writes nothing and returns 0', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const wall = writeWall(w, oh);
    const guid = await deriveIfcGuid('rel-material:empty');

    const relId = writeMaterialLayerSet(
      w,
      guid,
      oh,
      { kind: 'LAYER_SET', layerSetName: 'Empty', layers: [] },
      [wall]
    );
    expect(relId).toBe(0);

    const { api, mid } = await openSaved(w);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCMATERIALLAYERSET).size()).toBe(0);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCRELASSOCIATESMATERIAL).size()).toBe(0);
    api.CloseModel(mid);
  });

  it('writeMaterialSimple emits a bare IfcMaterial and association rel', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const wall = writeWall(w, oh);
    const guid = await deriveIfcGuid('rel-material:simple');

    writeMaterialSimple(w, guid, oh, 'Concrete', [wall]);

    const { api, mid } = await openSaved(w);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCMATERIAL).size()).toBe(1);
    const relIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELASSOCIATESMATERIAL);
    expect(relIds.size()).toBe(1);

    const rel = api.GetLine(mid, relIds.get(0)) as Record<string, unknown>;
    const related = (rel['RelatedObjects'] ?? []) as Array<{ value: number }>;
    expect(related.map((r) => r.value)).toContain(wall);
    api.CloseModel(mid);
  });
});
