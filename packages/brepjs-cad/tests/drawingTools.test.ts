import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBrepMcpServer, type BrepMcpServer } from '@/mcp/createServer.js';
import { INTEROP_IFC, makeBimProject, type BimProject } from './bimFixture.js';

type Payload = Record<string, unknown>;

describe('plan_view, section_view, get_spaces and export_cobie', () => {
  let project: BimProject;
  let mcp: BrepMcpServer;
  let client: Client;
  const call = async (name: string, args: Payload) => {
    const res = await client.callTool({ name, arguments: args });
    const content = res.content as { type: string; text?: string }[];
    return {
      isError: res.isError === true,
      body: JSON.parse(content[0]?.text ?? 'null') as Payload,
    };
  };

  beforeAll(async () => {
    project = makeBimProject('brepjs-cad-drawings-');
    // A space over the lobby's floor, 200 mm in from its outer wall faces.
    project.edit(
      "import { Window } from './families/window.js';",
      [
        "import { Window } from './families/window.js';",
        "import { family, el, tTranslate } from 'brepjs-families';",
        'const Space = family<{ name: string; length: number; width: number; height: number }>(',
        "  'Space',",
        '  (p) =>',
        "    el('Box', {",
        '      size: [p.length, p.width, p.height],',
        '      transform: [tTranslate([200, 200, 0])],',
        '    } as never)',
        ');',
      ].join('\n')
    );
    project.edit(
      '<Slab key="slab"',
      '<Space key="lobby-space" name="Lobby" length={4600} width={3600} height={2700} />,\n      <Slab key="slab"'
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

  it('draws a storey plan, cut walls by category, and saves it as DXF', async () => {
    const r = await call('plan_view', {
      sessionId: 's1',
      storey: 'Ground floor',
      outPath: 'plan.dxf',
    });
    expect(r.body).toMatchObject({ storey: 'ground', cutAt: 1200, format: 'dxf' });
    const layers = r.body['layers'] as Record<string, number>;
    expect(layers['CUT-WALL']).toBeGreaterThan(0);
    expect(layers['BEYOND']).toBeGreaterThan(0);
    // Openings and spaces are not drawn.
    expect(Object.keys(layers).some((l) => /OPENING|SPACE/.test(l))).toBe(false);
    expect(r.body['extentMm']).toEqual({ width: 9000, height: 4000 });
    const dxf = readFileSync(join(project.dir, 'plan.dxf'), 'utf8');
    expect(dxf).toContain('CUT-WALL');
    expect(dxf).not.toContain('LWPOLYLINE');

    const bad = await call('plan_view', { sessionId: 's1', storey: 'roof' });
    expect(bad.body['error']).toBe('INVALID_ARGUMENT');
    expect(String(bad.body['message'])).toContain('Ground floor');
    const mismatch = await call('plan_view', {
      sessionId: 's1',
      storey: 'ground',
      outPath: 'plan.svg',
      format: 'dxf',
    });
    expect(mismatch.body['error']).toBe('INVALID_ARGUMENT');
  });

  it('draws a section with the walls it crosses and the slab under them', async () => {
    const r = await call('section_view', {
      sessionId: 's1',
      axis: 'y',
      at: 2000,
      outPath: 'cut.svg',
    });
    const layers = r.body['layers'] as Record<string, number>;
    expect(layers['CUT-WALL']).toBeGreaterThan(0);
    expect(layers['CUT-SLAB']).toBeGreaterThan(0);
    expect(r.body['extentMm']).toEqual({ width: 9000, height: 2900 });
    expect(readFileSync(join(project.dir, 'cut.svg'), 'utf8')).toContain('<g id="CUT-WALL"');
  });

  it('measures each space and reports the quantities the IFC export records', async () => {
    const r = await call('get_spaces', { sessionId: 's1' });
    const [space] = r.body['spaces'] as {
      id: string;
      name: string;
      area: number;
      perimeter: number;
      volume: number;
      recorded: Record<string, Record<string, number>>;
      outline: number[][][];
    }[];
    expect(space?.id).toBe('ground/lobby-space');
    expect(space?.name).toBe('Lobby');
    expect(space?.area).toBeCloseTo(16.56, 6);
    expect(space?.perimeter).toBeCloseTo(16.4, 6);
    expect(space?.volume).toBeCloseTo(44.712, 6);
    const recorded = space?.recorded['Qto_SpaceBaseQuantities'];
    expect(recorded?.['NetFloorArea']).toBeCloseTo(space?.area ?? 0, 6);
    expect(space?.outline[0]).toHaveLength(4);
  });

  it('writes COBie sheets for a families model, and refuses an imported IFC file', async () => {
    const r = await call('export_cobie', { sessionId: 's1', outDir: 'cobie' });
    expect(r.body).toMatchObject({ ok: true, rows: { Space: 1, Floor: 1 } });
    expect(readdirSync(join(project.dir, 'cobie')).sort()).toContain('Space.csv');
    expect(readFileSync(join(project.dir, 'cobie', 'Space.csv'), 'utf8')).toContain('Lobby');
    const again = await call('export_cobie', { sessionId: 's1', outDir: 'cobie' });
    expect(again.body['error']).toBe('FILE_EXISTS');
    const json = await call('export_cobie', { sessionId: 's1', outDir: 'cobie', format: 'json' });
    expect(json.body['files']).toEqual(['cobie.json']);

    const ifc = await call('open_model', { path: INTEROP_IFC });
    const refused = await call('export_cobie', { sessionId: ifc.body['sessionId'], outDir: 'x' });
    expect(refused.body['error']).toBe('NOT_SUPPORTED');
  });
});
