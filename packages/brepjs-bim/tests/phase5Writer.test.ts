import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import * as WebIFC from 'web-ifc';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import type { BimModelMeta } from '../src/ifc-writer/headerWriter.js';

beforeAll(async () => { await initOCCT(); }, 30000);

const META: BimModelMeta = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

function buildModel(): BimModel {
  const model = new BimModel();
  const initResult = model.init({ name: 'Phase5 Project' });
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

  return model;
}

async function openModel(bytes: Uint8Array): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const mid = api.OpenModel(bytes);
  return { api, mid };
}

describe('Phase 5 writer integration', () => {
  it('a custom author/org appears in IfcOwnerHistory', async () => {
    const meta: BimModelMeta = {
      ...META,
      author: { givenName: 'Ada', familyName: 'Lovelace', email: 'ada@example.com' },
      organizationName: 'Analytical Engines Ltd',
    };
    const result = await toIfc(buildModel(), meta);
    if (!result.ok) throw new Error(result.error.message);

    const { api, mid } = await openModel(result.value);
    try {
      const persons = api.GetLineIDsWithType(mid, WebIFC.IFCPERSON);
      expect(persons.size()).toBe(1);
      const person = api.GetLine(mid, persons.get(0)) as Record<string, unknown>;
      expect((person['GivenName'] as { value?: string } | undefined)?.value).toBe('Ada');
      expect((person['FamilyName'] as { value?: string } | undefined)?.value).toBe('Lovelace');

      // Owner-history org is reachable via PersonAndOrganization.TheOrganization.
      const paos = api.GetLineIDsWithType(mid, WebIFC.IFCPERSONANDORGANIZATION);
      const pao = api.GetLine(mid, paos.get(0)) as Record<string, unknown>;
      const orgId = (pao['TheOrganization'] as { value?: number } | undefined)?.value;
      if (orgId === undefined) throw new Error('PersonAndOrganization has no TheOrganization');
      const org = api.GetLine(mid, orgId) as Record<string, unknown>;
      expect((org['Name'] as { value?: string } | undefined)?.value).toBe('Analytical Engines Ltd');

      // Every IfcRoot OwnerHistory points at the single IfcOwnerHistory.
      expect(api.GetLineIDsWithType(mid, WebIFC.IFCOWNERHISTORY).size()).toBe(1);
    } finally {
      api.CloseModel(mid);
    }
  });

  it("meta.schema='IFC4X3' yields FILE_SCHEMA IFC4X3", async () => {
    const result = await toIfc(buildModel(), { ...META, ifcSchema: 'IFC4X3' });
    if (!result.ok) throw new Error(result.error.message);
    const text = new TextDecoder().decode(result.value.subarray(0, 1024));
    expect(text).toContain("FILE_SCHEMA(('IFC4X3'))");
  });

  it('defaults to FILE_SCHEMA IFC4 when no schema is given', async () => {
    const result = await toIfc(buildModel(), META);
    if (!result.ok) throw new Error(result.error.message);
    const text = new TextDecoder().decode(result.value.subarray(0, 1024));
    expect(text).toContain("FILE_SCHEMA(('IFC4'))");
  });

  it('a weighted Qto appears for a wall with a known material density', async () => {
    const result = await toIfc(buildModel(), META);
    if (!result.ok) throw new Error(result.error.message);

    const { api, mid } = await openModel(result.value);
    try {
      const weights = api.GetLineIDsWithType(mid, WebIFC.IFCQUANTITYWEIGHT);
      expect(weights.size()).toBeGreaterThan(0);
      const weight = api.GetLine(mid, weights.get(0)) as Record<string, unknown>;
      // Concrete (2400 kg/m³) × 5.0 × 0.25 × 3.0 m³ = 9000 kg.
      const value = (weight['WeightValue'] as { value?: number } | undefined)?.value;
      expect(value).toBeCloseTo(9000, 3);
    } finally {
      api.CloseModel(mid);
    }
  });

  it('omits the weight Qto when the material density is unknown', async () => {
    const model = new BimModel();
    const initResult = model.init({ name: 'No-density Project' });
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
      materialName: 'Unobtainium',
    });
    if (!wall.ok) throw new Error(wall.error.message);
    model.placeIn(wall.value, storeyId);

    const result = await toIfc(model, META);
    if (!result.ok) throw new Error(result.error.message);
    const { api, mid } = await openModel(result.value);
    try {
      expect(api.GetLineIDsWithType(mid, WebIFC.IFCQUANTITYWEIGHT).size()).toBe(0);
    } finally {
      api.CloseModel(mid);
    }
  });
});
