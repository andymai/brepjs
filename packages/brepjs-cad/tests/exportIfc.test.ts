import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createBrepMcpServer, type BrepMcpServer } from '@/mcp/createServer.js';
import { INTEROP_IFC, makeBimProject, type BimProject } from './bimFixture.js';

type Payload = Record<string, unknown>;

describe('export_ifc', () => {
  let project: BimProject;
  let mcp: BrepMcpServer;
  let client: Client;
  let answer: 'accept' | 'decline' = 'decline';
  const asked: string[] = [];
  let annexGuid = '';

  const call = async (name: string, args: Payload) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as { text?: string }[])[0]?.text ?? 'null';
    return { isError: res.isError === true, body: JSON.parse(text) as Payload };
  };

  beforeAll(async () => {
    project = makeBimProject('brepjs-cad-export-');
    writeFileSync(
      join(project.dir, 'package.json'),
      '{ "name": "lobby-annex", "type": "module" }\n'
    );
    mcp = createBrepMcpServer('0.0.0-test', { cwd: project.dir });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await mcp.server.connect(serverSide);
    client = new Client({ name: 'test', version: '0.0.0' }, { capabilities: { elicitation: {} } });
    client.setRequestHandler(ElicitRequestSchema, (req) => {
      asked.push(req.params.message);
      return answer === 'accept'
        ? { action: 'accept', content: { overwrite: true } }
        : { action: 'decline' };
    });
    await client.connect(clientSide);
    await call('open_model', { path: 'model.tsx' });
  });

  afterAll(async () => {
    mcp.sessions.closeAll();
    await client.close();
    project.cleanup();
  });

  it('writes a validated IFC whose GlobalIds and psets survive a round trip', async () => {
    const out = await call('export_ifc', { sessionId: 's1', outPath: 'dist/model.ifc' });
    expect(out.isError).toBe(false);
    expect(out.body).toMatchObject({
      ok: true,
      written: true,
      project: { name: 'lobby-annex', projectId: 'lobby-annex' },
      validation: { errors: 0 },
    });
    const path = out.body['path'] as string;
    expect(readFileSync(path, 'utf8').startsWith('ISO-10303-21;')).toBe(true);
    const guids = out.body['globalIds'] as Record<string, string>;
    annexGuid = guids['ground/annex'] ?? '';
    expect(Object.keys(guids)).toEqual(expect.arrayContaining(['ground/annex', 'ground/slab']));

    const byKeyPath = await call('get_elements', {
      sessionId: 's1',
      ids: ['ground/annex'],
      fields: [],
    });
    expect((byKeyPath.body['elements'] as Payload[])[0]).toMatchObject({
      guid: guids['ground/annex'],
    });
    const byGuid = await call('get_elements', {
      sessionId: 's1',
      ids: [guids['ground/annex']],
      fields: [],
    });
    expect((byGuid.body['elements'] as Payload[])[0]).toMatchObject({ id: 'ground/annex' });

    const reopened = await call('open_model', { path });
    expect(reopened.body['byCategory']).toMatchObject({ WALL: 5, DOOR: 1, WINDOW: 1, SLAB: 1 });
    const annex = await call('get_elements', {
      sessionId: reopened.body['sessionId'],
      ids: [guids['ground/annex']],
      fields: ['psets'],
    });
    expect((annex.body['elements'] as Payload[])[0]).toMatchObject({
      category: 'WALL',
      psets: { Pset_WallCommon: { FireRating: 'REI60' } },
    });
  });

  it('keeps the last written GlobalIds when a later export writes nothing', async () => {
    const failed = await call('export_ifc', {
      sessionId: 's1',
      outPath: 'model.tsx/elsewhere.ifc',
      project: { name: 'another-project' },
    });
    expect(failed.isError).toBe(true);
    const annex = await call('get_elements', {
      sessionId: 's1',
      ids: ['ground/annex'],
      fields: [],
    });
    expect((annex.body['elements'] as Payload[])[0]).toMatchObject({ guid: annexGuid });
  });

  it('asks before replacing a file, and keeps it when the answer is no', async () => {
    const path = join(project.dir, 'dist/model.ifc');
    writeFileSync(path, 'keep me');
    answer = 'decline';
    const declined = await call('export_ifc', { sessionId: 's1', outPath: 'dist/model.ifc' });
    expect(declined.body).toMatchObject({ written: false, reason: 'overwrite declined' });
    expect(readFileSync(path, 'utf8')).toBe('keep me');
    expect(asked.at(-1)).toContain('dist/model.ifc already exists');

    answer = 'accept';
    const accepted = await call('export_ifc', { sessionId: 's1', outPath: 'dist/model.ifc' });
    expect(accepted.body['written']).toBe(true);
    expect(statSync(path).size).toBeGreaterThan(1000);

    const asksBefore = asked.length;
    const forced = await call('export_ifc', {
      sessionId: 's1',
      outPath: 'dist/model.ifc',
      overwrite: true,
    });
    expect(forced.body['written']).toBe(true);
    expect(asked).toHaveLength(asksBefore);
  });

  it('asks instead of replacing when a concurrent export wrote the file first', async () => {
    answer = 'decline';
    const [a, b] = await Promise.all([
      call('export_ifc', { sessionId: 's1', outPath: 'dist/race.ifc' }),
      call('export_ifc', { sessionId: 's1', outPath: 'dist/race.ifc' }),
    ]);
    const results = [a.body, b.body];
    expect(results.filter((r) => r['written'] === true)).toHaveLength(1);
    expect(results.filter((r) => r['reason'] === 'overwrite declined')).toHaveLength(1);
  });

  it('only writes .ifc files, and refuses to re-export an imported IFC session', async () => {
    const wrong = await call('export_ifc', { sessionId: 's1', outPath: 'model.tsx' });
    expect(wrong.body).toMatchObject({ error: 'INVALID_ARGUMENT' });
    expect(readFileSync(project.model, 'utf8')).toContain('<Storey');

    const ifc = await call('open_model', { path: INTEROP_IFC });
    const refused = await call('export_ifc', {
      sessionId: ifc.body['sessionId'],
      outPath: 'copy.ifc',
    });
    expect(refused.body).toMatchObject({ error: 'UNSUPPORTED' });
  });
});
