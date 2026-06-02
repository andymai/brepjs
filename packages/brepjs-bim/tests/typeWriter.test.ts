import { describe, it, expect } from 'vitest';
import * as WebIFC from 'web-ifc';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import { writeIfcType } from '../src/ifc-writer/typeWriter.js';
import { deriveIfcGuid } from '../src/identity/guidDerivation.js';
import { newIfcGuid } from '../src/identity/ifcGuid.js';
import { isValidIfcGuid } from '../src/identity/ifcGuid.js';

async function makeWriter(): Promise<IfcWriter> {
  const result = await IfcWriter.create();
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

// Minimal occurrence + owner history so type/rel entities have valid references.
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

async function openSaved(
  w: IfcWriter
): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
  const saved = w.save();
  if (!saved.ok) throw new Error(saved.error.message);
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const mid = api.OpenModel(saved.value);
  return { api, mid };
}

describe('typeWriter', () => {
  it('writes an IfcWallType and IfcRelDefinesByType linking two walls', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const wall1 = writeWall(w, oh);
    const wall2 = writeWall(w, oh);
    const typeGuid = await deriveIfcGuid('type:WALL:NOTDEFINED');
    const relGuid = await deriveIfcGuid('rel-type:WALL:NOTDEFINED');

    const res = writeIfcType(w, oh, 'IFCWALLTYPE', typeGuid, relGuid, 'NOTDEFINED', [
      wall1,
      wall2,
    ]);
    expect(res.typeExpressId).toBeGreaterThan(0);
    expect(res.relExpressId).toBeGreaterThan(0);

    const { api, mid } = await openSaved(w);
    const typeIds = api.GetLineIDsWithType(mid, WebIFC.IFCWALLTYPE);
    expect(typeIds.size()).toBe(1);

    const relIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELDEFINESBYTYPE);
    expect(relIds.size()).toBe(1);

    const rel = api.GetLine(mid, relIds.get(0)) as Record<string, unknown>;
    const related = (rel['RelatedObjects'] ?? []) as Array<{ value: number }>;
    expect(related).toHaveLength(2);
    const relating = (rel['RelatingType'] as { value?: number } | undefined)?.value;
    expect(relating).toBe(res.typeExpressId);

    api.CloseModel(mid);
  });

  it('writes distinct types for wall and slab', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const wall = writeWall(w, oh);
    const wallTypeGuid = await deriveIfcGuid('type:WALL:NOTDEFINED');
    const wallRelGuid = await deriveIfcGuid('rel-type:WALL:NOTDEFINED');
    const slabTypeGuid = await deriveIfcGuid('type:SLAB:FLOOR');
    const slabRelGuid = await deriveIfcGuid('rel-type:SLAB:FLOOR');

    writeIfcType(w, oh, 'IFCWALLTYPE', wallTypeGuid, wallRelGuid, 'NOTDEFINED', [wall]);
    writeIfcType(w, oh, 'IFCSLABTYPE', slabTypeGuid, slabRelGuid, 'FLOOR', [wall]);

    const { api, mid } = await openSaved(w);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCWALLTYPE).size()).toBe(1);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCSLABTYPE).size()).toBe(1);
    api.CloseModel(mid);
  });

  it('writes beam, column, door and window types', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const occ = writeWall(w, oh);

    const cases: Array<[Parameters<typeof writeIfcType>[2], number]> = [
      ['IFCBEAMTYPE', WebIFC.IFCBEAMTYPE],
      ['IFCCOLUMNTYPE', WebIFC.IFCCOLUMNTYPE],
      ['IFCDOORTYPE', WebIFC.IFCDOORTYPE],
      ['IFCWINDOWTYPE', WebIFC.IFCWINDOWTYPE],
    ];
    for (const [name] of cases) {
      const tGuid = await deriveIfcGuid(`type:${name}:NOTDEFINED`);
      const rGuid = await deriveIfcGuid(`rel-type:${name}:NOTDEFINED`);
      writeIfcType(w, oh, name, tGuid, rGuid, 'NOTDEFINED', [occ]);
    }

    const { api, mid } = await openSaved(w);
    for (const [, typeConst] of cases) {
      expect(api.GetLineIDsWithType(mid, typeConst).size()).toBe(1);
    }
    api.CloseModel(mid);
  });

  it('emits a valid 22-char IfcGuid on the type object', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const wall = writeWall(w, oh);
    const typeGuid = await deriveIfcGuid('type:WALL:NOTDEFINED');
    const relGuid = await deriveIfcGuid('rel-type:WALL:NOTDEFINED');
    expect(isValidIfcGuid(typeGuid)).toBe(true);

    writeIfcType(w, oh, 'IFCWALLTYPE', typeGuid, relGuid, 'NOTDEFINED', [wall]);

    const { api, mid } = await openSaved(w);
    const typeIds = api.GetLineIDsWithType(mid, WebIFC.IFCWALLTYPE);
    const typeObj = api.GetLine(mid, typeIds.get(0)) as Record<string, unknown>;
    const guid = (typeObj['GlobalId'] as { value?: string } | undefined)?.value;
    expect(typeof guid).toBe('string');
    expect((guid as string).length).toBe(22);
    api.CloseModel(mid);
  });
});
