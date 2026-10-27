import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBrepMcpServer, type BrepMcpServer } from '@/mcp/createServer.js';
import { INTEROP_IFC, makeBimProject, type BimProject } from './bimFixture.js';

type Payload = Record<string, unknown>;
const LENGTH = 'quantities.Qto_WallBaseQuantities.Length';

describe('schedules', () => {
  let project: BimProject;
  let mcp: BrepMcpServer;
  let client: Client;
  const call = async (name: string, args: Payload) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as { text?: string }[])[0]?.text ?? 'null';
    return { isError: res.isError === true, body: JSON.parse(text) as Payload };
  };

  beforeAll(async () => {
    project = makeBimProject('brepjs-cad-schedule-');
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

  it('lists props, psets and export quantities for a families selection', async () => {
    const r = await call('list_schedulable_fields', {
      sessionId: 's1',
      where: { category: 'wall' },
    });
    expect(r.body['matched']).toBe(5);
    const fields = new Map(
      (r.body['fields'] as { field: string; count: number }[]).map((f) => [f.field, f])
    );
    expect(fields.get('props.height')?.count).toBe(5);
    expect(fields.get('psets.Pset_WallCommon.FireRating')?.count).toBe(1);
    expect(fields.get(LENGTH)?.count).toBe(5);
    expect(String(r.body['units'])).toContain('metres');
  });

  it('takes quantities off per element and per storey, matching the export', async () => {
    const rows = await call('schedule', {
      sessionId: 's1',
      where: { id: 'ground/annex' },
      fields: ['id', LENGTH],
    });
    // The annex wall is 4000 mm long; the export writes metres.
    expect(rows.body['rows']).toEqual([['ground/annex', 4]]);

    const grouped = await call('schedule', {
      sessionId: 's1',
      where: { category: 'wall' },
      fields: ['storey', LENGTH],
      groupBy: ['storey'],
      outPath: 'out/walls.csv',
    });
    expect(grouped.body['columns']).toEqual(['storey', 'count', `sum(${LENGTH})`]);
    const [storey, count, total] = (grouped.body['rows'] as unknown[][])[0] ?? [];
    expect([storey, count]).toEqual(['Ground floor', 5]);
    expect(total).toBeCloseTo((grouped.body['totals'] as Record<string, number>)[LENGTH] ?? NaN, 9);
    const csv = readFileSync(join(project.dir, 'out/walls.csv'), 'utf8').split('\n');
    expect(csv[0]).toBe(`storey,count,sum(${LENGTH})`);
    expect(csv[1]).toMatch(/^Ground floor,5,/);
  });

  it('skips the export when no field needs quantities, and rejects unknown fields', async () => {
    const plain = await call('schedule', {
      sessionId: 's1',
      where: { category: 'wall' },
      fields: ['name'],
    });
    expect(plain.body['units']).toBeUndefined();
    const bad = await call('schedule', { sessionId: 's1', fields: ['colour'] });
    expect(bad.body).toMatchObject({ error: 'INVALID_ARGUMENT' });
  });

  it('schedules an IFC file from its own quantity sets', async () => {
    const opened = await call('open_model', { path: INTEROP_IFC });
    const r = await call('schedule', {
      sessionId: opened.body['sessionId'],
      where: { category: 'WALL' },
      fields: ['name', LENGTH],
      sortBy: [{ field: 'name' }],
    });
    const rows = r.body['rows'] as [string, number][];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(([, length]) => typeof length === 'number' && length > 0)).toBe(true);
  });
});
