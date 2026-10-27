import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBrepMcpServer, type BrepMcpServer } from '@/mcp/createServer.js';
import { APP_MIME, UI_EXTENSION, VIEWER_URI } from '@/mcp/viewerTools.js';
import { CHROME_ARGS } from '@/snapshot/chrome.js';
import { VIEWER_DIST } from '@/snapshot/static.js';
import { makeBimProject, type BimProject } from './bimFixture.js';

type Payload = Record<string, unknown>;
const VIEWER_APP = join(VIEWER_DIST, 'app', 'viewer-app.html');

async function connect(mcp: BrepMcpServer, ui: boolean): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await mcp.server.connect(serverSide);
  const client = new Client(
    { name: 'test', version: '0.0.0' },
    ui ? { capabilities: { extensions: { [UI_EXTENSION]: { mimeTypes: [APP_MIME] } } } } : {}
  );
  await client.connect(clientSide);
  return client;
}

function body(res: Awaited<ReturnType<Client['callTool']>>): Payload {
  const text = (res.content as { text?: string }[])[0]?.text ?? 'null';
  return JSON.parse(text) as Payload;
}

async function chromeAvailable(): Promise<boolean> {
  if (!existsSync(VIEWER_APP)) return false;
  try {
    const puppeteer = (await import('puppeteer')).default;
    return existsSync(await puppeteer.executablePath());
  } catch {
    return false;
  }
}
const canRunApp = await chromeAvailable();

