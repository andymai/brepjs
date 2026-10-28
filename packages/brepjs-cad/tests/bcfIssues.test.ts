import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { BimNs } from '@/session/bim.js';
import {
  BcfError,
  bcfCamera,
  issueTopic,
  openContainer,
  packIssue,
  snapshotOf,
  type IssueSpec,
} from '@/session/bcf.js';
import { readZip } from '@/session/zip.js';
import { createBrepMcpServer, type BrepMcpServer } from '@/mcp/createServer.js';
import { VIEWER_DIST } from '@/snapshot/static.js';
import { INTEROP_IFC, makeBimProject, type BimProject } from './bimFixture.js';
import { decodePng } from './png.js';

const bim: BimNs = await import('brepjs-bim');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const CAMERA = bcfCamera({
  projection: 'perspective',
  position: [3000, -4000, 5000],
  direction: [0, 0.6, -0.8],
  up: [0, 0.8, 0.6],
  aspect: 4 / 3,
  fov: 75,
});

function spec(over: Partial<IssueSpec> = {}): IssueSpec {
  return {
    title: 'Wall fire rating',
    topicType: 'Issue',
    topicStatus: 'Open',
    author: 'reviewer@example.com',
    components: [{ ifcGuid: '2ncd8Try1Ve9K_IbTZlUpg', authoringToolId: 'ground/annex' }],
    focus: 'highlight',
    color: 'FF6B00',
    camera: CAMERA,
    snapshot: PNG,
    ...over,
  };
}

const PROJECT = { projectId: 'demo', name: 'Demo' };

describe('BCF containers', () => {
  it('converts a session camera from millimetres to metres', () => {
    expect(CAMERA).toEqual({
      kind: 'PERSPECTIVE',
      viewPoint: [3, -4, 5],
      direction: [0, 0.6, -0.8],
      upVector: [0, 0.8, 0.6],
      aspectRatio: 4 / 3,
      fieldOfView: 75,
    });
    const ortho = bcfCamera({
      projection: 'orthographic',
      position: [0, 0, 10_000],
      direction: [0, 0, -1],
      up: [0, 1, 0],
      aspect: 1.5,
      height: 12_000,
    });
    expect(ortho).toMatchObject({ kind: 'ORTHOGONAL', viewToWorldScale: 12 });
  });

  it('packs a topic with its viewpoint, camera and snapshot, and reads it back', () => {
    const topic = issueTopic(
      spec({ comment: 'Raise to REI90.' }),
      new Date('2026-10-27T12:00:00Z')
    );
    const opened = openContainer(bim, packIssue(bim, topic, PNG, PROJECT));
    expect(opened.container.project).toEqual(PROJECT);
    const [read] = opened.container.topics;
    expect(read).toMatchObject({
      guid: topic.guid,
      title: 'Wall fire rating',
      topicType: 'Issue',
      topicStatus: 'Open',
      creationDate: '2026-10-27T12:00:00.000Z',
      creationAuthor: 'reviewer@example.com',
    });
    const vp = read?.viewpoints[0];
    expect(vp?.camera).toEqual(CAMERA);
    expect(vp?.components?.selection).toEqual([
      {
        ifcGuid: '2ncd8Try1Ve9K_IbTZlUpg',
        authoringToolId: 'ground/annex',
      },
    ]);
    expect(vp?.components?.coloring?.[0]?.color).toBe('FF6B00');
    expect(vp?.components?.visibility?.defaultVisibility).toBe(true);
    expect(read?.comments[0]).toMatchObject({ comment: 'Raise to REI90.', viewpointRef: vp?.guid });
    if (read && vp) expect(snapshotOf(opened, read, vp)).toEqual(PNG);
  });

  it('isolates by hiding everything but the components', () => {
    const topic = issueTopic(spec({ focus: 'isolate' }), new Date());
    const vp = topic.viewpoints[0];
    expect(vp?.components?.coloring).toBeUndefined();
    expect(vp?.components?.visibility).toEqual({
      defaultVisibility: false,
      exceptions: spec().components,
    });
    expect(issueTopic(spec({ components: [] }), new Date()).viewpoints[0]?.components).toBe(
      undefined
    );
  });

  it('adds a topic to an existing file and keeps every other entry as it was', () => {
    const first = packIssue(bim, issueTopic(spec(), new Date()), PNG, PROJECT);
    const second = issueTopic(spec({ title: 'Second' }), new Date());
    const appended = packIssue(
      bim,
      second,
      PNG,
      { projectId: 'other', name: 'Other' },
      openContainer(bim, first)
    );
    const before = readZip(first);
    const after = readZip(appended);
    for (const [path, bytes] of before) expect(after.get(path)).toEqual(bytes);
    const added = [...after.keys()].filter((p) => !before.has(p));
    expect(added.every((p) => p.startsWith(`${second.guid}/`))).toBe(true);
    expect(added).toContain(`${second.guid}/snapshot.png`);
    const { container } = openContainer(bim, appended);
    expect(container.project).toEqual(PROJECT);
    expect(container.topics.map((t) => t.title).sort()).toEqual(['Second', 'Wall fire rating']);
  });

  it('will not write a file too large to read back', () => {
    const first = packIssue(bim, issueTopic(spec(), new Date()), PNG, PROJECT);
    const opened = openContainer(bim, first);
    const size = [...readZip(first).values()].reduce((n, b) => n + b.length, 0);
    const next = issueTopic(spec({ title: 'One too many' }), new Date());
    expect(() => packIssue(bim, next, PNG, PROJECT, opened, { totalBytes: size + 10 })).toThrow(
      /larger than it can be read back/
    );
  });

  it('rejects a file that is not a BCF archive', () => {
    expect(() => openContainer(bim, new Uint8Array([1, 2, 3]))).toThrow(BcfError);
  });
});

