import { describe, it, expect } from 'vitest';
import * as WebIFC from 'web-ifc';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import {
  writeElementAssemblyEntity,
  writeRelAggregatesElements,
  writeRelNests,
} from '../src/ifc-writer/assemblyWriter.js';
import { deriveIfcGuidSync, makeElementKey, makeRelKey } from '../src/identity/guidDerivation.js';
import { newIfcGuid } from '../src/identity/ifcGuid.js';

async function makeWriter(): Promise<IfcWriter> {
  const result = await IfcWriter.create();
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

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

function writeBeam(w: IfcWriter, ownerHistoryId: number): number {
  return w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCBEAM,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, newIfcGuid()),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, 'Beam'),
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

describe('assemblyWriter', () => {
  it('writes an IfcElementAssembly with predefined/assembly types and a null representation', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const guid = deriveIfcGuidSync(makeElementKey('ELEMENT_ASSEMBLY', 1));

    const id = writeElementAssemblyEntity(w, guid, 'Truss A', 'TRUSS', oh, null, null);

    const { api, mid } = await openSaved(w);
    const ids = api.GetLineIDsWithType(mid, WebIFC.IFCELEMENTASSEMBLY);
    expect(ids.size()).toBe(1);
    expect(ids.get(0)).toBe(id);
    const line = api.GetLine(mid, id) as Record<string, unknown>;
    expect((line['Name'] as { value?: string } | undefined)?.value).toBe('Truss A');
    expect((line['PredefinedType'] as { value?: string } | undefined)?.value).toBe('TRUSS');
    expect(line['Representation']).toBeNull();
    expect((line['GlobalId'] as { value?: string } | undefined)?.value).toBe(guid);
    api.CloseModel(mid);
  });

  it('aggregates child elements under an assembly via IfcRelAggregates referencing both ends', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const assemblyGuid = deriveIfcGuidSync(makeElementKey('ELEMENT_ASSEMBLY', 2));
    const assembly = writeElementAssemblyEntity(w, assemblyGuid, 'Frame', 'RIGID_FRAME', oh, null, null);
    const memberA = writeBeam(w, oh);
    const memberB = writeBeam(w, oh);

    const relGuid = deriveIfcGuidSync(makeRelKey('aggregates', 2));
    writeRelAggregatesElements(w, relGuid, oh, assembly, [memberA, memberB]);

    const { api, mid } = await openSaved(w);
    const relIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELAGGREGATES);
    expect(relIds.size()).toBe(1);
    const rel = api.GetLine(mid, relIds.get(0)) as Record<string, unknown>;
    expect((rel['RelatingObject'] as { value?: number } | undefined)?.value).toBe(assembly);
    const related = (rel['RelatedObjects'] ?? []) as Array<{ value: number }>;
    expect(related.map((r) => r.value).sort()).toEqual([memberA, memberB].sort());
    expect((rel['GlobalId'] as { value?: string } | undefined)?.value).toBe(relGuid);
    api.CloseModel(mid);
  });

  it('nests ordered child elements under a parent via IfcRelNests referencing both ends', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const parentGuid = deriveIfcGuidSync(makeElementKey('ELEMENT_ASSEMBLY', 3));
    const parent = writeElementAssemblyEntity(w, parentGuid, 'Nest', 'NOTDEFINED', oh, null, null);
    const childA = writeBeam(w, oh);
    const childB = writeBeam(w, oh);

    const relGuid = deriveIfcGuidSync(makeRelKey('nests', 3));
    writeRelNests(w, relGuid, oh, parent, [childA, childB]);

    const { api, mid } = await openSaved(w);
    const relIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELNESTS);
    expect(relIds.size()).toBe(1);
    const rel = api.GetLine(mid, relIds.get(0)) as Record<string, unknown>;
    expect((rel['RelatingObject'] as { value?: number } | undefined)?.value).toBe(parent);
    const related = (rel['RelatedObjects'] ?? []) as Array<{ value: number }>;
    // IfcRelNests preserves order.
    expect(related.map((r) => r.value)).toEqual([childA, childB]);
    expect((rel['GlobalId'] as { value?: string } | undefined)?.value).toBe(relGuid);
    api.CloseModel(mid);
  });

  it('derives deterministic GlobalIds for identical assembly/rel keys', () => {
    const a = deriveIfcGuidSync(makeElementKey('ELEMENT_ASSEMBLY', 7));
    const b = deriveIfcGuidSync(makeElementKey('ELEMENT_ASSEMBLY', 7));
    expect(a).toBe(b);
    expect(a.length).toBe(22);
  });
});
