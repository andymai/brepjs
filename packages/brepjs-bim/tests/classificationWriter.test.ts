import { describe, it, expect } from 'vitest';
import * as WebIFC from 'web-ifc';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import { writeClassificationRefs } from '../src/ifc-writer/classificationWriter.js';
import type { ClassificationRef } from '../src/types/classificationTypes.js';
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

describe('classificationWriter', () => {
  it('serializes an IfcClassificationReference with code and links the element via IfcRelAssociatesClassification', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const wall = writeWall(w, oh);

    const ref: ClassificationRef = {
      system: 'Uniclass2015',
      edition: '2015',
      location: 'https://uniclass.thenbs.com/',
      code: 'Ss_15_10_30_14',
      description: 'Concrete wall systems',
    };
    const refs = new Map<ClassificationRef, readonly number[]>([[ref, [wall]]]);

    writeClassificationRefs(w, oh, refs);

    const { api, mid } = await openSaved(w);

    // One classification system entity.
    const classifications = api.GetLineIDsWithType(mid, WebIFC.IFCCLASSIFICATION);
    expect(classifications.size()).toBe(1);
    const classification = api.GetLine(mid, classifications.get(0)) as Record<string, unknown>;
    expect((classification['Name'] as { value?: string } | undefined)?.value).toBe('Uniclass2015');

    // One classification reference, carrying the code in Identification.
    const refIds = api.GetLineIDsWithType(mid, WebIFC.IFCCLASSIFICATIONREFERENCE);
    expect(refIds.size()).toBe(1);
    const classRef = api.GetLine(mid, refIds.get(0)) as Record<string, unknown>;
    expect((classRef['Identification'] as { value?: string } | undefined)?.value).toBe(
      'Ss_15_10_30_14'
    );
    const referencedSource = (classRef['ReferencedSource'] as { value?: number } | undefined)
      ?.value;
    expect(referencedSource).toBe(classifications.get(0));

    // The association rel points at the wall and at the reference.
    const relIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELASSOCIATESCLASSIFICATION);
    expect(relIds.size()).toBe(1);
    const rel = api.GetLine(mid, relIds.get(0)) as Record<string, unknown>;
    const related = (rel['RelatedObjects'] ?? []) as Array<{ value: number }>;
    expect(related.map((r) => r.value)).toContain(wall);
    const relatingClassification = (
      rel['RelatingClassification'] as { value?: number } | undefined
    )?.value;
    expect(relatingClassification).toBe(refIds.get(0));

    // The rel carries a valid 22-char deterministic GlobalId.
    const relGuid = (rel['GlobalId'] as { value?: string } | undefined)?.value;
    expect(typeof relGuid).toBe('string');
    expect((relGuid as string).length).toBe(22);

    api.CloseModel(mid);
  });

  it('deduplicates IfcClassification by system across multiple references', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const wallA = writeWall(w, oh);
    const wallB = writeWall(w, oh);

    const refA: ClassificationRef = { system: 'Uniclass2015', code: 'Ss_15_10_30_14' };
    const refB: ClassificationRef = { system: 'Uniclass2015', code: 'Ss_20_05_15' };
    const refs = new Map<ClassificationRef, readonly number[]>([
      [refA, [wallA]],
      [refB, [wallB]],
    ]);

    writeClassificationRefs(w, oh, refs);

    const { api, mid } = await openSaved(w);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCCLASSIFICATION).size()).toBe(1);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCCLASSIFICATIONREFERENCE).size()).toBe(2);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCRELASSOCIATESCLASSIFICATION).size()).toBe(2);
    api.CloseModel(mid);
  });

  it('produces deterministic rel GlobalIds across two writes of the same refs', async () => {
    const ref: ClassificationRef = { system: 'OmniClass', code: '23-13 11 11' };

    const guidsFor = async (): Promise<string[]> => {
      const w = await makeWriter();
      const oh = writeOwnerHistory(w);
      const wall = writeWall(w, oh);
      writeClassificationRefs(
        w,
        oh,
        new Map<ClassificationRef, readonly number[]>([[ref, [wall]]])
      );
      const { api, mid } = await openSaved(w);
      const relIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELASSOCIATESCLASSIFICATION);
      const rel = api.GetLine(mid, relIds.get(0)) as Record<string, unknown>;
      const guid = (rel['GlobalId'] as { value?: string } | undefined)?.value ?? '';
      api.CloseModel(mid);
      return [guid];
    };

    expect(await guidsFor()).toEqual(await guidsFor());
  });
});
