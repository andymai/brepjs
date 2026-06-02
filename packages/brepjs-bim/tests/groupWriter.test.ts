import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import * as WebIFC from 'web-ifc';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import { writeHeader } from '../src/ifc-writer/headerWriter.js';
import {
  writeZoneEntity,
  writeSystemEntity,
  writeRelAssignsToGroup,
} from '../src/ifc-writer/groupWriter.js';
import { parseZoneSpec, parseSystemSpec } from '../src/specs/groupSpec.js';
import { deriveIfcGuidSync } from '../src/identity/guidDerivation.js';

beforeAll(async () => { await initOCCT(); }, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

describe('groupSpec', () => {
  it('parses a minimal zone spec', () => {
    const result = parseZoneSpec({ name: 'Thermal Zone A' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Thermal Zone A');
  });

  it('parses a full zone spec with optional fields', () => {
    const result = parseZoneSpec({
      name: 'Zone A',
      longName: 'Northern Thermal Zone A',
      description: 'Top-floor thermal grouping',
      objectType: 'ThermalZone',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.longName).toBe('Northern Thermal Zone A');
    expect(result.value.objectType).toBe('ThermalZone');
  });

  it('rejects a zone spec with an empty name', () => {
    const result = parseZoneSpec({ name: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('BIM_SPEC');
    expect(result.error.code).toBe('INVALID_ZONE_SPEC');
  });

  it('parses a minimal system spec', () => {
    const result = parseSystemSpec({ name: 'HVAC Supply' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('HVAC Supply');
  });

  it('rejects a system spec with an empty name', () => {
    const result = parseSystemSpec({ name: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_SYSTEM_SPEC');
  });
});

describe('groupWriter', () => {
  it('assigns spaces to a zone with correct IfcRelAssignsToGroup references', async () => {
    const created = await IfcWriter.create();
    if (!created.ok) throw new Error(created.error.message);
    const w = created.value;
    const { ownerHistoryId } = writeHeader(w, META);

    // Two spatial-ish members standing in for spaces (use IfcSpace minimal lines).
    const spaceAId = writeMinimalSpace(w, ownerHistoryId, 'Space A');
    const spaceBId = writeMinimalSpace(w, ownerHistoryId, 'Space B');

    const zoneGuid = deriveIfcGuidSync('test:zone:1');
    const zoneId = writeZoneEntity(w, zoneGuid, 'Thermal Zone A', 'Top Floor Thermal Zone', null, ownerHistoryId);

    const relGuid = deriveIfcGuidSync('test:rel:zone:1');
    writeRelAssignsToGroup(w, relGuid, ownerHistoryId, zoneId, [spaceAId, spaceBId]);

    const saved = w.save();
    if (!saved.ok) throw new Error(saved.error.message);

    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(saved.value);

    const zoneIds = api.GetLineIDsWithType(mid, WebIFC.IFCZONE);
    expect(zoneIds.size()).toBe(1);
    const zone = api.GetLine(mid, zoneIds.get(0)) as Record<string, unknown>;
    expect((zone['GlobalId'] as { value?: string } | undefined)?.value).toBe(zoneGuid);
    expect((zone['Name'] as { value?: string } | undefined)?.value).toBe('Thermal Zone A');

    const rels = api.GetLineIDsWithType(mid, WebIFC.IFCRELASSIGNSTOGROUP);
    expect(rels.size()).toBe(1);
    const rel = api.GetLine(mid, rels.get(0)) as Record<string, unknown>;

    const relatingGroup = (rel['RelatingGroup'] as { value?: number } | undefined)?.value;
    expect(relatingGroup).toBe(zoneIds.get(0));

    const relatedObjects = rel['RelatedObjects'] as Array<{ value?: number }>;
    const memberIds = relatedObjects.map((h) => h.value);
    expect(memberIds).toContain(spaceAId);
    expect(memberIds).toContain(spaceBId);
    expect(memberIds.length).toBe(2);

    expect((rel['GlobalId'] as { value?: string } | undefined)?.value).toBe(relGuid);
    api.CloseModel(mid);
  });

  it('assigns elements to a system with correct IfcRelAssignsToGroup references', async () => {
    const created = await IfcWriter.create();
    if (!created.ok) throw new Error(created.error.message);
    const w = created.value;
    const { ownerHistoryId } = writeHeader(w, META);

    const elemAId = writeMinimalProxy(w, ownerHistoryId, 'Duct 1');
    const elemBId = writeMinimalProxy(w, ownerHistoryId, 'Duct 2');

    const sysGuid = deriveIfcGuidSync('test:system:1');
    const systemId = writeSystemEntity(w, sysGuid, 'HVAC Supply', 'Supply Air System', null, ownerHistoryId);

    const relGuid = deriveIfcGuidSync('test:rel:system:1');
    writeRelAssignsToGroup(w, relGuid, ownerHistoryId, systemId, [elemAId, elemBId]);

    const saved = w.save();
    if (!saved.ok) throw new Error(saved.error.message);

    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(saved.value);

    const sysIds = api.GetLineIDsWithType(mid, WebIFC.IFCSYSTEM);
    expect(sysIds.size()).toBe(1);
    const system = api.GetLine(mid, sysIds.get(0)) as Record<string, unknown>;
    expect((system['Name'] as { value?: string } | undefined)?.value).toBe('HVAC Supply');

    const rels = api.GetLineIDsWithType(mid, WebIFC.IFCRELASSIGNSTOGROUP);
    expect(rels.size()).toBe(1);
    const rel = api.GetLine(mid, rels.get(0)) as Record<string, unknown>;

    expect((rel['RelatingGroup'] as { value?: number } | undefined)?.value).toBe(sysIds.get(0));
    const memberIds = (rel['RelatedObjects'] as Array<{ value?: number }>).map((h) => h.value);
    expect(memberIds).toEqual([elemAId, elemBId]);
    api.CloseModel(mid);
  });

  it('writes an objectType on the zone when provided', async () => {
    const created = await IfcWriter.create();
    if (!created.ok) throw new Error(created.error.message);
    const w = created.value;
    const { ownerHistoryId } = writeHeader(w, META);

    const zoneGuid = deriveIfcGuidSync('test:zone:typed');
    writeZoneEntity(w, zoneGuid, 'Zone X', null, 'ThermalZone', ownerHistoryId);

    const saved = w.save();
    if (!saved.ok) throw new Error(saved.error.message);

    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(saved.value);
    const zoneIds = api.GetLineIDsWithType(mid, WebIFC.IFCZONE);
    const zone = api.GetLine(mid, zoneIds.get(0)) as Record<string, unknown>;
    expect((zone['ObjectType'] as { value?: string } | undefined)?.value).toBe('ThermalZone');
    api.CloseModel(mid);
  });
});

function writeMinimalSpace(w: IfcWriter, ownerHistoryId: number, name: string): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCSPACE,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, deriveIfcGuidSync(`test:space:${name}`)),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: null,
    Representation: null,
    LongName: null,
    CompositionType: { type: 3, value: 'ELEMENT' },
    PredefinedType: { type: 3, value: 'SPACE' },
    ElevationWithFlooring: null,
  });
  return id;
}

function writeMinimalProxy(w: IfcWriter, ownerHistoryId: number, name: string): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCBUILDINGELEMENTPROXY,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, deriveIfcGuidSync(`test:proxy:${name}`)),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: null,
    Representation: null,
    Tag: null,
    PredefinedType: { type: 3, value: 'NOTDEFINED' },
  });
  return id;
}