type Payload = Record<string, unknown>;

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

describe('create_issue and read_issues', () => {
  let project: BimProject;
  let mcp: BrepMcpServer;
  let client: Client;
  let wallGuid = '';
  const call = async (name: string, args: Payload) => {
    const res = await client.callTool({ name, arguments: args });
    const content = res.content as { type: string; text?: string; data?: string }[];
    return {
      isError: res.isError === true,
      body: JSON.parse(content[0]?.text ?? 'null') as Payload,
      images: content
        .filter((c) => c.type === 'image')
        .map((c) => Buffer.from(c.data ?? '', 'base64')),
    };
  };

  beforeAll(async () => {
    project = makeBimProject('brepjs-cad-bcf-');
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

  it('asks for an export first, since issues name GlobalIds', async () => {
    const r = await call('create_issue', {
      sessionId: 's1',
      outPath: 'issues.bcf',
      title: 'Too early',
      elements: ['ground/annex'],
    });
    expect(r.body['error']).toBe('NOT_EXPORTED');
    const exported = await call('export_ifc', { sessionId: 's1', outPath: 'model.ifc' });
    wallGuid = (exported.body['globalIds'] as Record<string, string>)['ground/annex'] ?? '';
    expect(wallGuid).toHaveLength(22);
  });

  it('reads topics back onto session elements', async () => {
    const topic = issueTopic(
      spec({ components: [{ ifcGuid: wallGuid }, { ifcGuid: '0000000000000000000000' }] }),
      new Date()
    );
    writeFileSync(join(project.dir, 'given.bcf'), packIssue(bim, topic, PNG, PROJECT));
    const r = await call('read_issues', { path: 'given.bcf', sessionId: 's1' });
    expect(r.body).toMatchObject({ topicsTotal: 1, unresolvedSelections: 1 });
    const [view] = r.body['topics'] as {
      viewpoints: { selection: { components: { globalId: string; id?: string }[] } }[];
    }[];
    expect(view?.viewpoints[0]?.selection.components).toEqual([
      { globalId: wallGuid, id: 'ground/annex' },
      { globalId: '0000000000000000000000' },
    ]);
    const many = issueTopic(
      spec({
        comment: 'See the selection.',
        components: Array.from({ length: 150 }, (_, i) => ({
          ifcGuid: String(i).padStart(22, '0'),
        })),
      }),
      new Date()
    );
    writeFileSync(join(project.dir, 'many.bcf'), packIssue(bim, many, PNG, PROJECT));
    const capped = await call('read_issues', { path: 'many.bcf' });
    const [first] = capped.body['topics'] as {
      comments: { viewpoint?: string }[];
      viewpoints: {
        guid: string;
        selection: { components: unknown[]; componentsTotal?: number };
      }[];
    }[];
    expect(first?.viewpoints[0]?.selection.components).toHaveLength(100);
    expect(first?.viewpoints[0]?.selection.componentsTotal).toBe(150);
    expect(first?.comments[0]?.viewpoint).toBe(first?.viewpoints[0]?.guid);
    const whole = await call('read_issues', { path: 'many.bcf', topic: many.guid });
    const [all] = whole.body['topics'] as {
      viewpoints: { selection: { components: unknown[]; componentsTotal?: number } }[];
    }[];
    expect(all?.viewpoints[0]?.selection.components).toHaveLength(150);
    expect(all?.viewpoints[0]?.selection.componentsTotal).toBeUndefined();
    const bare = await call('read_issues', { path: 'given.bcf' });
    expect(bare.body['unresolvedSelections']).toBeUndefined();
    const wrong = await call('read_issues', { path: 'model.ifc' });
    expect(wrong.body['error']).toBe('INVALID_ARGUMENT');
  });

  it.skipIf(!canRender)(
    'raises issues into one file, with a camera that frames the snapshot',
    async () => {
      const first = await call('create_issue', {
        sessionId: 's1',
        outPath: 'issues.bcf',
        title: 'Annex wall fire rating',
        elements: ['ground/annex'],
        priority: 'High',
        dueDate: '2026-11-15',
      });
      expect(first.body).toMatchObject({ ok: true, appended: false, topics: 1, elements: 1 });
      expect(first.images).toHaveLength(1);
      const second = await call('create_issue', {
        sessionId: 's1',
        outPath: 'issues.bcf',
        title: 'Lobby walls',
        elements: ['ground/lobby'],
        focus: 'isolate',
      });
      expect(second.body).toMatchObject({ appended: true, topics: 2 });

      const opened = openContainer(bim, readFileSync(join(project.dir, 'issues.bcf')));
      const topic = opened.container.topics.find((t) => t.title === 'Annex wall fire rating');
      const vp = topic?.viewpoints[0];
      expect(topic?.dueDate).toBe('2026-11-15T00:00:00.000Z');
      expect(vp?.components?.selection?.[0]?.ifcGuid).toBe(wallGuid);
      const png = topic && vp ? snapshotOf(opened, topic, vp) : undefined;
      const camera = vp?.camera;
      if (!png || camera?.kind !== 'PERSPECTIVE') throw new Error('no snapshot or camera');
      // The wall's corners, through the BCF camera, bound the orange wall in the snapshot. A
      // box's silhouette bounds are its projected corners' bounds, so this checks the camera
      // itself; a centre-vs-centroid check drifts with framing (nearer faces weigh more).
      // ground/annex spans x 5000..9000, y 0..200, z 0..2700 mm
      const corners = [5, 9].flatMap((x) =>
        [0, 0.2].flatMap((y) => [0, 2.7].map((z) => project3(camera, [x, y, z], 1200, 900)))
      );
      const projected = boundsOf(corners);
      const seen = orangeBounds(decodePng(png));
      const size = Math.hypot(projected.maxX - projected.minX, projected.maxY - projected.minY);
      for (const edge of ['minX', 'minY', 'maxX', 'maxY'] as const) {
        expect(Math.abs(projected[edge] - seen[edge])).toBeLessThan(0.03 * size);
      }
    }
  );

  it.skipIf(!canRender)('raises an issue on an IFC element by its GlobalId', async () => {
    const opened = await call('open_model', { path: INTEROP_IFC });
    const r = await call('create_issue', {
      sessionId: opened.body['sessionId'],
      outPath: 'ifc.bcf',
      title: 'IFC wall',
      elements: ['2XAz8MTt9Q9ubMaPpMza8b'],
    });
    expect(r.body).toMatchObject({ ok: true, globalIds: ['2XAz8MTt9Q9ubMaPpMza8b'] });
    const read = await call('read_issues', {
      path: 'ifc.bcf',
      sessionId: opened.body['sessionId'],
      snapshots: true,
    });
    expect(read.body['unresolvedSelections']).toBe(0);
    expect(read.images).toHaveLength(1);
  });
});

function project3(
  c: {
    viewPoint: readonly number[];
    direction: readonly number[];
    upVector: readonly number[];
    fieldOfView: number;
    aspectRatio: number;
  },
  p: readonly number[],
  width: number,
  height: number
): [number, number] {
  const [dx = 0, dy = 0, dz = 0] = c.direction;
  const [ux = 0, uy = 0, uz = 0] = c.upVector;
  const right = [dy * uz - dz * uy, dz * ux - dx * uz, dx * uy - dy * ux];
  const v = p.map((x, i) => x - (c.viewPoint[i] ?? 0));
  const dot = (a: readonly number[], b: readonly number[]) =>
    a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
  const depth = dot(v, c.direction);
  const t = Math.tan((c.fieldOfView * Math.PI) / 360);
  const x = dot(v, right) / (depth * t * c.aspectRatio);
  const y = dot(v, c.upVector) / (depth * t);
  return [((x + 1) / 2) * width, ((1 - y) / 2) * height];
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boundsOf(points: readonly (readonly [number, number])[]): Bounds {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function orangeBounds(png: ReturnType<typeof decodePng>): Bounds {
  const hits: [number, number][] = [];
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * png.channels;
      const r = png.pixels[i] ?? 0;
      const g = png.pixels[i + 1] ?? 0;
      const b = png.pixels[i + 2] ?? 0;
      if (r > 110 && g < r * 0.7 && b < r * 0.35) hits.push([x, y]);
    }
  }
  return boundsOf(hits);
}
