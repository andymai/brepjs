import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import * as WebIFC from 'web-ifc';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import { writeOwnerHistory } from '../src/ifc-writer/ownerHistoryWriter.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

/** Serializes a model containing only an owner-history chain and reads it back. */
async function roundTrip(
  meta: Parameters<typeof writeOwnerHistory>[1]
): Promise<{ api: WebIFC.IfcAPI; mid: number; ownerHistoryId: number }> {
  const created = await IfcWriter.create();
  if (!created.ok) throw new Error(created.error.message);
  const w = created.value;
  const ownerHistoryId = writeOwnerHistory(w, meta);
  const saved = w.save();
  if (!saved.ok) throw new Error(saved.error.message);

  const api = new WebIFC.IfcAPI();
  await api.Init();
  const mid = api.OpenModel(saved.value);
  return { api, mid, ownerHistoryId };
}

function orgNamesOf(api: WebIFC.IfcAPI, mid: number): string[] {
  const ids = api.GetLineIDsWithType(mid, WebIFC.IFCORGANIZATION);
  const names: string[] = [];
  for (let i = 0; i < ids.size(); i++) {
    const org = api.GetLine(mid, ids.get(i)) as Record<string, unknown>;
    const name = (org['Name'] as { value?: string } | undefined)?.value;
    if (name !== undefined) names.push(name);
  }
  return names;
}

describe('ownerHistoryWriter', () => {
  it('serializes the IfcOwnerHistory chain with the given person and org names', async () => {
    const { api, mid } = await roundTrip({
      author: { givenName: 'Ada', familyName: 'Lovelace' },
      organizationName: 'Analytical Engines',
      applicationName: 'brepjs-bim',
      applicationVersion: '1.0.0',
    });

    const personIds = api.GetLineIDsWithType(mid, WebIFC.IFCPERSON);
    expect(personIds.size()).toBe(1);
    const person = api.GetLine(mid, personIds.get(0)) as Record<string, unknown>;
    expect((person['GivenName'] as { value?: string } | undefined)?.value).toBe('Ada');
    expect((person['FamilyName'] as { value?: string } | undefined)?.value).toBe('Lovelace');

    const orgNames = orgNamesOf(api, mid);
    expect(orgNames).toContain('Analytical Engines');

    api.CloseModel(mid);
  });

  it('links IfcPersonAndOrganization to the person and organization', async () => {
    const { api, mid } = await roundTrip({
      author: { givenName: 'Grace', familyName: 'Hopper' },
      organizationName: 'Navy',
      applicationName: 'brepjs-bim',
      applicationVersion: '2.0.0',
    });

    const paoIds = api.GetLineIDsWithType(mid, WebIFC.IFCPERSONANDORGANIZATION);
    expect(paoIds.size()).toBe(1);
    const pao = api.GetLine(mid, paoIds.get(0)) as Record<string, unknown>;
    const personRef = (pao['ThePerson'] as { value?: number } | undefined)?.value;
    const orgRef = (pao['TheOrganization'] as { value?: number } | undefined)?.value;
    expect(personRef).toBe(api.GetLineIDsWithType(mid, WebIFC.IFCPERSON).get(0));
    expect(orgRef).toBeDefined();
    if (orgRef === undefined) throw new Error('missing org ref');
    const org = api.GetLine(mid, orgRef) as Record<string, unknown>;
    expect((org['Name'] as { value?: string } | undefined)?.value).toBe('Navy');

    api.CloseModel(mid);
  });

  it('writes IfcApplication with the given application name and version', async () => {
    const { api, mid } = await roundTrip({
      author: { givenName: 'Alan', familyName: 'Turing' },
      organizationName: 'NPL',
      applicationName: 'My CAD App',
      applicationVersion: '3.1.4',
    });

    const appIds = api.GetLineIDsWithType(mid, WebIFC.IFCAPPLICATION);
    expect(appIds.size()).toBe(1);
    const app = api.GetLine(mid, appIds.get(0)) as Record<string, unknown>;
    expect((app['ApplicationFullName'] as { value?: string } | undefined)?.value).toBe('My CAD App');
    expect((app['Version'] as { value?: string } | undefined)?.value).toBe('3.1.4');

    api.CloseModel(mid);
  });

  it('returns the IfcOwnerHistory express id referencing the person-and-org and application', async () => {
    const { api, mid, ownerHistoryId } = await roundTrip({
      author: { givenName: 'Edsger', familyName: 'Dijkstra' },
      organizationName: 'THE',
      applicationName: 'brepjs-bim',
      applicationVersion: '1.2.3',
    });

    const oh = api.GetLine(mid, ownerHistoryId) as Record<string, unknown>;
    expect(oh['type']).toBe(WebIFC.IFCOWNERHISTORY);
    const owningUser = (oh['OwningUser'] as { value?: number } | undefined)?.value;
    const owningApp = (oh['OwningApplication'] as { value?: number } | undefined)?.value;
    expect(owningUser).toBe(api.GetLineIDsWithType(mid, WebIFC.IFCPERSONANDORGANIZATION).get(0));
    expect(owningApp).toBe(api.GetLineIDsWithType(mid, WebIFC.IFCAPPLICATION).get(0));

    api.CloseModel(mid);
  });

  it('defaults the creation timestamp to 0 (epoch) when not provided', async () => {
    const { api, mid, ownerHistoryId } = await roundTrip({
      author: { givenName: 'Ken', familyName: 'Thompson' },
      organizationName: 'Bell Labs',
      applicationName: 'brepjs-bim',
      applicationVersion: '1.0.0',
    });

    const oh = api.GetLine(mid, ownerHistoryId) as Record<string, unknown>;
    expect((oh['CreationDate'] as { value?: number } | undefined)?.value).toBe(0);

    api.CloseModel(mid);
  });

  it('honors an explicit creationTimestamp for deterministic output', async () => {
    const { api, mid, ownerHistoryId } = await roundTrip({
      author: { givenName: 'Dennis', familyName: 'Ritchie' },
      organizationName: 'Bell Labs',
      applicationName: 'brepjs-bim',
      applicationVersion: '1.0.0',
      creationTimestamp: 1_700_000_000,
    });

    const oh = api.GetLine(mid, ownerHistoryId) as Record<string, unknown>;
    expect((oh['CreationDate'] as { value?: number } | undefined)?.value).toBe(1_700_000_000);

    api.CloseModel(mid);
  });

  it('produces byte-identical output for two writes with the same meta', async () => {
    const meta = {
      author: { givenName: 'Barbara', familyName: 'Liskov' },
      organizationName: 'MIT',
      applicationName: 'brepjs-bim',
      applicationVersion: '1.0.0',
      creationTimestamp: 42,
    } as const;

    const a = await IfcWriter.create();
    const b = await IfcWriter.create();
    if (!a.ok) throw new Error(a.error.message);
    if (!b.ok) throw new Error(b.error.message);
    writeOwnerHistory(a.value, meta);
    writeOwnerHistory(b.value, meta);
    const sa = a.value.save();
    const sb = b.value.save();
    if (!sa.ok) throw new Error(sa.error.message);
    if (!sb.ok) throw new Error(sb.error.message);

    // Strip the FILE header (carries web-ifc preamble) and compare the data section.
    const bodyA = new TextDecoder().decode(sa.value).split('DATA;')[1];
    const bodyB = new TextDecoder().decode(sb.value).split('DATA;')[1];
    expect(bodyA).toBe(bodyB);
  });
});
