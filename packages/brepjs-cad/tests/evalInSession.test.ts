import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBrepMcpServer, type BrepMcpServer } from '@/mcp/createServer.js';
import { ReferenceIndex } from '@/session/reference.js';
import { INTEROP_IFC, makeBimProject, type BimProject } from './bimFixture.js';

type Payload = Record<string, unknown>;

async function connect(mcp: BrepMcpServer): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await mcp.server.connect(serverSide);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientSide);
  return client;
}

describe('eval_in_session', () => {
  let project: BimProject;
  let mcp: BrepMcpServer;
  let client: Client;
  const call = async (name: string, args: Payload) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as { text?: string }[])[0]?.text ?? 'null';
    return { isError: res.isError === true, body: JSON.parse(text) as Payload };
  };
  const run = (code: string, extra: Payload = {}) =>
    call('eval_in_session', { sessionId: 's1', code, ...extra });

  beforeAll(async () => {
    project = makeBimProject('brepjs-cad-eval-');
    mcp = createBrepMcpServer('0.0.0-test', { cwd: project.dir }, new ReferenceIndex(), {
      allowCode: true,
    });
    client = await connect(mcp);
    await call('open_model', { path: 'model.tsx', typecheck: false });
  });

  afterAll(async () => {
    mcp.sessions.closeAll();
    await client.close();
    project.cleanup();
  });

  it('is listed only when the server allows code', async () => {
    const closed = createBrepMcpServer('0.0.0-test', { cwd: project.dir });
    const other = await connect(closed);
    const names = (await other.listTools()).tools.map((t) => t.name);
    expect(names).not.toContain('eval_in_session');
    await other.close();
    const tool = (await client.listTools()).tools.find((t) => t.name === 'eval_in_session');
    expect(tool?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it('runs typed code against the live build and returns JSON with the logs', async () => {
    const r = await run(`
      const walls: number = ctx.records.filter((r: { category: string }) => r.category === 'wall').length;
      console.log('walls', walls);
      return { walls, annex: ctx.record('ground/annex')?.props?.height };
    `);
    expect(r.isError).toBe(false);
    expect(r.body).toMatchObject({ ok: true, value: { walls: 5, annex: 2700 }, logs: ['walls 5'] });
    expect(typeof r.body['buildHash']).toBe('string');
  });

  it('returns plain objects whole, even ones shaped like build records', async () => {
    const r = await run(
      "return { kind: 'Box', structuralHash: 7n, size: [1, 2, 3], at: new Map([['x', 1]]) };"
    );
    expect(r.body['value']).toEqual({
      kind: 'Box',
      structuralHash: '7',
      size: [1, 2, 3],
      at: { map: [['x', 1]] },
    });
  });

  it('measures B-rep shapes the session holds', async () => {
    const r = await run(`
      const shape = ctx.model.byKeyPath.get('ground/annex').shape.value;
      return ctx.brep.measureVolume(shape).value;
    `);
    expect(r.body['value']).toBeCloseTo(4000 * 200 * 2700 - 1200 * 1200 * 200, -3);
  });

  it('reports syntax errors and thrown errors without stopping the worker', async () => {
    const syntax = await run('return (;');
    expect(syntax.isError).toBe(true);
    expect(String(syntax.body['error'])).toMatch(/^syntax:/);
    const thrown = await run("console.warn('about to fail'); throw new Error('nope');");
    expect(thrown.body).toMatchObject({ ok: false, error: 'nope', logs: ['[warn] about to fail'] });
    expect((await run('return 1;')).body['value']).toBe(1);
  });

  it('stops the worker on a runaway loop, and a rebuild brings the session back', async () => {
    const stuck = await run('for (;;) {}', { timeoutMs: 3000 });
    expect(stuck.body).toMatchObject({ error: 'EVAL_FAILED' });
    expect(String(stuck.body['message'])).toContain('rebuild');
    const listed = await call('list_sessions', {});
    expect((listed.body['sessions'] as Payload[])[0]).toMatchObject({ workerAlive: false });
    expect((await call('rebuild', { sessionId: 's1' })).body['ok']).toBe(true);
    expect((await run('return ctx.kind;')).body['value']).toBe('families');
  });

  it('hands an IFC session its imported model', async () => {
    const opened = await call('open_model', { path: INTEROP_IFC });
    const r = await call('eval_in_session', {
      sessionId: opened.body['sessionId'],
      code: 'return { kind: ctx.kind, elements: ctx.model.elements.length, schema: ctx.model.schema };',
    });
    expect(r.body['value']).toMatchObject({ kind: 'ifc', schema: 'IFC4' });
    expect((r.body['value'] as { elements: number }).elements).toBeGreaterThan(0);
  });
});
