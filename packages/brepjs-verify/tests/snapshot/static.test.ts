import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  startStaticServer,
  SERVER_API_VERSION,
  type StaticServer,
  type ServerDescriptor,
} from '../../src/snapshot/static.js';

let server: StaticServer;
let modelRoot: string;
beforeEach(async () => {
  modelRoot = mkdtempSync(join(tmpdir(), 'brepjs-agent-static-'));
  mkdirSync(join(modelRoot, 'sub'), { recursive: true });
  writeFileSync(join(modelRoot, 'sub', 'part.step'), 'ISO-10303-21;\n');
  server = await startStaticServer({ port: 0 });
});
afterEach(async () => {
  await server.close();
  rmSync(modelRoot, { recursive: true, force: true });
});
const enc = encodeURIComponent;
async function get(path: string) {
  const r = await fetch(`http://127.0.0.1:${server.port}${path}`);
  return { status: r.status, body: await r.text(), contentType: r.headers.get('content-type') ?? undefined };
}

describe('static server', () => {
  it('exposes a compatible registry descriptor', async () => {
    const { status, body, contentType } = await get('/__cad/server');
    expect(status).toBe(200);
    expect(contentType).toContain('application/json');
    const d = JSON.parse(body) as ServerDescriptor;
    expect(d.app).toBe('brepjs-verify-viewer');
    expect(d.port).toBe(server.port);
    expect(d.dynamicRoot).toBe(true);
    expect(d.serverApiVersion).toBeGreaterThanOrEqual(SERVER_API_VERSION);
  });
  it('serves a model file under an absolute ?dir= root with MIME', async () => {
    const { status, body, contentType } = await get(`/__model/sub/part.step?dir=${enc(modelRoot)}`);
    expect(status).toBe(200);
    expect(body).toContain('ISO-10303-21');
    expect(contentType).toContain('application/step');
  });
  it('rejects path traversal with 403', async () => {
    expect((await get(`/__model/../../../../etc/passwd?dir=${enc(modelRoot)}`)).status).toBe(403);
  });
  it('404s an unknown model file', async () => {
    expect((await get(`/__model/nope.glb?dir=${enc(modelRoot)}`)).status).toBe(404);
  });
  it('serves the SPA on the root page even with a ?dir=&file= query (not 403)', async () => {
    // Regression: the viewer's own page URL is `/?dir=<abs>&file=<rel>`; an over-broad guard
    // 403'd it, so the app never loaded. Root page must not be rejected for carrying the query.
    // (200 when viewer/dist is built, 404 when not — never 403.)
    const { status } = await get(`/?dir=${enc(modelRoot)}&file=sub/part.step`);
    expect(status).not.toBe(403);
  });
});
