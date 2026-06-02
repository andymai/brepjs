import { describe, it, expect, beforeAll } from 'vitest';
import * as WebIFC from 'web-ifc';
import { initOCCT } from '../../../tests/setup.js';
import { measureVolume } from 'brepjs';
import { roofToSolid } from '../src/elementFns/roofFns.js';
import { parseRoofSpec } from '../src/specs/roofSpec.js';
import type { RoofSpec } from '../src/specs/roofSpec.js';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import { writeRoofEntity, writeRoofType } from '../src/ifc-writer/roofWriter.js';
import { deriveIfcGuidSync } from '../src/identity/guidDerivation.js';
import { newIfcGuid } from '../src/identity/ifcGuid.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const spec: RoofSpec = {
  length: 6000,
  width: 4000,
  thickness: 250,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'FLAT_ROOF',
  materialName: 'Concrete',
};

describe('roofToSolid', () => {
  it('returns a ValidSolid', () => {
    const result = roofToSolid(spec);
    expect(result.ok).toBe(true);
  });

  it('volume matches length × width × thickness in mm³', () => {
    const result = roofToSolid(spec);
    if (!result.ok) throw new Error(result.error.message);
    const vol = measureVolume(result.value);
    if (!vol.ok) throw new Error(vol.error.message);
    const expected = 6000 * 4000 * 250;
    expect(vol.value).toBeCloseTo(expected, -3);
  });

  it('produces a valid solid for a pitched (simplified) predefined type', () => {
    const result = roofToSolid({ ...spec, predefinedType: 'GABLE_ROOF' });
    if (!result.ok) throw new Error(result.error.message);
    const vol = measureVolume(result.value);
    if (!vol.ok) throw new Error(vol.error.message);
    expect(vol.value).toBeGreaterThan(0);
  });

  it('rejects zero length', () => {
    const result = roofToSolid({ ...spec, length: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('BIM_SPEC');
    expect(result.error.code).toBe('ROOF_ZERO_LENGTH');
  });

  it('rejects zero width', () => {
    const result = roofToSolid({ ...spec, width: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ROOF_ZERO_WIDTH');
  });

  it('rejects negative thickness', () => {
    const result = roofToSolid({ ...spec, thickness: -1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ROOF_ZERO_THICKNESS');
  });
});

describe('parseRoofSpec', () => {
  const valid = {
    length: 6000,
    width: 4000,
    thickness: 250,
    origin: [0, 0, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Concrete',
  };

  it('accepts a valid spec', () => {
    expect(parseRoofSpec(valid).ok).toBe(true);
  });

  it('defaults predefinedType to NOTDEFINED when omitted', () => {
    const result = parseRoofSpec(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.predefinedType).toBe('NOTDEFINED');
  });

  it('accepts each valid RoofTypeEnum value', () => {
    const types = [
      'FLAT_ROOF',
      'SHED_ROOF',
      'GABLE_ROOF',
      'HIP_ROOF',
      'BARREL_ROOF',
      'DOME_ROOF',
      'FREEFORM',
      'NOTDEFINED',
    ];
    for (const predefinedType of types) {
      expect(parseRoofSpec({ ...valid, predefinedType }).ok).toBe(true);
    }
  });

  it('rejects an unknown predefinedType', () => {
    const result = parseRoofSpec({ ...valid, predefinedType: 'NOPE_ROOF' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ROOF_SPEC');
  });

  it('rejects non-unit axisX', () => {
    const result = parseRoofSpec({ ...valid, axisX: [2, 0, 0] });
    expect(result.ok).toBe(false);
  });

  it('rejects non-orthogonal axes', () => {
    const result = parseRoofSpec({ ...valid, axisX: [1, 0, 0], axisZ: [1, 0, 0] });
    expect(result.ok).toBe(false);
  });

  it('rejects zero or negative dimensions', () => {
    expect(parseRoofSpec({ ...valid, length: 0 }).ok).toBe(false);
    expect(parseRoofSpec({ ...valid, width: -1 }).ok).toBe(false);
    expect(parseRoofSpec({ ...valid, thickness: 0 }).ok).toBe(false);
  });

  it('rejects missing required fields', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { materialName: _, ...noMaterial } = valid;
    expect(parseRoofSpec(noMaterial).ok).toBe(false);
  });

  it('accepts spec with Pset_RoofCommon fields', () => {
    const result = parseRoofSpec({
      ...valid,
      isExternal: true,
      fireRating: 'REI60',
      thermalTransmittance: 0.2,
      status: 'NEW',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isExternal).toBe(true);
    expect(result.value.thermalTransmittance).toBe(0.2);
  });
});

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

async function openSaved(w: IfcWriter): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
  const saved = w.save();
  if (!saved.ok) throw new Error(saved.error.message);
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const mid = api.OpenModel(saved.value);
  return { api, mid };
}

describe('roofWriter serialization', () => {
  it('writes an IfcRoof that round-trips with the correct PredefinedType', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const guid = deriveIfcGuidSync('elem:ROOF:1');
    const roofId = writeRoofEntity(w, guid, 'Roof', 'GABLE_ROOF', oh, null, null);
    expect(roofId).toBeGreaterThan(0);

    const { api, mid } = await openSaved(w);
    const roofIds = api.GetLineIDsWithType(mid, WebIFC.IFCROOF);
    expect(roofIds.size()).toBe(1);

    const roof = api.GetLine(mid, roofIds.get(0)) as Record<string, unknown>;
    const predefined = (roof['PredefinedType'] as { value?: string } | undefined)?.value;
    expect(predefined).toBe('GABLE_ROOF');
    api.CloseModel(mid);
  });

  it('writes an IfcRoofType plus IfcRelDefinesByType linking the occurrence', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const guid = deriveIfcGuidSync('elem:ROOF:1');
    const roofId = writeRoofEntity(w, guid, 'Roof', 'FLAT_ROOF', oh, null, null);
    const typeGuid = deriveIfcGuidSync('type:ROOF:FLAT_ROOF');
    const relGuid = deriveIfcGuidSync('rel-type:ROOF:FLAT_ROOF');

    const res = writeRoofType(w, oh, typeGuid, relGuid, 'FLAT_ROOF', [roofId]);
    expect(res.typeExpressId).toBeGreaterThan(0);
    expect(res.relExpressId).toBeGreaterThan(0);

    const { api, mid } = await openSaved(w);
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCROOFTYPE).size()).toBe(1);

    const relIds = api.GetLineIDsWithType(mid, WebIFC.IFCRELDEFINESBYTYPE);
    expect(relIds.size()).toBe(1);
    const rel = api.GetLine(mid, relIds.get(0)) as Record<string, unknown>;
    const related = (rel['RelatedObjects'] ?? []) as Array<{ value: number }>;
    expect(related).toHaveLength(1);
    const relating = (rel['RelatingType'] as { value?: number } | undefined)?.value;
    expect(relating).toBe(res.typeExpressId);
    api.CloseModel(mid);
  });

  it('emits a non-null Representation when a shape is supplied', async () => {
    const w = await makeWriter();
    const oh = writeOwnerHistory(w);
    const guid = newIfcGuid();
    // A placeholder representation reference id; the writer must pass it through.
    const roofId = writeRoofEntity(w, guid, 'Roof', 'FLAT_ROOF', oh, null, oh);
    const { api, mid } = await openSaved(w);
    const roof = api.GetLine(mid, roofId) as Record<string, unknown>;
    expect(roof['Representation']).not.toBeNull();
    api.CloseModel(mid);
  });
});