describe('the live viewer', () => {
  let project: BimProject;
  let mcp: BrepMcpServer;
  let client: Client;
  const sync = async (args: Payload) =>
    (await client.callTool({ name: 'viewer_sync', arguments: { sessionId: 's1', ...args } }))
      .structuredContent as Payload;

  beforeAll(async () => {
    project = makeBimProject('brepjs-cad-viewer-');
    mcp = createBrepMcpServer('0.0.0-test', { cwd: project.dir });
    client = await connect(mcp, true);
    await client.callTool({
      name: 'open_model',
      arguments: { path: 'model.tsx', typecheck: false },
    });
  });

  afterAll(async () => {
    mcp.sessions.closeAll();
    await client.close();
    project.cleanup();
  });

  it('lists the viewer resource and links show_model to it for an MCP Apps client', async () => {
    const { tools } = await client.listTools();
    const show = tools.find((t) => t.name === 'show_model');
    expect(show?._meta).toEqual({ ui: { resourceUri: VIEWER_URI } });
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['viewer_payload', 'viewer_sync'])
    );
    const { resources } = await client.listResources();
    expect(resources).toContainEqual(
      expect.objectContaining({ uri: VIEWER_URI, mimeType: APP_MIME })
    );
  });

  it.skipIf(!existsSync(VIEWER_APP))('serves the viewer as one self-contained page', async () => {
    const { contents } = await client.readResource({ uri: VIEWER_URI });
    const html = String((contents[0] as { text?: string }).text);
    expect(html).toContain('<script type="module">');
    expect(html).not.toMatch(/<script[^>]+src=/);
  });

  it('passes selections between the agent and the viewer', async () => {
    const shown = await client.callTool({
      name: 'show_model',
      arguments: { sessionId: 's1', highlight: ['ground/annex'] },
    });
    expect(shown.structuredContent).toMatchObject({ sessionId: 's1' });
    const first = await sync({});
    expect(first['style']).toBeDefined();
    const rev = first['rev'] as number;
    expect(await sync({ rev })).not.toHaveProperty('style');

    await client.callTool({
      name: 'select_elements',
      arguments: { sessionId: 's1', ids: ['ground/lobby'] },
    });
    const picked = await sync({ rev });
    expect(picked['rev']).toBeGreaterThan(rev);
    expect(picked['selection']).toEqual(
      expect.arrayContaining(['ground/lobby/north', 'ground/lobby/south'])
    );

    await sync({ selection: ['ground/annex', 'not/an/element'] });
    const selected = body(
      await client.callTool({ name: 'get_viewer_selection', arguments: { sessionId: 's1' } })
    );
    expect(selected).toMatchObject({ selection: ['ground/annex'], viewerOpen: true });

    await client.callTool({
      name: 'show_elements',
      arguments: { sessionId: 's1', ids: ['ground/slab'] },
    });
    expect(await sync({})).toMatchObject({ frame: ['ground/slab'], selection: ['ground/slab'] });
  });

  it('hides the app-only tools and links a local page for a client without MCP Apps', async () => {
    const other = createBrepMcpServer('0.0.0-test', { cwd: project.dir });
    const plain = await connect(other, false);
    try {
      const names = (await plain.listTools()).tools.map((t) => t.name);
      expect(names).toContain('show_model');
      expect(names).not.toContain('viewer_sync');
      await plain.callTool({
        name: 'open_model',
        arguments: { path: 'model.tsx', typecheck: false },
      });
      const shown = body(
        await plain.callTool({
          name: 'show_model',
          arguments: { sessionId: 's1', highlight: ['ground/annex'] },
        })
      );
      const url = new URL(String(shown['url']));
      const model = await fetch(new URL('/__preview/model', url));
      expect(model.ok).toBe(true);
      const before = Buffer.from(await model.arrayBuffer());
      // The page follows the agent's styling and selection through its scene.
      const scene = async () =>
        (await (await fetch(new URL('/__preview/scene', url))).json()) as Payload;
      expect((await scene())['style']).toBeDefined();
      await plain.callTool({
        name: 'select_elements',
        arguments: { sessionId: 's1', ids: ['ground/slab'] },
      });
      expect((await scene())['selection']).toEqual(['ground/slab']);
      expect(before.byteLength).toBeGreaterThan(1000);
      // A rebuild sends the open page the new model without another show_model.
      project.edit('length={4000}', 'length={4500}');
      await plain.callTool({ name: 'rebuild', arguments: { sessionId: 's1' } });
      const after = Buffer.from(
        await (await fetch(new URL('/__preview/model', url))).arrayBuffer()
      );
      expect(after.equals(before)).toBe(false);
      project.edit('length={4500}', 'length={4000}');
    } finally {
      other.sessions.closeAll();
      await plain.close();
    }
  });

  it('drops what a rebuild removed from the selection, frame and style', async () => {
    await client.callTool({
      name: 'show_model',
      arguments: { sessionId: 's1', isolate: ['ground/annex'] },
    });
    await client.callTool({
      name: 'show_elements',
      arguments: { sessionId: 's1', ids: ['ground/annex'] },
    });
    const before = await sync({});
    project.edit('key="annex"', 'key="annex2"');
    try {
      await client.callTool({ name: 'rebuild', arguments: { sessionId: 's1' } });
      const after = await sync({ rev: before['rev'] });
      expect(after['rev']).toBeGreaterThan(before['rev'] as number);
      expect(after['selection']).toEqual([]);
      expect(after).not.toHaveProperty('frame');
      // An isolate of nothing would draw nothing, so the style goes.
      expect(after).not.toHaveProperty('style');
    } finally {
      project.edit('key="annex2"', 'key="annex"');
      await client.callTool({ name: 'rebuild', arguments: { sessionId: 's1' } });
    }
  });

  it.skipIf(!canRunApp)(
    'reports the element a user clicks in the inline viewer',
    async () => {
      // A stand-in host: the app in a sandboxed iframe, its tools/call relayed to this server.
      await client.callTool({
        name: 'show_model',
        arguments: { sessionId: 's1', isolate: ['ground/slab'] },
      });
      const puppeteer = (await import('puppeteer')).default;
      // Software GL, as the render pipeline uses, so the test runs on machines without a GPU.
      const browser = await puppeteer.launch({ headless: true, args: [...CHROME_ARGS] });
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 800, height: 600 });
        await page.exposeFunction('mcpCall', async (name: string, args: Payload) =>
          client.callTool({ name, arguments: args })
        );
        await page.setContent(
          '<!doctype html><body style="margin:0"><iframe id="app" sandbox="allow-scripts" style="border:0;width:800px;height:600px"></iframe></body>'
        );
        await page.evaluate(
          (html: string) => {
            const frame = document.getElementById('app') as HTMLIFrameElement;
            const w = window as unknown as {
              mcpCall(name: string, args: unknown): Promise<unknown>;
            };
            window.addEventListener('message', (event: MessageEvent) => {
              const msg = event.data as { id?: number; method?: string; params?: Payload };
              const reply = (result: unknown) =>
                frame.contentWindow?.postMessage({ jsonrpc: '2.0', id: msg.id, result }, '*');
              if (msg.method === 'ui/initialize') {
                reply({ protocolVersion: '2026-01-26', hostCapabilities: {}, hostContext: {} });
              } else if (msg.method === 'ui/notifications/initialized') {
                frame.contentWindow?.postMessage(
                  {
                    jsonrpc: '2.0',
                    method: 'ui/notifications/tool-input',
                    params: { arguments: { sessionId: 's1' } },
                  },
                  '*'
                );
              } else if (msg.method === 'tools/call') {
                const p = msg.params as { name: string; arguments: unknown };
                void w.mcpCall(p.name, p.arguments).then(reply);
              }
            });
            frame.srcdoc = html;
          },
          readFileSync(VIEWER_APP, 'utf8')
        );
        const frame = await (await page.$('#app'))?.contentFrame();
        await frame?.waitForSelector('canvas', { timeout: 30_000 });
        // The slab is all that's drawn, framed at the centre of the view.
        await new Promise((done) => setTimeout(done, 2500));
        await page.mouse.click(400, 300);
        let selection: unknown;
        for (let i = 0; i < 20 && !Array.isArray(selection); i++) {
          await new Promise((done) => setTimeout(done, 500));
          const r = body(
            await client.callTool({ name: 'get_viewer_selection', arguments: { sessionId: 's1' } })
          );
          if (
            Array.isArray(r['selection']) &&
            (r['selection'] as unknown[]).includes('ground/slab')
          )
            selection = r['selection'];
        }
        expect(selection).toEqual(['ground/slab']);
      } finally {
        await browser.close();
      }
    },
    90_000
  );
});
