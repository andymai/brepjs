import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createBrepMcpServer, type BrepMcpServer } from '@/mcp/createServer.js';
import { VIEWER_DIST } from '@/snapshot/static.js';
import { INTEROP_IFC, makeBimProject, type BimProject } from './bimFixture.js';
import { decodePng, pixelShare } from './png.js';

// Rendering needs the built viewer page and puppeteer's Chrome, so this file skips without them;
// locally, `npm run build` first.
async function renderAvailable(): Promise<boolean> {
  if (!existsSync(join(VIEWER_DIST, 'index.html'))) return false;
  try {
    const puppeteer = (await import('puppeteer')).default;
    return existsSync(await puppeteer.executablePath());
  } catch {
    return false;
  }
}
const canRender = await renderAvailable();

interface Rendered {
  readonly digest: Record<string, unknown>;
  readonly images: Uint8Array[];
}

const orange = (r: number, g: number, b: number) => r > 110 && g < r * 0.7 && b < r * 0.35;

describe.skipIf(!canRender)('render_view', () => {
  let project: BimProject;
  let mcp: BrepMcpServer;
  const call = async (name: string, args: Record<string, unknown>) => {
    const tool = mcp.tools.find((t) => t.name === name);
    if (!tool) throw new Error(`no tool ${name}`);
    return tool.handler(args);
  };
  const render = async (args: Record<string, unknown>): Promise<Rendered> => {
    const res = await call('render_view', args);
    const content = res.content as { type: string; text?: string; data?: string }[];
    if (res.isError) throw new Error(content[0]?.text ?? 'render failed');
    return {
      digest: JSON.parse(content[0]?.text ?? '{}') as Record<string, unknown>,
      images: content
        .filter((c) => c.type === 'image')
        .map((c) => Buffer.from(c.data ?? '', 'base64')),
    };
  };

  beforeAll(async () => {
    project = makeBimProject('brepjs-cad-render-');
    mcp = createBrepMcpServer('0.0.0-test', { cwd: project.dir });
    await call('open_model', { path: 'model.tsx' });
  });

  afterAll(() => {
    mcp.sessions.closeAll();
    project.cleanup();
  });

  it('shows a highlighted element in orange at 1200 x 900', async () => {
    const plain = await render({ sessionId: 's1' });
    const lit = await render({ sessionId: 's1', highlight: ['ground/annex'] });
    expect(lit.digest).toMatchObject({ drawn: 10, highlighted: 1, views: ['iso'] });
    const before = decodePng(plain.images[0] ?? new Uint8Array());
    const after = decodePng(lit.images[0] ?? new Uint8Array());
    expect([after.width, after.height]).toEqual([1200, 900]);
    expect(pixelShare(before, orange)).toBeLessThan(0.001);
    expect(pixelShare(after, orange)).toBeGreaterThan(0.01);
  });

  it('draws a storey plan from above and reports where it cut', async () => {
    const plan = await render({ sessionId: 's1', plan: { storey: 'Ground floor' } });
    expect(plan.images).toHaveLength(1);
    expect(plan.digest).toMatchObject({
      views: ['top'],
      plan: { storey: 'ground', cutAt: 1200 },
      section: { axis: 'z', at: 1200, keep: 'below' },
    });
  });

  it('renders one image per view and returns the color legend for an IFC file', async () => {
    const opened = await call('open_model', { path: INTEROP_IFC });
    const sessionId = (
      JSON.parse((opened.content[0] as { text: string }).text) as { sessionId: string }
    ).sessionId;
    const r = await render({ sessionId, colorBy: 'category', views: ['iso', 'front'] });
    expect(r.images).toHaveLength(2);
    const legend = r.digest['legend'] as { label: string; count: number }[];
    expect(legend.map((l) => l.label)).toContain('WALL');
  });

  it('refuses a selection that leaves nothing to draw', async () => {
    const res = await call('render_view', { sessionId: 's1', isolate: ['nothing/here'] });
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toContain('NOTHING_TO_DRAW');
  });
});
