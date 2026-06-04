import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, resolve, sep, extname } from 'node:path';

export const SERVER_API_VERSION = 1;
const moduleDir = dirname(fileURLToPath(import.meta.url));
const VIEWER_DIST = resolve(moduleDir, '../../viewer/dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.step': 'application/step',
  '.stp': 'application/step',
  '.stl': 'model/stl',
  '.obj': 'text/plain; charset=utf-8',
};
const mimeFor = (p: string): string => MIME[extname(p).toLowerCase()] ?? 'application/octet-stream';

export interface StaticServerOptions {
  port?: number;
}
export interface StaticServer {
  port: number;
  url: string;
  close(): Promise<void>;
}
export interface ServerDescriptor {
  app: 'brepjs-verify-viewer';
  port: number;
  dynamicRoot: true;
  serverApiVersion: number;
}

async function sendFile(res: ServerResponse, absPath: string): Promise<void> {
  const info = await stat(absPath);
  if (!info.isFile()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': mimeFor(absPath), 'content-length': info.size });
  createReadStream(absPath).pipe(res);
}

function safeJoin(root: string, rel: string): string | null {
  const abs = resolve(root, normalize(decodeURIComponent(rel.replace(/^\/+/, ''))));
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}

async function handle(req: IncomingMessage, res: ServerResponse, port: number): Promise<void> {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  if (url.pathname === '/__cad/server') {
    const d: ServerDescriptor = { app: 'brepjs-verify-viewer', port, dynamicRoot: true, serverApiVersion: SERVER_API_VERSION };
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(d));
    return;
  }
  if (url.pathname.startsWith('/__model/')) {
    const root = url.searchParams.get('dir');
    if (!root) {
      res.writeHead(400).end('missing dir');
      return;
    }
    const abs = safeJoin(resolve(root), url.pathname.slice('/__model'.length));
    if (!abs) {
      res.writeHead(403).end('forbidden');
      return;
    }
    await sendFile(res, abs).catch(() => res.writeHead(404).end('not found'));
    return;
  }
  // The viewer page loads as `/?dir=<abs>&file=<rel>` — the SPA reads dir/file from its own query
  // (model bytes come from the `/__model/` route above), so a query on the ROOT path is expected.
  // A `?dir=` on any OTHER path means a `../` traversal normalized away the `/__model` prefix — reject it.
  if (url.searchParams.has('dir') && url.pathname !== '/') {
    res.writeHead(403).end('forbidden');
    return;
  }
  const rel = url.pathname === '/' ? 'index.html' : url.pathname;
  const abs = safeJoin(VIEWER_DIST, rel);
  if (!abs) {
    res.writeHead(403).end('forbidden');
    return;
  }
  // SPA fallback so ?dir=&file= bare paths still serve index.html.
  await sendFile(res, abs).catch(() =>
    sendFile(res, join(VIEWER_DIST, 'index.html')).catch(() => res.writeHead(404).end('not found')),
  );
}

export function startStaticServer(opts: StaticServerOptions = {}): Promise<StaticServer> {
  return new Promise((resolvePromise, reject) => {
    const server: Server = createServer((req, res) => {
      void handle(req, res, (server.address() as { port: number }).port);
    });
    server.on('error', reject);
    server.listen(opts.port ?? 0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolvePromise({
        port,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((done, fail) => server.close((e) => (e ? fail(e) : done()))),
      });
    });
  });
}
