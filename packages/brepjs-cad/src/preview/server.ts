import { createServer, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { sendFile, safeJoin, VIEWER_DIST } from '../snapshot/static.js';

export interface PreviewServer {
  readonly url: string;
  readonly port: number;
  /** Swap the served payload and notify subscribed viewer tabs via SSE. */
  update(payload: ArrayBuffer): void;
  close(): Promise<void>;
}

/**
 * Preview-owned server: serves the built viewer app statically plus two in-memory
 * routes — `/__preview/model` (the current binary payload) and `/__preview/events`
 * (SSE reload pings for `--watch`). Unlike the shared snapshot server there is no
 * `?dir=` dynamic root here, so the filesystem-traversal surface that `/__model/`
 * has to guard never exists on this server. Loopback only.
 */
export function startPreviewServer(
  initial: ArrayBuffer,
  opts: { port?: number } = {}
): Promise<PreviewServer> {
  let current = Buffer.from(initial);
  let seq = 1;
  const clients = new Set<ServerResponse>();

  const handle = async (pathname: string, res: ServerResponse): Promise<void> => {
    if (pathname === '/__preview/model') {
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': current.length,
        'cache-control': 'no-store',
      });
      res.end(current);
      return;
    }
    if (pathname === '/__preview/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      });
      res.write(`data: {"seq":${seq}}\n\n`);
      clients.add(res);
      res.on('close', () => clients.delete(res));
      // A write racing a socket teardown emits 'error' on the response; without a
      // listener that throws process-wide.
      res.on('error', () => clients.delete(res));
      return;
    }
    const abs = safeJoin(VIEWER_DIST, pathname === '/' ? 'index.html' : pathname);
    if (!abs) {
      res.writeHead(403).end('forbidden');
      return;
    }
    await sendFile(res, abs).catch(() =>
      sendFile(res, join(VIEWER_DIST, 'index.html')).catch(() =>
        res.writeHead(404).end('not found')
      )
    );
  };

  return new Promise((resolvePromise, reject) => {
    const server: Server = createServer((req, res) => {
      const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
      void handle(pathname, res).catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end('error');
      });
    });
    server.on('error', reject);
    server.listen(opts.port ?? 0, '127.0.0.1', () => {
      // The promise is settled; a later server error must not call reject on it —
      // report and keep the process (and the watch loop) alive.
      server.removeListener('error', reject);
      server.on('error', (e) => {
        process.stderr.write(`preview server error: ${(e).message}\n`);
      });
      const port = (server.address() as { port: number }).port;
      resolvePromise({
        port,
        url: `http://127.0.0.1:${port}/?preview=1`,
        update(payload) {
          current = Buffer.from(payload);
          seq += 1;
          for (const res of clients) res.write(`data: {"seq":${seq}}\n\n`);
        },
        close: () =>
          new Promise<void>((done, fail) => {
            for (const res of clients) res.end();
            clients.clear();
            server.closeAllConnections();
            server.close((e) => (e ? fail(e) : done()));
          }),
      });
    });
  });
}
