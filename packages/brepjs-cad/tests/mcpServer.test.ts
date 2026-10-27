import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ResourceListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { createBrepMcpServer, type BrepMcpServer } from '@/mcp/createServer.js';
import { makeBimProject, type BimProject } from './bimFixture.js';

function payload(res: Awaited<ReturnType<Client['callTool']>>): Record<string, unknown> {
  const first = (res.content as { type: string; text?: string }[])[0];
  return JSON.parse(first?.text ?? 'null') as Record<string, unknown>;
}

describe('brep-mcp server', () => {
  let project: BimProject;
  let mcp: BrepMcpServer;
  let client: Client;
  let listChanged = 0;

  beforeAll(async () => {
    project = makeBimProject('brepjs-cad-mcp-');
    mcp = createBrepMcpServer('0.0.0-test', { cwd: project.dir });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await mcp.server.connect(serverSide);
    client = new Client({ name: 'test', version: '0.0.0' });
    client.setNotificationHandler(ResourceListChangedNotificationSchema, () => {
      listChanged++;
    });
    await client.connect(clientSide);
  });

  afterAll(async () => {
    mcp.sessions.closeAll();
    await client.close();
    project.cleanup();
  });

  it('lists every tool with annotations', async () => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect([...byName.keys()]).toEqual([
      'run_program',
      'export_part',
      'open_model',
      'list_sessions',
      'close_model',
      'rebuild',
      'get_diff',
      'render_view',
      'export_ifc',
      'query_elements',
      'get_elements',
      'list_schedulable_fields',
      'schedule',
      'validate_model',
      'compare_models',
      'search_reference',
    ]);
    expect(byName.get('export_part')?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
    for (const name of [
      'open_model',
      'query_elements',
      'get_elements',
      'rebuild',
      'get_diff',
      'render_view',
    ]) {
      expect(byName.get(name)?.annotations?.readOnlyHint).toBe(true);
    }
  });

  it('opens a model, queries it, and serves its tree and elements as resources', async () => {
    const opened = payload(
      await client.callTool({ name: 'open_model', arguments: { path: 'model.tsx' } })
    );
    expect(opened['ok']).toBe(true);
    const sessionId = opened['sessionId'] as string;
    const buildHash = opened['buildHash'] as string;
    expect(opened['byCategory']).toMatchObject({ wall: 5, door: 1, window: 1, storey: 1 });
    expect(listChanged).toBeGreaterThan(0);

    const q = payload(
      await client.callTool({
        name: 'query_elements',
        arguments: {
          sessionId,
          expectBuild: buildHash,
          where: {
            category: 'wall',
            psets: [{ path: 'Pset_WallCommon.FireRating', value: 'REI60' }],
          },
        },
      })
    );
    expect(q).toMatchObject({
      total: 1,
      ids: ['ground/annex'],
      breakdown: { category: { wall: 1 } },
    });

    const got = payload(
      await client.callTool({
        name: 'get_elements',
        arguments: { sessionId, ids: ['ground/annex', 'ground/nope'], fields: ['props'] },
      })
    );
    expect(got['missing']).toEqual(['ground/nope']);
    expect((got['elements'] as Record<string, unknown>[])[0]).toMatchObject({
      id: 'ground/annex',
      props: { height: 2700 },
    });

    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri).filter((u) => u.startsWith('brep://sessions/'))).toEqual([
      `brep://sessions/${sessionId}/tree`,
    ]);
    const treeRes = await client.readResource({ uri: `brep://sessions/${sessionId}/tree` });
    const treeBody = JSON.parse((treeRes.contents[0] as { text: string }).text) as {
      root: { id: string; children: { id: string }[] };
    };
    expect(treeBody.root.id).toBe('ground');
    expect(treeBody.root.children.map((c) => c.id)).toEqual([
      'ground/slab',
      'ground/lobby',
      'ground/annex',
    ]);
    const elementRes = await client.readResource({
      uri: `brep://sessions/${sessionId}/elements/${encodeURIComponent('ground/annex/voids:w1')}`,
    });
    expect((elementRes.contents[0] as { text: string }).text).toContain('"category":"opening"');
  });

  it('reports bad arguments and stale build hashes as tool errors', async () => {
    const stale = await client.callTool({
      name: 'query_elements',
      arguments: { sessionId: 's1', expectBuild: 'not-a-build' },
    });
    expect(stale.isError).toBe(true);
    expect(payload(stale)['error']).toBe('BUILD_MISMATCH');

    const badWhere = await client.callTool({
      name: 'query_elements',
      arguments: { sessionId: 's1', where: { colour: 'red' } },
    });
    expect(badWhere.isError).toBe(true);
    expect(payload(badWhere)['error']).toBe('INVALID_ARGUMENT');

    const missing = await client.callTool({ name: 'rebuild', arguments: { sessionId: 's9' } });
    expect(payload(missing)).toMatchObject({ error: 'NO_SUCH_SESSION', open: ['s1'] });
  });

  it('pages through the last rebuild diff', async () => {
    const none = await client.callTool({ name: 'get_diff', arguments: { sessionId: 's1' } });
    expect(payload(none)['error']).toBe('NO_DIFF');

    project.edit('doorAlong={2000}', 'doorAlong={1500}');
    const rebuilt = payload(
      await client.callTool({ name: 'rebuild', arguments: { sessionId: 's1' } })
    );
    expect(rebuilt['diff']).toMatchObject({
      counts: { added: 0, removed: 0, changed: 4, unchanged: 8 },
    });

    const first = payload(
      await client.callTool({ name: 'get_diff', arguments: { sessionId: 's1', limit: 3 } })
    );
    expect(first['previousBuildHash']).toBe(rebuilt['previousBuildHash']);
    const page1 = first['diff'] as { changed: { id: string }[]; nextOffset?: number };
    expect(page1.changed).toHaveLength(3);
    expect(page1.nextOffset).toBe(3);
    const second = payload(
      await client.callTool({
        name: 'get_diff',
        arguments: { sessionId: 's1', offset: 3, limit: 3 },
      })
    );
    const page2 = second['diff'] as { changed: { id: string }[]; nextOffset?: number };
    expect(page2.changed.map((c) => c.id)).toEqual(['ground/lobby/south/voids:door/fill']);
    expect(page2.nextOffset).toBeUndefined();
  });

  it('closes a session and drops it from the listing', async () => {
    expect(
      payload(await client.callTool({ name: 'close_model', arguments: { sessionId: 's1' } }))[
        'closed'
      ]
    ).toBe(true);
    const listed = payload(await client.callTool({ name: 'list_sessions', arguments: {} }));
    expect(listed['sessions']).toEqual([]);
    const left = (await client.listResources()).resources.map((r) => r.uri);
    expect(left.filter((u) => u.startsWith('brep://sessions/'))).toEqual([]);
  });

  it('searches the bundled reference and serves its files as resources', async () => {
    const found = payload(
      await client.callTool({ name: 'search_reference', arguments: { query: 'fill role opening' } })
    );
    const hits = found['hits'] as { doc: string; uri: string }[];
    expect(hits[0]).toMatchObject({
      doc: 'families/openings.md',
      uri: 'brep://reference/families/openings.md',
    });
    const res = await client.readResource({ uri: 'brep://reference/families/openings.md' });
    expect(res.contents[0]?.mimeType).toBe('text/markdown');
    const uris = (await client.listResources()).resources.map((r) => r.uri);
    expect(uris).toEqual(
      expect.arrayContaining(['brep://reference/llms-full.txt', 'brep://reference/families-bim.md'])
    );
    const empty = await client.callTool({ name: 'search_reference', arguments: { query: '!' } });
    expect(payload(empty)['error']).toBe('INVALID_ARGUMENT');
  });

  it('offers the inspect and edit prompts with their arguments filled in', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual([
      'inspect-building',
      'edit-and-verify',
      'quantity-takeoff',
      'compare-revisions',
    ]);
    const inspect = await client.getPrompt({
      name: 'inspect-building',
      arguments: { path: 'model.tsx' },
    });
    const text = (inspect.messages[0]?.content as { text: string }).text;
    expect(text).toContain('open_model with path "model.tsx"');
    expect(text).toContain('plan: { storey }');
    await expect(
      client.getPrompt({ name: 'edit-and-verify', arguments: { sessionId: 's1' } })
    ).rejects.toThrow(/needs change/);
  });
});
