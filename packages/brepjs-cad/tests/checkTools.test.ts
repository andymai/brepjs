import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBrepMcpServer, type BrepMcpServer } from '@/mcp/createServer.js';
import { INTEROP_IFC, makeBimProject, type BimProject } from './bimFixture.js';

type Payload = Record<string, unknown>;
type FindingLike = { check: string; severity: string; code: string; id?: string };

describe('validate_model and compare_models', () => {
  let project: BimProject;
  let mcp: BrepMcpServer;
  let client: Client;
  let revised = '';
  let revisedSession = '';
  let wallGuid = '';
  const call = async (name: string, args: Payload) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as { text?: string }[])[0]?.text ?? 'null';
    return { isError: res.isError === true, body: JSON.parse(text) as Payload };
  };

  beforeAll(async () => {
    project = makeBimProject('brepjs-cad-checks-');
    // A revision of the IFC fixture: one wall written as the deprecated IfcWallStandardCase, and
    // one fire rating lowered.
    const source = readFileSync(INTEROP_IFC, 'utf8');
    const wall = /=IFCWALL\('([^']+)'/.exec(source);
    if (!wall?.[1]) throw new Error('the fixture has no IFCWALL');
    wallGuid = wall[1];
    revised = join(project.dir, 'revised.ifc');
    writeFileSync(
      revised,
      source
        .replace(`=IFCWALL('${wallGuid}'`, `=IFCWALLSTANDARDCASE('${wallGuid}'`)
        .replace("'REI 120'", "'REI 90'")
    );
    mcp = createBrepMcpServer('0.0.0-test', { cwd: project.dir });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await mcp.server.connect(serverSide);
    client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(clientSide);
    await call('open_model', { path: 'model.tsx', typecheck: false });
  });

  afterAll(async () => {
    mcp.sessions.closeAll();
    await client.close();
    project.cleanup();
  });

  it('checks a families model as its IFC export would be written', async () => {
    const r = await call('validate_model', { sessionId: 's1' });
    expect(r.body).toMatchObject({
      ok: true,
      ran: ['integrity', 'schema', 'roundtrip', 'gherkin', 'geometry'],
      counts: { error: 0 },
    });
    const errorsOnly = await call('validate_model', { sessionId: 's1', minSeverity: 'error' });
    expect(errorsOnly.body['findings']).toEqual([]);
  });

  it('maps an IFC finding to the GlobalId of the element it names', async () => {
    const opened = await call('open_model', { path: revised });
    revisedSession = opened.body['sessionId'] as string;
    const r = await call('validate_model', {
      sessionId: revisedSession,
      checks: ['gherkin', 'integrity'],
    });
    expect(r.body['ok']).toBe(false);
    expect(r.body['skipped']).toEqual([expect.objectContaining({ check: 'integrity' })]);
    const findings = r.body['findings'] as FindingLike[];
    expect(findings).toContainEqual(
      expect.objectContaining({
        check: 'gherkin',
        severity: 'error',
        code: 'DEPRECATED_ENTITY',
        id: wallGuid,
      })
    );
    const bad = await call('validate_model', { sessionId: 's1', checks: ['spelling'] });
    expect(bad.body['error']).toBe('INVALID_ARGUMENT');
  });

  it('pages findings from one run of the checks', async () => {
    const sessionId = revisedSession;
    const all = await call('validate_model', { sessionId, checks: ['gherkin'] });
    const total = all.body['findingsTotal'] as number;
    const every = all.body['findings'] as FindingLike[];
    expect(total).toBe(every.length);
    expect(total).toBeGreaterThan(0);
    const first = await call('validate_model', { sessionId, checks: ['gherkin'], limit: 1 });
    expect(first.body['findings']).toEqual(every.slice(0, 1));
    expect(first.body['nextOffset']).toBe(total > 1 ? 1 : undefined);
    const last = await call('validate_model', {
      sessionId,
      checks: ['gherkin'],
      offset: total - 1,
    });
    expect(last.body['findings']).toEqual(every.slice(-1));
    expect(last.body['nextOffset']).toBeUndefined();
  });

  it('diffs two revisions of an IFC file by GlobalId', async () => {
    const before = await call('open_model', { path: INTEROP_IFC });
    const after = await call('open_model', { path: revised });
    const r = await call('compare_models', {
      from: before.body['sessionId'],
      to: after.body['sessionId'],
    });
    const diff = r.body['diff'] as { counts: Payload; changed: { id: string; psets?: Payload }[] };
    expect(diff.counts).toMatchObject({ added: 0, removed: 0 });
    const rated = diff.changed.find((c) => c.psets?.['Pset_WallCommon.FireRating'] !== undefined);
    expect(rated?.psets?.['Pset_WallCommon.FireRating']).toEqual({
      before: 'REI 120',
      after: 'REI 90',
    });
    const mixed = await call('compare_models', { from: 's1', to: after.body['sessionId'] });
    expect(mixed.body['error']).toBe('INVALID_ARGUMENT');
    const moved = await call('compare_models', {
      from: before.body['sessionId'],
      to: after.body['sessionId'],
      fromBuild: 'not-a-build',
    });
    expect(moved.body['error']).toBe('BUILD_MISMATCH');
    // The session cap is 4; leave room for the next test's.
    await call('close_model', { sessionId: before.body['sessionId'] });
    await call('close_model', { sessionId: after.body['sessionId'] });
  });

  it('compares families quantity sets as an export would write them', async () => {
    const longer = join(project.dir, 'longer.tsx');
    writeFileSync(
      longer,
      readFileSync(project.model, 'utf8').replace('length={4000}', 'length={4500}')
    );
    const opened = await call('open_model', { path: longer, typecheck: false });
    const r = await call('compare_models', { from: 's1', to: opened.body['sessionId'] });
    const diff = r.body['diff'] as {
      changed: { id: string; quantities?: Record<string, { before: unknown; after: unknown }> }[];
    };
    const wall = diff.changed.find((c) => c.id.endsWith('annex'));
    const length = wall?.quantities?.['Qto_WallBaseQuantities.Length'];
    expect(length?.before).toBeCloseTo(4, 6);
    expect(length?.after).toBeCloseTo(4.5, 6);
  });
});
