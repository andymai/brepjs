import { describe, it, expect } from 'vitest';
import * as WebIFC from 'web-ifc';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import {
  writeRelConnectsElements,
  writeRelConnectsPathElements,
} from '../src/ifc-writer/connectivityWriter.js';
import { deriveIfcGuidSync, makeRelKey } from '../src/identity/guidDerivation.js';
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

describe('connectivityWriter', () => {
  it('writes an IfcRelConnectsElements referencing relating and related elements', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const a = writeWall(w, oh);
    const b = writeWall(w, oh);
    const guid = deriveIfcGuidSync(makeRelKey('connects-elements', 1));

    writeRelConnectsElements(w, guid, oh, a, b);

    const { api, mid } = await openSaved(w);
    const relIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELCONNECTSELEMENTS);
    expect(relIds.size()).toBe(1);
    const rel = api.GetLine(mid, relIds.get(0)) as Record<string, unknown>;
    expect((rel['RelatingElement'] as { value?: number } | undefined)?.value).toBe(a);
    expect((rel['RelatedElement'] as { value?: number } | undefined)?.value).toBe(b);
    expect((rel['GlobalId'] as { value?: string } | undefined)?.value).toBe(guid);
    expect((rel['GlobalId'] as { value?: string } | undefined)?.value?.length).toBe(22);
    api.CloseModel(mid);
  });

  it('writes an IfcRelConnectsPathElements with start/end connection types', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const a = writeWall(w, oh);
    const b = writeWall(w, oh);
    const guid = deriveIfcGuidSync(makeRelKey('connects-path-elements', 1));

    writeRelConnectsPathElements(w, guid, oh, a, b, 'ATEND', 'ATSTART');

    const { api, mid } = await openSaved(w);
    const relIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELCONNECTSPATHELEMENTS);
    expect(relIds.size()).toBe(1);
    const rel = api.GetLine(mid, relIds.get(0)) as Record<string, unknown>;
    expect((rel['RelatingElement'] as { value?: number } | undefined)?.value).toBe(a);
    expect((rel['RelatedElement'] as { value?: number } | undefined)?.value).toBe(b);
    expect((rel['RelatingPriorities'] ?? []).length ?? 0).toBe(0);
    expect((rel['RelatedPriorities'] ?? []).length ?? 0).toBe(0);
    expect((rel['RelatedConnectionType'] as { value?: string } | undefined)?.value).toBe('ATSTART');
    expect((rel['RelatingConnectionType'] as { value?: string } | undefined)?.value).toBe('ATEND');
    api.CloseModel(mid);
  });

  it('derives deterministic GlobalIds for identical connectivity rel keys', () => {
    const a = deriveIfcGuidSync(makeRelKey('connects-elements', 5));
    const b = deriveIfcGuidSync(makeRelKey('connects-elements', 5));
    expect(a).toBe(b);
    expect(a.length).toBe(22);
  });
});
